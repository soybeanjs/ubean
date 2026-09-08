/**
 * 静态 SSG entry 代码生成测试（docs/ssg.md T1.1）。
 *
 * 覆盖：
 * - `buildStaticSsgEntry`：内容断言（无 Hono / 无 API routes glob /
 *   含 renderStaticPage 导出 / 含 NotFound catch-all / loader 警告）
 * - `buildRendererSetup`：ssrEnabled=false 分支 / notFoundCatchAll 开关
 * - `buildAssetTagsSetup`：favicon 序列化
 */
import { describe, it, expect } from 'vitest';
import { buildAssetTagsSetup, buildRendererSetup, buildStaticSsgEntry } from '../src/ssg-entry';

const baseInput = {
  pagesGlob: `'/src/pages/**/*.vue'`,
  layoutsGlob: `'/src/layouts/**/*.vue'`,
  srcPrefix: `'/src'`,
  pagesJson: `[{ "relativePath": "index.vue", "name": "index", "route": "/", "layout": undefined, "isReuse": false }]`,
  layoutsJson: `[{ "name": "default", "relativePath": "default.vue", "isDefault": true }]`,
  notFoundPageJson: `{ "relativePath": "404.vue", "name": "NotFound", "route": "/404" }`,
  localeVueParam: '',
  contentBootstrap: '',
  colorModeScript: '',
  favicon: '/favicon.ico'
};

describe('buildStaticSsgEntry()', () => {
  const entry = buildStaticSsgEntry(baseInput);

  it('exports renderStaticPage (the static renderer contract)', () => {
    expect(entry).toContain('export async function renderStaticPage');
  });

  it('does not instantiate a Hono app', () => {
    expect(entry).not.toContain('createUbeanApp');
    expect(entry).not.toContain("from 'hono'");
    expect(entry).not.toContain('createFetchHandler');
  });

  it('does not include API routes / middleware / crons globs', () => {
    expect(entry).not.toContain('/routes/**');
    expect(entry).not.toContain('/middleware/**');
    expect(entry).not.toContain('/crons/**');
    expect(entry).not.toContain('routeLoaders');
    expect(entry).not.toContain('middlewareLoaders');
  });

  it('includes pages/layouts globs and loaders', () => {
    expect(entry).toContain('import.meta.glob');
    expect(entry).toContain('pageLoaders');
    expect(entry).toContain('layoutLoaders');
  });

  it('adds the NotFound static route (beats root catch-all pages)', () => {
    expect(entry).toContain("toVueRouterLocalePath('/404'");
    expect(entry).toContain(": '/404'");
    expect(entry).toContain("name: 'NotFound'");
  });

  it('warns once per page exporting a loader', () => {
    expect(entry).toContain('exports `loader`');
    expect(entry).toContain('_loaderWarned');
  });

  it('injects the color-mode script when provided', () => {
    const withScript = buildStaticSsgEntry({ ...baseInput, colorModeScript: '<script>window.__x=1</script>' });
    expect(withScript).toContain('const _colorModeScript = "<script>window.__x=1</script>"');
    expect(withScript).toContain("html.replace('<head>'");
  });

  it('serializes an empty color-mode script when disabled', () => {
    expect(entry).toContain('const _colorModeScript = "";');
  });

  it('serializes the favicon into asset tags', () => {
    expect(entry).toContain(`favicon: "/favicon.ico"`);
  });

  it('includes i18n locale loading for the render context', () => {
    expect(entry).toContain('_ensureLocales');
    expect(entry).toContain('renderContext.locale');
  });
});

describe('buildRendererSetup()', () => {
  it('returns a null page renderer when ssr is disabled', () => {
    const code = buildRendererSetup({ ssrEnabled: false, mode: 'spa', localeVueParam: '' });
    expect(code).toContain('const _pageRenderer = null;');
    expect(code).not.toContain('_rendererRoutes');
  });

  it('builds renderer routes when ssr is enabled', () => {
    const code = buildRendererSetup({ ssrEnabled: true, mode: 'fullstack', localeVueParam: '' });
    expect(code).toContain('const _rendererRoutes = _pages.map');
    expect(code).toContain('createVueRenderer');
  });

  it('omits the NotFound route by default (fullstack entry)', () => {
    const code = buildRendererSetup({ ssrEnabled: true, mode: 'fullstack', localeVueParam: '' });
    expect(code).not.toContain("'/404'");
    expect(code).not.toContain("name: 'NotFound'");
  });

  it('adds the NotFound static route when notFoundCatchAll is set (static entry)', () => {
    const code = buildRendererSetup({
      ssrEnabled: true,
      mode: 'ssg',
      localeVueParam: '',
      notFoundCatchAll: true
    });
    expect(code).toContain("toVueRouterLocalePath('/404'");
    expect(code).toContain(": '/404'");
    expect(code).toContain("name: 'NotFound'");
    expect(code).toContain('if (_notFoundPage)');
  });

  it('applies the locale vue param when provided', () => {
    const code = buildRendererSetup({
      ssrEnabled: true,
      mode: 'ssg',
      localeVueParam: ':locale(zh)?',
      notFoundCatchAll: true
    });
    expect(code).toContain('":locale(zh)?"');
    expect(code).toContain('toVueRouterLocalePath');
  });
});

describe('buildAssetTagsSetup()', () => {
  it('serializes the favicon href', () => {
    const code = buildAssetTagsSetup('/favicon.ico');
    expect(code).toContain(`favicon: "/favicon.ico"`);
  });

  it('defaults the favicon to undefined when not provided', () => {
    const code = buildAssetTagsSetup();
    expect(code).toContain('favicon: undefined');
  });

  it('reads the client manifest relative to the entry', () => {
    const code = buildAssetTagsSetup();
    expect(code).toContain("'.vite', 'manifest.json'");
    expect(code).toContain("'..', 'public'");
  });
});
