/**
 * OPT-04 4b — @ubean/build codegen 虚拟模块快照单测
 *
 * 覆盖 createRoutingVirtualModule / createPagesVirtualModule /
 * createMetaVirtualModule / createAppVirtualModule / createLocalesVirtualModule。
 *
 * 对生成的字符串做断言（关键结构 + 不可变基线），锁定 codegen 输出形态。
 * 不做整串快照（含绝对路径/CWD 敏感内容），改为对关键片段断言。
 *
 * 历史事故 #6（RM-T04）：ADR-0002 Decision 1 声称「codegen 用快照/断言做快速门禁」，
 * 但该边界从未执行（`grep -rl toMatchSnapshot packages/builder/test/` = 0 命中），
 * 声明与代码脱节。本文件就是那条声明的实际形态：**关键片段断言**，不是 `toMatchSnapshot`。
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
  it('生成 pages + layouts（类型面由 pages.d.ts 提供，运行时模块不含 export type）', async () => {
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
    // 路径 portable
    expect(code).toContain('src/pages/about.vue');
    expect(code).not.toContain(CWD);
  });

  it('运行时代码必须能被按 JS 解析 —— `export type` 会让 dev SSR 图报 Unexpected token', async () => {
    const pages: CompiledPage[] = [{ name: 'About', path: '/about', filePath: '/project/src/pages/about.vue' }];
    const layouts: CompiledLayout[] = [
      { name: 'default', filePath: '/project/src/layouts/default.vue', isDefault: true }
    ];
    const code = await createPagesVirtualModule(pages, layouts, CWD).load();

    // 精确复现事故现场：Vite 的 ssrTransform 不认 `.ts` 后缀，一律按 JS 解析
    // （`packages/builder/src/vite.ts` 的 resolveId 只加 `\0` 前缀，不加扩展名），
    // 于是 `export type` 报 `Unexpected token`。这里用同一个解析器锁住。
    const { parseSync } = await import('oxc-parser');
    const { errors } = parseSync('ubean:pages.js', code, {});
    expect(errors.map(e => e.message)).toEqual([]);
  });

  it('空 pages/layouts → 仍是可解析的 JS', async () => {
    const code = await createPagesVirtualModule([], [], CWD).load();
    const { parseSync } = await import('oxc-parser');
    expect(parseSync('ubean:pages.js', code, {}).errors).toEqual([]);
  });

  it('routable: false 的条目仍在 pages 清单里', async () => {
    const pages: CompiledPage[] = [
      { name: 'About', path: '/about', filePath: '/project/src/pages/about.vue' },
      {
        name: 'PluginIndex',
        path: '/plugin',
        filePath: '/project/src/pages/plugin/index.meta.ts',
        routable: false,
        pageKind: 'meta',
        pageMeta: { routable: false, meta: { menuType: 'directory' } }
      }
    ];
    const code = await createPagesVirtualModule(pages, [], CWD).load();

    // 清单里两个都在（宿主靠它构菜单）
    expect(code).toContain('"About":');
    expect(code).toContain('"PluginIndex":');
    expect(code).toContain('routable: false');
    expect(code).toContain('"menuType":"directory"');
    // `pageKind` 必须由输入透传，而不是恒为 'component' —— 宿主靠它区分目录页。
    expect(code).toContain('pageKind: "meta"');
    expect(code).toContain('redirect: null');

    // 类型 union 已从这里移走（见上面那条「按 JS 解析」用例）—— 类型面在 `.ubean/pages.d.ts`。
    expect(code).not.toContain('export type');

    // allPages 是全量清单的别名（类型面上不限定 key）
    expect(code).toContain('export const allPages = pages;');
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
      { relativePath: 'pages/about.vue', name: 'About', route: '/about', pageKind: 'component', layout: 'default' }
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

    expect(code).toContain("await import('ubean/i18n')");
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

  it('SSR 求值时登记所有配置 locale 的元信息（不只加载过的那个）', async () => {
    // 回归：中间件每请求只加载 `locale + fallback`，若元信息靠 `loadLocale()` 顺带
    // 登记，SSR 首屏的 `availableLocales` 就只剩一个，语言切换器跟着只剩一项
    // （soybean-admin-v3 实测：配置 zh-CN + en，payload 里只有 zh-CN）。
    const mod = createLocalesVirtualModule(
      [],
      'en',
      'src',
      JSON.stringify({
        defaultLocale: 'zh-CN',
        locales: [
          { code: 'zh-CN', name: '简体中文', path: 'zh', language: 'zh-CN' },
          { code: 'en', name: 'English', language: 'en-US' }
        ]
      })
    );
    const code = await mod.load();

    expect(code).toContain('function configLocaleMeta(loc)');
    expect(code).toContain('i18nRuntime.setLocaleMeta(');
    expect(code).toContain('for (const loc of (i18nConfig && i18nConfig.locales) || [])');
    // 默认语言以 `i18n.defaultLocale` 为准，不是扫描出的第一个 locale 文件
    expect(code).toContain('(i18nConfig && i18nConfig.defaultLocale) || defaultCode');
  });
});
