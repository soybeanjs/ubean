import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * OPT-04 4a — @ubean/config 解析器单元测试
 *
 * 覆盖 resolveSsrConfig / resolveRoutingConfig / resolvePrerenderConfig /
 * resolveDevToolsConfig / resolveFavicon / routingConfigDefaults / DEFAULT_PRERENDER_EXCLUDE。
 *
 * 这些函数是配置加载链的核心纯函数，被 CLI / builder / dev-server / prerender 等包复用。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveSsrConfig,
  resolvePrerenderConfig,
  resolveDevToolsConfig,
  resolveFavicon,
  DEFAULT_PRERENDER_EXCLUDE
} from '../src/loader';
import { resolveRoutingConfig, routingConfigDefaults } from '../src/routing';

describe('resolveSsrConfig()', () => {
  it('true → enabled, all=true, exclude=[], streaming=false', () => {
    expect(resolveSsrConfig(true)).toEqual({
      enabled: true,
      all: true,
      exclude: [],
      streaming: false
    });
  });

  it('undefined → 同 true（默认启用）', () => {
    expect(resolveSsrConfig(undefined)).toEqual({
      enabled: true,
      all: true,
      exclude: [],
      streaming: false
    });
  });

  it('false → enabled=false, all=false', () => {
    expect(resolveSsrConfig(false)).toEqual({
      enabled: false,
      all: false,
      exclude: [],
      streaming: false
    });
  });

  it('对象 { all: false } → enabled=false, all=false', () => {
    expect(resolveSsrConfig({ all: false })).toEqual({
      enabled: false,
      all: false,
      exclude: [],
      streaming: false
    });
  });

  it('对象 { exclude: [...] } → 保留 exclude，all 默认 true', () => {
    expect(resolveSsrConfig({ exclude: ['/admin/**'] })).toEqual({
      enabled: true,
      all: true,
      exclude: ['/admin/**'],
      streaming: false
    });
  });

  it('对象 { streaming: true } → streaming=true', () => {
    expect(resolveSsrConfig({ streaming: true }).streaming).toBe(true);
  });

  it('对象 { all: true, exclude: [...] } → 完整合并', () => {
    expect(resolveSsrConfig({ all: true, exclude: ['/a', '/b'] })).toEqual({
      enabled: true,
      all: true,
      exclude: ['/a', '/b'],
      streaming: false
    });
  });
});

describe('resolveRoutingConfig()', () => {
  it('undefined → 返回默认值副本', () => {
    const result = resolveRoutingConfig();
    expect(result).toEqual(routingConfigDefaults);
    // 确保是副本，而非引用
    expect(result).not.toBe(routingConfigDefaults);
  });

  it('用户配置覆盖默认值', () => {
    const result = resolveRoutingConfig({ mode: 'file', outputDir: 'custom/dir' });
    expect(result.mode).toBe('file');
    expect(result.outputDir).toBe('custom/dir');
    // 未覆盖的保留默认值
    expect(result.generateBuiltinRoutes).toBe(true);
    expect(result.defaultLayout).toBe('default');
  });

  it('函数字段不被 spread 覆盖', () => {
    const getRouteName = () => 'custom';
    const result = resolveRoutingConfig({ getRouteName });
    expect(result.getRouteName).toBe(getRouteName);
  });

  it('未提供函数字段时不挂载', () => {
    const result = resolveRoutingConfig({});
    expect(result.getRouteName).toBeUndefined();
    expect(result.onGenerated).toBeUndefined();
  });

  it('routingConfigDefaults 含全部必需字段', () => {
    expect(routingConfigDefaults).toHaveProperty('mode', 'virtual');
    expect(routingConfigDefaults).toHaveProperty('outputDir');
    expect(routingConfigDefaults).toHaveProperty('generateBuiltinRoutes', true);
    expect(routingConfigDefaults).toHaveProperty('defaultLayout', 'default');
    expect(routingConfigDefaults).toHaveProperty('routeLazy', true);
    expect(routingConfigDefaults).toHaveProperty('layoutLazy', true);
    expect(routingConfigDefaults).toHaveProperty('watchFile', true);
    expect(routingConfigDefaults).toHaveProperty('fileUpdateDuration', 100);
  });
});

describe('resolvePrerenderConfig()', () => {
  it('undefined → enabled=false', () => {
    const result = resolvePrerenderConfig();
    expect(result.enabled).toBe(false);
    expect(result.all).toBe(false);
  });

  it('空对象 → enabled=false', () => {
    expect(resolvePrerenderConfig({}).enabled).toBe(false);
  });

  it('{ all: true } → enabled=true, all=true', () => {
    const result = resolvePrerenderConfig({ all: true });
    expect(result.enabled).toBe(true);
    expect(result.all).toBe(true);
  });

  it('{ include: [...] } → enabled=true', () => {
    const result = resolvePrerenderConfig({ include: ['/about'] });
    expect(result.enabled).toBe(true);
    expect(result.include).toEqual(['/about']);
  });

  it('exclude 自动合并 DEFAULT_PRERENDER_EXCLUDE', () => {
    const result = resolvePrerenderConfig({ exclude: ['/custom/**'] });
    // 默认排除 + 用户排除
    expect(result.exclude).toContain('/api/**');
    expect(result.exclude).toContain('/_**');
    expect(result.exclude).toContain('/custom/**');
    expect(result.exclude.length).toBe(DEFAULT_PRERENDER_EXCLUDE.length + 1);
  });

  it('未提供 exclude → 仅默认排除', () => {
    const result = resolvePrerenderConfig();
    expect(result.exclude).toEqual(DEFAULT_PRERENDER_EXCLUDE);
  });

  it('crawlLinks 默认 true', () => {
    expect(resolvePrerenderConfig().crawlLinks).toBe(true);
  });

  it('concurrency 默认 4', () => {
    expect(resolvePrerenderConfig().concurrency).toBe(4);
  });

  it('staticDir 默认 dist/public', () => {
    expect(resolvePrerenderConfig().staticDir).toBe('dist/public');
  });
});

describe('DEFAULT_PRERENDER_EXCLUDE', () => {
  it('包含 /api/**', () => {
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/api/**');
  });

  it('包含 /_**', () => {
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/_**');
  });

  it('包含 robots/sitemap/favicon/manifest', () => {
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/robots.txt');
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/sitemap.xml');
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/favicon.ico');
    expect(DEFAULT_PRERENDER_EXCLUDE).toContain('/manifest.webmanifest');
  });
});

describe('resolveDevToolsConfig()', () => {
  it('true → enabled=true, 默认 route', () => {
    expect(resolveDevToolsConfig(true)).toEqual({
      enabled: true,
      route: '/_devtools',
      ai: { enabled: false }
    });
  });

  it('undefined → enabled=false', () => {
    expect(resolveDevToolsConfig(undefined).enabled).toBe(false);
  });

  it('false → enabled=false', () => {
    expect(resolveDevToolsConfig(false).enabled).toBe(false);
  });

  it('对象 { enabled: true } → enabled=true', () => {
    expect(resolveDevToolsConfig({ enabled: true }).enabled).toBe(true);
  });

  it('对象自定义 route', () => {
    expect(resolveDevToolsConfig({ enabled: true, route: '/custom-devtools' }).route).toBe('/custom-devtools');
  });

  it('对象 ai.enabled 透传', () => {
    const result = resolveDevToolsConfig({ enabled: true, ai: { enabled: true, model: 'gpt-4' } });
    expect(result.ai?.enabled).toBe(true);
    expect(result.ai?.model).toBe('gpt-4');
  });

  it('对象未提供 ai → ai.enabled=false', () => {
    expect(resolveDevToolsConfig({ enabled: true }).ai?.enabled).toBe(false);
  });
});

describe('resolveFavicon()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ubean-favicon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('false → null（禁用）', () => {
    expect(resolveFavicon(false, tmpDir)).toBeNull();
  });

  it('string → 直接返回该路径', () => {
    expect(resolveFavicon('/icons/my-icon.png', tmpDir)).toBe('/icons/my-icon.png');
  });

  it('true + public 目录有 favicon.ico → /favicon.ico', () => {
    writeFileSync(join(tmpDir, 'favicon.ico'), 'fake');
    expect(resolveFavicon(true, tmpDir)).toBe('/favicon.ico');
  });

  it('true + 仅有 favicon.svg → /favicon.svg', () => {
    writeFileSync(join(tmpDir, 'favicon.svg'), '<svg/>');
    expect(resolveFavicon(true, tmpDir)).toBe('/favicon.svg');
  });

  it('优先级：favicon.ico > favicon.svg > favicon.png', () => {
    writeFileSync(join(tmpDir, 'favicon.svg'), '<svg/>');
    writeFileSync(join(tmpDir, 'favicon.ico'), 'fake');
    writeFileSync(join(tmpDir, 'favicon.png'), 'fake');
    expect(resolveFavicon(true, tmpDir)).toBe('/favicon.ico');
  });

  it('true + 目录为空 → null', () => {
    expect(resolveFavicon(true, tmpDir)).toBeNull();
  });

  it('undefined → 同 true（自动检测）', () => {
    writeFileSync(join(tmpDir, 'favicon.ico'), 'fake');
    expect(resolveFavicon(undefined, tmpDir)).toBe('/favicon.ico');
  });
});
