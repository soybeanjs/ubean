import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  compileLocalePaths,
  extractLocaleFromPath,
  localizePath,
  getVueLocaleParam,
  toVueRouterLocalePath,
  localeSegment,
  localeFromSegment,
  localeSegments
} from '../src/paths';
import type { LocaleRoutingConfig } from '../src/types';

const cfg = (strategy: LocaleRoutingConfig['strategy']): LocaleRoutingConfig => ({
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy
});

/** BCP-47 identity + shorter URL segment, the case `paths` exists for. */
const cfgWithPaths = (strategy: LocaleRoutingConfig['strategy']): LocaleRoutingConfig => ({
  defaultLocale: 'en',
  locales: ['en', 'zh-CN', 'pt-BR'],
  strategy,
  paths: { 'zh-CN': 'zh', 'pt-BR': 'pt' }
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

describe('paths override (code stays BCP-47, URL uses a short segment)', () => {
  it('localeSegment / localeFromSegment default to the code', () => {
    expect(localeSegment('zh-CN')).toBe('zh-CN');
    expect(localeSegment('zh-CN', { 'zh-CN': 'zh' })).toBe('zh');
    expect(localeFromSegment('zh', ['en', 'zh-CN'], { 'zh-CN': 'zh' })).toBe('zh-CN');
    expect(localeFromSegment('zh-CN', ['en', 'zh-CN'], { 'zh-CN': 'zh' })).toBeNull();
    expect(localeFromSegment('de', ['en', 'zh-CN'], { 'zh-CN': 'zh' })).toBeNull();
  });

  it('localeSegments maps every locale in config order', () => {
    expect(localeSegments(cfgWithPaths('prefix'))).toEqual(['en', 'zh', 'pt']);
    expect(localeSegments(cfg('prefix'))).toEqual(['en', 'zh']);
  });

  it('vue param and hono paths use the segment, not the code', () => {
    const compiled = compileLocalePaths('/about', cfgWithPaths('prefix'));
    expect(compiled.vuePath).toBe('/:locale(en|zh|pt)/about');
    expect(compiled.hono.map(h => h.path).sort()).toEqual(['/en/about', '/pt/about', '/zh/about']);
    // `locale` keeps the BCP-47 identity so catalogs / cookies stay unambiguous.
    expect(compiled.hono.map(h => h.locale).sort()).toEqual(['en', 'pt-BR', 'zh-CN']);
  });

  it('extractLocaleFromPath returns the code for a segment URL', () => {
    expect(extractLocaleFromPath('/zh/about', ['en', 'zh-CN'], { 'zh-CN': 'zh' })).toEqual({
      locale: 'zh-CN',
      pathWithoutLocale: '/about'
    });
  });

  it('localizePath writes the segment', () => {
    expect(localizePath('/about', 'zh-CN', cfgWithPaths('prefix'))).toBe('/zh/about');
    expect(localizePath('/zh/about', 'pt-BR', cfgWithPaths('prefix'))).toBe('/pt/about');
    expect(localizePath('/about', 'en', cfgWithPaths('prefix_except_default'))).toBe('/about');
  });

  it('prefix_and_default default locale stays unprefixed even when it has a segment', () => {
    const cfgDefault = { ...cfgWithPaths('prefix_and_default'), defaultLocale: 'zh-CN' };
    expect(localizePath('/about', 'zh-CN', cfgDefault)).toBe('/about');
    expect(localizePath('/about', 'en', cfgDefault)).toBe('/en/about');
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
