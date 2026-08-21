/**
 * OPT-04 4b — @ubean/build codegen 虚拟模块快照单测
 *
 * 覆盖 createRoutingVirtualModule / createPagesVirtualModule /
 * createMetaVirtualModule / createAppVirtualModule / createLocalesVirtualModule。
 *
 * 对生成的字符串做断言（关键结构 + 不可变基线），锁定 codegen 输出形态。
 * 不做整串快照（含绝对路径/CWD 敏感内容），改为对关键片段断言。
 */
import { describe, it, expect } from 'vitest';
import type { CompiledRoute, CompiledPage, CompiledLayout, CompiledMiddleware } from '@ubean/routes';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLocale } from '@ubean/scan';
import {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from '../src/virtual-modules';

const CWD = '/project';

describe('createRoutingVirtualModule()', () => {
  it('生成 routes + middlewares 导出', async () => {
    const routes: CompiledRoute[] = [
      { method: 'GET', path: '/users', id: 'GET /users', filePath: '/project/src/routes/users.ts' }
    ];
    const middlewares: CompiledMiddleware[] = [
      { path: '/*', filePath: '/project/src/middleware/global.ts', order: 0, global: true }
    ];
    const mod = createRoutingVirtualModule(routes, middlewares, CWD);
    const code = await mod.load();

    expect(code).toContain('export const routes = [');
    expect(code).toContain('export const middlewares = [');
    expect(code).toContain('export default { routes, middlewares }');
    // 路径被转成项目相对路径（portable）；生成的是 JS 对象字面量简写（key 无引号）
    expect(code).toContain('filePath: "src/routes/users.ts"');
    expect(code).toContain('filePath: "src/middleware/global.ts"');
    expect(code).not.toContain(CWD);
  });

  it('空 routes/middlewares → 空数组', async () => {
    const mod = createRoutingVirtualModule([], [], CWD);
    const code = await mod.load();
    // routesCode/mwCode 为空字符串时，模板 `[\n${code}\n]` 产生 `[\n\n]`
    expect(code).toContain('export const routes = [\n\n];');
    expect(code).toContain('export const middlewares = [\n\n];');
  });

  it('id 为 ubean:routes', () => {
    const mod = createRoutingVirtualModule([], [], CWD);
    expect(mod.id).toBe('ubean:routes');
  });
});

describe('createPagesVirtualModule()', () => {
  it('生成 pages + layouts + RouteName/LayoutName 类型', async () => {
    const pages: CompiledPage[] = [
      {
        name: 'About',
        path: '/about',
        filePath: '/project/src/pages/about.vue',
        layout: 'default',
        reuseTarget: undefined
      }
    ];
    const layouts: CompiledLayout[] = [
      { name: 'default', filePath: '/project/src/layouts/default.vue', isDefault: true }
    ];
    const mod = createPagesVirtualModule(pages, layouts, CWD);
    const code = await mod.load();

    expect(code).toContain('export const pages = {');
    expect(code).toContain('"About"');
    expect(code).toContain('export const layouts = {');
    expect(code).toContain('export type RouteName = "About"');
    expect(code).toContain('export type LayoutName = "default"');
    // 路径 portable
    expect(code).toContain('src/pages/about.vue');
    expect(code).not.toContain(CWD);
  });

  it('空 pages/layouts → RouteName/LayoutName 回退为 string', async () => {
    const mod = createPagesVirtualModule([], [], CWD);
    const code = await mod.load();
    expect(code).toContain('export type RouteName = string');
    expect(code).toContain('export type LayoutName = string');
  });

  it('id 为 ubean:pages', () => {
    expect(createPagesVirtualModule([], [], CWD).id).toBe('ubean:pages');
  });
});

describe('createMetaVirtualModule()', () => {
  it('生成 UBEAN_VERSION 与 default 导出', async () => {
    const mod = createMetaVirtualModule();
    const code = await mod.load();
    expect(code).toContain('export const UBEAN_VERSION = "0.0.1"');
    expect(code).toContain('export default { version: UBEAN_VERSION }');
  });

  it('id 为 ubean:meta', () => {
    expect(createMetaVirtualModule().id).toBe('ubean:meta');
  });
});

describe('createAppVirtualModule()', () => {
  it('生成 import.meta.glob + routeLoaders/middlewareLoaders/pageLoaders', async () => {
    const apiRoutes: ScannedApiRoute[] = [
      { relativePath: 'routes/users.ts', route: '/users', method: 'GET', env: undefined }
    ];
    const middlewares: ScannedMiddleware[] = [{ relativePath: 'middleware/global.ts', order: 0, global: true }];
    const pages: ScannedPageRoute[] = [
      { relativePath: 'pages/about.vue', name: 'About', route: '/about', isReuse: false, layout: 'default' }
    ];
    const mod = createAppVirtualModule(apiRoutes, middlewares, pages, 'src');
    const code = await mod.load();

    expect(code).toContain('import.meta.glob');
    expect(code).toContain('src/routes/**/*.{ts,js,mjs}');
    expect(code).toContain('src/middleware/**/*.{ts,js,mjs}');
    expect(code).toContain('src/pages/**/*.{vue,ts,tsx,js,jsx}');
    expect(code).toContain('export const routeLoaders = {}');
    expect(code).toContain('export const middlewareLoaders = {}');
    expect(code).toContain('export const pageLoaders = {}');
    expect(code).toContain('export const apiRoutes = [');
    expect(code).toContain('"relativePath":"routes/users.ts"');
    expect(code).toContain('"route":"/users"');
  });

  it('id 为 ubean:app-config', () => {
    const mod = createAppVirtualModule([], [], [], 'src');
    expect(mod.id).toBe('ubean:app-config');
  });
});

describe('createLocalesVirtualModule()', () => {
  it('生成 loadLocales / reloadLocale / import.meta.glob', async () => {
    const locales: ScannedLocale[] = [];
    const mod = createLocalesVirtualModule(locales, 'en', 'src');
    const code = await mod.load();

    expect(code).toContain("await import('ubean/runtime/i18n')");
    expect(code).toContain('i18nRuntime.registerLocaleLoader(loadLocale)');
    expect(code).toContain('import.meta.env.SSR');
    expect(code).toContain('src/locales/**/*.{json,json5,yaml,yml,js,mjs,cjs,ts,mts,cts}');
    expect(code).toContain('export async function loadLocale(code)');
    expect(code).toContain('export async function loadLocales()');
    expect(code).toContain('export async function reloadLocale(path)');
  });

  it('id 为 ubean:locales', () => {
    const mod = createLocalesVirtualModule([], 'en', 'src');
    expect(mod.id).toBe('ubean:locales');
  });

  it('defaultLocale 为 undefined → defaultCode = null', async () => {
    const mod = createLocalesVirtualModule([], undefined, 'src');
    const code = await mod.load();
    expect(code).toContain('const defaultCode = null');
  });
});
