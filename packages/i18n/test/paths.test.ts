import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  compileLocalePaths,
  extractLocaleFromPath,
  localizePath,
  getVueLocaleParam,
  toVueRouterLocalePath
} from '../src/paths';
import type { LocaleRoutingConfig } from '../src/types';

const cfg = (strategy: LocaleRoutingConfig['strategy']): LocaleRoutingConfig => ({
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy
});

describe('compileLocalePaths()', () => {
  it('prefix_except_default: /about + /:locale(zh)/about；hono 不含 /en/about', () => {
    const compiled = compileLocalePaths('/about', cfg('prefix_except_default'));
    expect(compiled.vuePath).toBe('/:locale(zh)?/about');
    expect(compiled.hono.map(h => h.path).sort()).toEqual(['/about', '/zh/about']);
    expect(compiled.hono.find(h => h.path === '/en/about')).toBeUndefined();
  });

  it('prefix: 仅带前缀', () => {
    const compiled = compileLocalePaths('/about', cfg('prefix'));
    expect(compiled.vuePath).toBe('/:locale(en|zh)/about');
    expect(compiled.hono.map(h => h.path).sort()).toEqual(['/en/about', '/zh/about']);
  });

  it('prefix_and_default: 无前缀 + 全部带前缀', () => {
    const compiled = compileLocalePaths('/about', cfg('prefix_and_default'));
    expect(compiled.vuePath).toBe('/:locale(en|zh)?/about');
    expect(compiled.hono.map(h => h.path).sort()).toEqual(['/about', '/en/about', '/zh/about']);
    expect(compiled.hono.find(h => h.path === '/about')?.isDefault).toBe(true);
  });

  it('no_prefix: 仅一条', () => {
    const compiled = compileLocalePaths('/about', cfg('no_prefix'));
    expect(compiled.vuePath).toBe('/about');
    expect(compiled.hono).toEqual([{ path: '/about', locale: 'en', isDefault: true }]);
  });

  it('index / 与 catch-all', () => {
    expect(compileLocalePaths('/', cfg('prefix_except_default')).vuePath).toBe('/:locale(zh)?');
    expect(toVueRouterLocalePath('/:pathMatch(.*)*', getVueLocaleParam(cfg('prefix_except_default')))).toBe(
      '/:locale(zh)?/:pathMatch(.*)*'
    );
  });
});

describe('extractLocaleFromPath / localizePath', () => {
  it('白名单 code 才当 locale 段', () => {
    expect(extractLocaleFromPath('/zh/about', ['en', 'zh'])).toEqual({
      locale: 'zh',
      pathWithoutLocale: '/about'
    });
    expect(extractLocaleFromPath('/fr/about', ['en', 'zh'])).toEqual({
      locale: null,
      pathWithoutLocale: '/fr/about'
    });
  });

  it('localizePath prefix_except_default 默认无前缀', () => {
    expect(localizePath('/about', 'en', cfg('prefix_except_default'))).toBe('/about');
    expect(localizePath('/about', 'zh', cfg('prefix_except_default'))).toBe('/zh/about');
  });

  it('localizePath prefix_and_default 默认仍无前缀（canonical）', () => {
    expect(localizePath('/about', 'en', cfg('prefix_and_default'))).toBe('/about');
    expect(localizePath('/about', 'zh', cfg('prefix_and_default'))).toBe('/zh/about');
  });
});

describe('browser entry', () => {
  it('打包产物不引用 ALS / @intlify/core', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, '../dist/browser.js'), 'utf8');
    expect(src).not.toMatch('node:async_hooks');
    expect(src).not.toMatch('@intlify/core');
    expect(src).not.toMatch('routing-');
  });
});
