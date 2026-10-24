import { NOT_FOUND_ROUTE_PATH, sortPagesForRouting } from './global-routes';
import { resolvePageKind } from './page-kind';
import { PARAM_TYPE_IMPORT, extractRouteParams, renderParamsType } from './route-params';
import type { ScannedPage, ScanPagesResult } from './types';

/**
 * 页面虚拟模块生成器(页面路由所有权归属 `@ubean/vue`)。
 *
 * 输出统一的模块形态,同时服务两个消费方:
 * - 精简内核:`virtual:ubean-vue-routes`(`@ubean/vue/vite` 插件)
 * - 框架层:`virtual:ubean-pages`(`packages/vite` 经 `defineVirtualModule` 包装)
 *
 * 导出面(纯 JS,SSR-safe):
 * - `routes` —— vue-router `RouteRecordRaw[]`
 * - `pageNames` / `layoutNames` / `defaultLayout`
 * - `resolvePageComponent` / `resolveLayoutComponent` /
 *   `resolveLoadingComponent` / `resolveErrorComponent`
 * - `loadingComponent` / `errorComponent`(精简内核 BC:loader 或 null)
 * - `hasNotFoundPage` / `hasErrorPage`
 * - `pages` / `layouts` 元信息映射
 */

/** `** :param`(scanner 方言)→ vue-router `:param(.*)*`。 */
function toVueRouterPath(route: string): string {
  return route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*');
}

/**
 * vue-router `redirect` 表达式 —— 目标按当前路由的 locale 参数补前缀。
 *
 * 字符串重定向是**静态路径**,vue-router 不插值参数,所以带语言前缀的站点
 * 不能把目标写成 `/:locale(zh)?/home`(实测会当成字面路径并报无匹配)。
 * 函数形式里拼一次即可。`to.params.locale` 的运行时值就是 URL 段本身
 * (`path` 覆盖过也是段),所以不需要再查 locale 表;默认语言在
 * `prefix_except_default` / `prefix_and_default` 下没有 param,自然不带前缀。
 */
function redirectExpression(target: string, localeVueParam: string | undefined): string {
  if (!localeVueParam) return JSON.stringify(target);
  // 目标为 `/` 时不要拼出 `/zh/` —— 服务端 `localizePath` 给的是 `/zh`。
  const suffix = target === '/' ? '' : target;
  return `to => (to.params.locale ? '/' + to.params.locale + ${JSON.stringify(suffix)} : ${JSON.stringify(target)})`;
}

/**
 * Sort pages so that reuse routes come after their targets.
 *
 * A reuse route generates `const Page_Reuse = Page_Target;` in the virtual
 * module. If the reuse route is declared before its target, JavaScript's TDZ
 * throws `Cannot access 'Page_Target' before initialization`. This
 * topological sort ensures targets are always emitted before their reuse
 * routes.
 */
function sortPagesByReuseDependency(pages: ScannedPage[]): ScannedPage[] {
  const result: ScannedPage[] = [];
  const visited = new Set<string>();

  const byName = new Map<string, ScannedPage>();
  for (const p of pages) {
    byName.set(p.name, p);
  }

  function visit(page: ScannedPage) {
    // 按 `fullPath` 去重，不按 name：并行路由的插槽页与默认页共享同一个派生名
    // （`photo/[id].vue` 与 `@dialog/photo/[id].vue` 都是 `PhotoId`），按 name 去重会把
    // 插槽页整个丢掉，`components` 里就只剩一个视图、默认视图还会凭空消失。
    if (visited.has(page.fullPath)) return;
    visited.add(page.fullPath);

    if (resolvePageKind(page) === 'reuse' && page.reuseTarget && byName.has(page.reuseTarget)) {
      visit(byName.get(page.reuseTarget)!);
    }

    result.push(page);
  }

  for (const p of pages) {
    visit(p);
  }

  return result;
}

function varNameFor(name: string): string {
  return `Page_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function layoutVarNameFor(name: string): string {
  return `Layout_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/** 组装单条路由的 meta(JSON 序列化;undefined 字段自动省略)。 */
function buildRouteMeta(page: ScannedPage, extra: Record<string, unknown> = {}): string {
  const meta: Record<string, unknown> = {
    pageName: page.name,
    layout: page.layout,
    cache: page.cache === true ? true : undefined,
    // reuse 路由回链目标页名(运行时可据此识别 reuse / 调试路由表)
    reuseTarget: resolvePageKind(page) === 'reuse' ? page.reuseTarget : undefined,
    transition: page.pageMeta?.transition,
    requiresAuth: page.pageMeta?.requiresAuth === true ? true : undefined,
    ssr: page.pageMeta?.ssr,
    matchers: page.matchers && Object.keys(page.matchers).length > 0 ? page.matchers : undefined,
    head: page.pageMeta?.head,
    // 用户 definePage({ meta }) 透传(最低优先级,不覆盖框架字段)
    ...(page.pageMeta?.meta as Record<string, unknown> | undefined),
    ...extra
  };
  return JSON.stringify(meta);
}

export type PagesModuleInput = Pick<
  ScanPagesResult,
  'pages' | 'layouts' | 'notFoundPage' | 'loadingPage' | 'errorPage'
>;

/**
 * Optional compact locale prefix (plain data — `@ubean/vue` does not import i18n).
 * Example: `':locale(zh)?'` for prefix_except_default with extra locales `zh`.
 */
export interface LocaleRouteCompileOptions {
  vueParam?: string;
}

function withLocaleParam(routerPath: string, vueParam?: string): string {
  if (!vueParam) return routerPath;
  if (routerPath === '/') return `/${vueParam}`;
  return `/${vueParam}${routerPath}`;
}

/**
 * 内置 404 条目归一化。
 *
 * 新形态下内置 404 就在 `pages` 里（带 `isGlobalCatchAll` 标记），但 `notFoundPage`
 * 是公开契约字段（扫描结果的别名），调用方可能只传它 —— 两者合并成一份清单，
 * 避免「同一份路由表在两个入参里各算一次」的旧分支。
 */
function withBuiltinPages(input: PagesModuleInput): ScannedPage[] {
  if (input.pages.some(p => p.isGlobalCatchAll)) return input.pages;
  return input.notFoundPage ? [...input.pages, input.notFoundPage] : input.pages;
}

/** Generate the virtual module source(plain JS — no TS syntax, SSR-safe)。 */
export function generatePagesModuleSource(input: PagesModuleInput, locale?: LocaleRouteCompileOptions): string {
  const { layouts } = input;
  const pages = withBuiltinPages(input);
  const pageLoaders: string[] = [];
  const layoutLoaders: string[] = [];
  const routeEntries: string[] = [];

  // Build a name → page map for resolving reuse targets. Reuse routes
  // reference another page's component via `reuseTarget`, so they must
  // reuse the target's loader instead of importing the `.reuse.ts` file
  // (which only contains `definePage` metadata, not a Vue component).
  const pageByName = new Map<string, ScannedPage>();
  for (const p of pages) {
    pageByName.set(p.name, p);
  }

  // 组件 loader 的变量名必须唯一。派生名重复的合法情形是并行路由的两个视图
  // （它们本就共享同一个 URL 与派生名），直接拼 `Page_X` 会得到重复的 `const`。
  const loaderNameByPath = new Map<string, string>();
  const usedLoaderNames = new Set<string>();
  function loaderNameFor(page: ScannedPage): string {
    const cached = loaderNameByPath.get(page.fullPath);
    if (cached) return cached;
    const base = varNameFor(page.name);
    let candidate = base;
    let n = 2;
    while (usedLoaderNames.has(candidate)) candidate = `${base}_${n++}`;
    usedLoaderNames.add(candidate);
    loaderNameByPath.set(page.fullPath, candidate);
    return candidate;
  }

  const sortedPages = sortPagesByReuseDependency(pages);
  // 全局捕获路由（`isGlobalCatchAll`）排到最后 —— vue-router 的 catch-all 按**注册顺序**
  // 匹配，内置 404 排在用户 `[...slug].vue` 之前会把它整个吞掉（实测）。
  const routablePages = sortPagesForRouting(sortedPages.filter(p => p.routable !== false));

  // Generate page loader variables for all pages (including slot pages).
  // `.meta.ts` / `.meta.js` 元数据页没有组件实现（模块没有 default export），
  // 一旦为它生成 `import(...)` 就会在运行时解析成空组件，因此直接跳过。
  for (const p of sortedPages) {
    if (resolvePageKind(p) === 'meta') continue;
    const varName = loaderNameFor(p);
    const target = p.reuseTarget ? pageByName.get(p.reuseTarget) : undefined;
    if (resolvePageKind(p) === 'reuse' && target) {
      // Reuse route: reference the target page's component loader instead
      // of importing the `.reuse.ts` file (which holds only route metadata).
      pageLoaders.push(`const ${varName} = ${loaderNameFor(target)};`);
    } else {
      pageLoaders.push(`const ${varName} = () => import(${JSON.stringify(p.fullPath)}).then(m => m.default || m);`);
    }
  }

  // `routable: false` 的组件页仍留在命名页面上——reuse 路由靠 `_pageLoaders`
  // 拿到目标组件；这里只排除无组件实现的 `.meta.*` 元数据页。
  // 内置页（Root / NotFound）已在 `pages` 里，不再单独追加 —— 以前 NotFound 靠
  // `input.notFoundPage` 额外 push 一次，会与 `pages` 里的同一条目重复。
  const namedPages = sortedPages.filter(p => resolvePageKind(p) !== 'meta');

  // Group parallel routes by route path so they can be registered as
  // Vue Router named views (`components: { default, slotName }`).
  //
  // 拦截路由（`(.)` / `(..)` / `(...)`）不在这里：那个约定已按 [docs/adr/0010] 的刻意不做清单移除
  // ——扫描器现在直接拒绝标记段，因此这里不再有「单独注册 `__intercept_*` 路由」的分支。
  const routeGroups = new Map<string, { default?: ScannedPage; slots: Map<string, ScannedPage> }>();

  for (const p of routablePages) {
    // 全局捕获路由的 URL 形态是 vue-router 的内部约定，不是页面文件派生的路径。
    const routerPath = p.isGlobalCatchAll ? NOT_FOUND_ROUTE_PATH : toVueRouterPath(p.route);
    let group = routeGroups.get(routerPath);
    if (!group) {
      group = { slots: new Map() };
      routeGroups.set(routerPath, group);
    }
    if (p.slot) {
      group.slots.set(p.slot, p);
    } else {
      // First non-slot page wins as the default view.
      if (!group.default) group.default = p;
    }
  }

  // Generate route entries for grouped parallel routes.
  for (const [routerPath, group] of routeGroups) {
    const defaultPage = group.default;
    const slotPages = [...group.slots.values()];
    if (!defaultPage && slotPages.length === 0) continue;

    const primaryPage = defaultPage || slotPages[0];

    if (slotPages.length > 0) {
      // Parallel route: use `components` (named views) instead of `component`.
      const componentParts: string[] = [];
      if (defaultPage) {
        componentParts.push(`default: ${loaderNameFor(defaultPage)}`);
      }
      for (const sp of slotPages) {
        componentParts.push(`${JSON.stringify(sp.slot)}: ${loaderNameFor(sp)}`);
      }
      const vuePath = withLocaleParam(routerPath, locale?.vueParam);
      routeEntries.push(
        `  { path: ${JSON.stringify(vuePath)}, name: ${JSON.stringify(primaryPage.name)}, components: { ${componentParts.join(', ')} }, meta: ${buildRouteMeta(primaryPage, { parallelSlots: slotPages.map(s => s.slot) })} }`
      );
    } else if (defaultPage!.redirect) {
      // `definePage({ redirect })`: 不渲染组件,访问时跳转。
      // `redirect` 与 `component` 可以共存(vue-router 实测 redirect 优先),
      // 但冗余的 component 会让「这页到底渲不渲染」变得看运气,所以不写。
      const vuePath = withLocaleParam(routerPath, locale?.vueParam);
      routeEntries.push(
        `  { path: ${JSON.stringify(vuePath)}, name: ${JSON.stringify(defaultPage!.name)}, redirect: ${redirectExpression(defaultPage!.redirect, locale?.vueParam)}, meta: ${buildRouteMeta(defaultPage!)} }`
      );
    } else {
      const vuePath = withLocaleParam(routerPath, locale?.vueParam);
      routeEntries.push(
        `  { path: ${JSON.stringify(vuePath)}, name: ${JSON.stringify(defaultPage!.name)}, component: ${loaderNameFor(defaultPage!)}, meta: ${buildRouteMeta(defaultPage!)} }`
      );
    }
  }

  // `hasNotFoundPage()` 读的是扫描结果里的标记（404 现在就是 `pages` 里的普通条目）。
  const hasNotFound = pages.some(p => p.isGlobalCatchAll === true);

  // Loading / error components (Suspense fallback / ErrorBoundary).
  let loadingLoaderName = 'null';
  if (input.loadingPage) {
    loadingLoaderName = 'LoadingPage';
    pageLoaders.push(
      `const ${loadingLoaderName} = () => import(${JSON.stringify(input.loadingPage.fullPath)}).then(m => m.default || m);`
    );
  }
  let errorLoaderName = 'null';
  if (input.errorPage) {
    errorLoaderName = 'ErrorPage';
    pageLoaders.push(
      `const ${errorLoaderName} = () => import(${JSON.stringify(input.errorPage.fullPath)}).then(m => m.default || m);`
    );
  }

  for (const l of layouts) {
    layoutLoaders.push(
      `const ${layoutVarNameFor(l.name)} = () => import(${JSON.stringify(l.fullPath)}).then(m => m.default || m);`
    );
  }

  const defaultLayout = layouts.find(l => l.isDefault);
  const defaultLayoutName = defaultLayout ? defaultLayout.name : 'null';

  const layoutLoaderMap = layouts.map(l => `  ${JSON.stringify(l.name)}: ${layoutVarNameFor(l.name)}`).join(',\n');

  return `// Generated by @ubean/vue — file-based pages virtual module. Do not edit.
/* eslint-disable */

${pageLoaders.join('\n')}
${layoutLoaders.join('\n')}

export const routes = [
${routeEntries.join(',\n')}
];

const _layoutLoaders = {
${layoutLoaderMap}
};

const _pageLoaders = {
${namedPages.map(p => `  ${JSON.stringify(p.name)}: ${loaderNameFor(p)}`).join(',\n')}
};

export const pageNames = [${namedPages.map(p => JSON.stringify(p.name)).join(', ')}];
export const layoutNames = [${layouts.map(l => JSON.stringify(l.name)).join(', ')}];
export const defaultLayout = ${defaultLayoutName === 'null' ? 'null' : JSON.stringify(defaultLayoutName)};

export function resolvePageComponent(name) {
  const loader = _pageLoaders[name];
  if (!loader) {
    return Promise.reject(new Error('[ubean] Page component not found: ' + name));
  }
  return loader();
}

export function resolveLayoutComponent(name) {
  if (!name) return Promise.resolve(null);
  const loader = _layoutLoaders[name];
  if (!loader) {
    return Promise.resolve(null);
  }
  return loader();
}

export function resolveLoadingComponent() {
  ${loadingLoaderName === 'null' ? 'return Promise.resolve(null);' : `return ${loadingLoaderName}();`}
}

export function resolveErrorComponent() {
  ${errorLoaderName === 'null' ? 'return Promise.resolve(null);' : `return ${errorLoaderName}();`}
}

export const loadingComponent = ${loadingLoaderName === 'null' ? 'null' : loadingLoaderName};
export const errorComponent = ${errorLoaderName === 'null' ? 'null' : errorLoaderName};

export function hasNotFoundPage() {
  return ${hasNotFound};
}

export function hasErrorPage() {
  return ${errorLoaderName !== 'null'};
}

export const pages = {
${pages.map(p => `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, route: ${JSON.stringify(p.route)}, path: ${JSON.stringify(p.path)}, layout: ${JSON.stringify(p.layout)}, pageKind: ${JSON.stringify(resolvePageKind(p))}, routable: ${p.routable !== false}, reuseTarget: ${JSON.stringify(p.reuseTarget)}, pageMeta: ${JSON.stringify(p.pageMeta ?? null)}, redirect: ${JSON.stringify(p.redirect ?? null)} }`).join(',\n')}
};

export const layouts = {
${layouts.map(l => `  ${JSON.stringify(l.name)}: { name: ${JSON.stringify(l.name)}, isDefault: ${l.isDefault} }`).join(',\n')}
};
`
    .trimEnd()
    .concat('\n');
}

/* -------------------------------------------------------------------------- */
/* typed-router.d.ts                                                           */
/* -------------------------------------------------------------------------- */

function renderRouteRecordInfo(page: ScannedPage): string {
  const params = extractRouteParams(page.route);
  const paramsRaw = renderParamsType(params, true);
  const paramsResolved = renderParamsType(params, false);
  return `RouteRecordInfo<${JSON.stringify(page.name)}, ${JSON.stringify(page.route)}, ${paramsRaw}, ${paramsResolved}>`;
}

/** 虚拟模块导出面声明(`declare module` 内部内容,环境声明产物使用)。 */
function renderVirtualModuleBody(input: PagesModuleInput, moduleId: string): string {
  // `PageName` / `RouteNamedMap` 只描述**可路由**页面 —— `routable: false` 的条目
  // 永远不可能作为路由名出现，放进 union 会让 `router.push({ name })` 类型通过、
  // 运行时挂掉。它们仍可通过 `resolvePageComponent()` 解析（组件实现仍然存在）。
  const routablePages = withBuiltinPages(input).filter(p => p.routable !== false);
  const nameUnion = routablePages.length > 0 ? routablePages.map(p => JSON.stringify(p.name)).join(' | ') : 'never';

  return `declare module '${moduleId}' {
  export const routes: import('vue-router').RouteRecordRaw[];
  export type PageName = ${nameUnion};
  export const pageNames: PageName[];
  export const layoutNames: string[];
  export const defaultLayout: string | null;
  /**
   * 扫描到的全部页面条目（包含 routable: false 的非路由页）。
   * pageMeta 是原始 definePage() 结果 —— 宿主据此读取菜单目录、外链等应用层语义。
   */
  export const pages: Record<string, {
    name: string;
    route: string;
    path: string;
    layout?: string | string[] | false;
    /** 页面种类：自带组件 / 借目标组件 / 无组件元数据条目。 */
    pageKind: 'component' | 'reuse' | 'meta';
    /** 是否参与路由注册；false 的条目只在扫描清单里。 */
    routable: boolean;
    /** 是否为框架内置路由（Root / NotFound）。宿主生成菜单时应过滤。 */
    isBuiltin?: boolean;
    reuseTarget?: string;
    pageMeta: import('@ubean/vue').PageMeta | null;
  }>;
  export const loadingComponent: import('vue').Component | null;
  export const errorComponent: import('vue').Component | null;
  export function resolvePageComponent(name: string): Promise<import('vue').Component>;
  export function resolveLayoutComponent(name: string): Promise<import('vue').Component | null>;
  export function resolveLoadingComponent(): Promise<import('vue').Component | null>;
  export function resolveErrorComponent(): Promise<import('vue').Component | null>;
  export function hasNotFoundPage(): boolean;
  export function hasErrorPage(): boolean;
}`;
}

/**
 * Generate the ambient module declaration d.ts for the virtual module.
 *
 * 产物必须是 **script 文件**(无顶层 import/export)—— `declare module` 在
 * script 上下文中才注册「环境模块声明」;在 module 文件中会被当作模块增强,
 * 对不存在的模块无法生效。由 `/vite` 插件写入 `<root>/ubean-vue-routes.d.ts`。
 */
export function generateVirtualModuleDts(input: PagesModuleInput, moduleId = 'virtual:ubean-vue-routes'): string {
  return `// Generated by @ubean/vue — do not edit.
/* eslint-disable */

${renderVirtualModuleBody(input, moduleId)}
`;
}

/**
 * Generate `typed-router.d.ts` content for the virtual module.
 *
 * 包含 `vue-router/auto-routes` 的 `RouteNamedMap` 增强,让 vue-router 的
 * `useRoute<Name>(name)` / `RouterLink` 能推断 `route.params` 类型。
 *
 * 产物是 **module 文件**(顶层 `export {}`)—— `declare module` 块按「模块
 * 增强」语义合并进真实的 'vue-router' / 'vue-router/auto-routes' 模块;
 * 若以 script 形式输出,同名环境模块声明会整体遮蔽真实包的类型。
 * 虚拟模块自身的环境声明见 `generateVirtualModuleDts`。
 */
export function generateTypedRouter(input: PagesModuleInput, _moduleId = 'virtual:ubean-vue-routes'): string {
  // 同 `renderVirtualModuleBody`：`RouteNamedMap` 只能包含可路由页。
  const pages = input.pages.filter(p => p.routable !== false);

  const routeNamedMapEntries =
    pages.length > 0
      ? pages.map(p => `    "${p.name}": ${renderRouteRecordInfo(p)};`).join('\n')
      : '    // (no pages scanned)';

  return `// Generated by @ubean/vue — do not edit.
/* eslint-disable */

// import type 必须在顶层:declare module 块内部的 import 触发 TS2667
// (Imports are not permitted in module augmentations)。
${PARAM_TYPE_IMPORT}

// 本文件为 module(顶层 export)—— declare module 块按「模块增强」语义合并。
// 虚拟模块 'virtual:ubean-vue-routes' 的环境声明在伴生文件 ubean-vue-routes.d.ts。
export {};

declare module 'vue-router/auto-routes' {
  export interface RouteNamedMap {
${routeNamedMapEntries}
  }
}

declare module 'vue-router' {
  export interface TypesConfig {
    RouteNamedMap: import('vue-router/auto-routes').RouteNamedMap;
  }
}
`;
}
