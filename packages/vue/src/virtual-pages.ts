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
    if (visited.has(page.name)) return;
    visited.add(page.name);

    if (page.isReuse && page.reuseTarget && byName.has(page.reuseTarget)) {
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
function buildRouteMeta(
  page: ScannedPage,
  extra: Record<string, unknown> = {}
): string {
  const meta: Record<string, unknown> = {
    pageName: page.name,
    layout: page.layout,
    cache: page.cache === true ? true : undefined,
    // reuse 路由回链目标页名(运行时可据此识别 reuse / 调试路由表)
    reuseTarget: page.isReuse ? page.reuseTarget : undefined,
    transition: page.pageMeta?.transition,
    requiresAuth: page.pageMeta?.requiresAuth === true ? true : undefined,
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

/** Generate the virtual module source(plain JS — no TS syntax, SSR-safe)。 */
export function generatePagesModuleSource(input: PagesModuleInput): string {
  const { pages, layouts } = input;
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

  const sortedPages = sortPagesByReuseDependency(pages);

  // Generate page loader variables for all pages (including slot pages).
  for (const p of sortedPages) {
    const varName = varNameFor(p.name);
    if (p.isReuse && p.reuseTarget && pageByName.has(p.reuseTarget)) {
      // Reuse route: reference the target page's component loader instead
      // of importing the `.reuse.ts` file (which holds only route metadata).
      pageLoaders.push(`const ${varName} = ${varNameFor(p.reuseTarget)};`);
    } else {
      pageLoaders.push(`const ${varName} = () => import(${JSON.stringify(p.fullPath)}).then(m => m.default || m);`);
    }
  }

  // 404 page participates in the named-page surface (`pageNames` /
  // `_pageLoaders`) so `resolvePageComponent('NotFound')` works and stays
  // consistent with the `PageName` union in typed-router.d.ts.
  if (input.notFoundPage) {
    pageLoaders.push(
      `const Page_NotFound = () => import(${JSON.stringify(input.notFoundPage.fullPath)}).then(m => m.default || m);`
    );
  }
  const namedPages = input.notFoundPage ? [...sortedPages, input.notFoundPage] : sortedPages;

  // Group parallel routes by route path so they can be registered as
  // Vue Router named views (`components: { default, slotName }`).
  // Intercepting routes are registered as separate routes with a distinct
  // name and intercept metadata in `meta`.
  const routeGroups = new Map<string, { default?: ScannedPage; slots: Map<string, ScannedPage> }>();
  const interceptPages: ScannedPage[] = [];

  for (const p of sortedPages) {
    if (p.interceptTarget) {
      interceptPages.push(p);
      continue;
    }
    const routerPath = toVueRouterPath(p.route);
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

  // Generate route entries for grouped (non-intercepting) routes.
  for (const [routerPath, group] of routeGroups) {
    const defaultPage = group.default;
    const slotPages = [...group.slots.values()];
    if (!defaultPage && slotPages.length === 0) continue;

    const primaryPage = defaultPage || slotPages[0];

    if (slotPages.length > 0) {
      // Parallel route: use `components` (named views) instead of `component`.
      const componentParts: string[] = [];
      if (defaultPage) {
        componentParts.push(`default: ${varNameFor(defaultPage.name)}`);
      }
      for (const sp of slotPages) {
        componentParts.push(`${JSON.stringify(sp.slot)}: ${varNameFor(sp.name)}`);
      }
      routeEntries.push(
        `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(primaryPage.name)}, components: { ${componentParts.join(', ')} }, meta: ${buildRouteMeta(primaryPage, { parallelSlots: slotPages.map(s => s.slot) })} }`
      );
    } else {
      routeEntries.push(
        `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(defaultPage!.name)}, component: ${varNameFor(defaultPage!.name)}, meta: ${buildRouteMeta(defaultPage!)} }`
      );
    }
  }

  // Generate route entries for intercepting routes. These are registered
  // as separate routes with a `__intercept_` name prefix and intercept
  // metadata in `meta`, so the runtime can resolve them via navigation
  // guards.
  for (const p of interceptPages) {
    const routerPath = toVueRouterPath(p.route);
    const interceptName = `__intercept_${p.name}`;
    routeEntries.push(
      `  { path: ${JSON.stringify(routerPath)}, name: ${JSON.stringify(interceptName)}, component: ${varNameFor(p.name)}, meta: ${buildRouteMeta(p, { interceptFrom: p.interceptFrom, interceptTarget: p.interceptTarget, isIntercepting: true })} }`
    );
  }

  // 404 catch-all route: register `/:pathMatch(.*)*` so unmatched URLs
  // render the 404 component. Works for both SPA navigation and SSR.
  let hasNotFound = false;
  if (input.notFoundPage) {
    hasNotFound = true;
    routeEntries.push(
      `  { path: ${JSON.stringify('/:pathMatch(.*)*')}, name: "NotFound", component: Page_NotFound, meta: { pageName: "NotFound" } }`
    );
  }

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

  const layoutLoaderMap = layouts
    .map(l => `  ${JSON.stringify(l.name)}: ${layoutVarNameFor(l.name)}`)
    .join(',\n');

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
${namedPages.map(p => `  ${JSON.stringify(p.name)}: ${varNameFor(p.name)}`).join(',\n')}
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
${pages.map(p => `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, route: ${JSON.stringify(p.route)}, path: ${JSON.stringify(p.path)}, layout: ${JSON.stringify(p.layout)}, isReuse: ${p.isReuse}, reuseTarget: ${JSON.stringify(p.reuseTarget)} }`).join(',\n')}
};

export const layouts = {
${layouts.map(l => `  ${JSON.stringify(l.name)}: { name: ${JSON.stringify(l.name)}, isDefault: ${l.isDefault} }`).join(',\n')}
};
`.trimEnd().concat('\n');
}

/* -------------------------------------------------------------------------- */
/* typed-router.d.ts                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 从 vue-router 风格路径中提取参数信息。
 *
 * 支持:`:name`、`:name?`、`:name*`、`:name+`、`:name(...)`。
 * 不识别 `:pathMatch(.*)*`(catch-all),视为无参数。
 */
function extractRouteParams(path: string): Array<{ name: string; optional: boolean }> {
  const params: Array<{ name: string; optional: boolean }> = [];
  const paramRegex = /:([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?([?*+]?)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(path)) !== null) {
    const name = match[1];
    const modifier = match[2];
    const optional = modifier === '?' || modifier === '*';
    if (!params.some(p => p.name === name)) {
      params.push({ name, optional });
    }
  }
  return params;
}

/** 渲染参数类型字面量(`ParamValue<true/false>` / `ParamValueZeroOrOne<...>`)。 */
function renderParamsType(params: Array<{ name: string; optional: boolean }>, isRaw: boolean): string {
  if (params.length === 0) {
    return 'Record<never, never>';
  }
  const entries = params.map(p => {
    const optionalMarker = p.optional ? '?' : '';
    const type = p.optional
      ? `ParamValueZeroOrOne<${isRaw ? 'true' : 'false'}>`
      : `ParamValue<${isRaw ? 'true' : 'false'}>`;
    return `    ${p.name}${optionalMarker}: ${type}`;
  });
  return `{\n${entries.join(',\n')}\n  }`;
}

function renderRouteRecordInfo(page: ScannedPage): string {
  const params = extractRouteParams(page.route);
  const paramsRaw = renderParamsType(params, true);
  const paramsResolved = renderParamsType(params, false);
  return `RouteRecordInfo<${JSON.stringify(page.name)}, ${JSON.stringify(page.route)}, ${paramsRaw}, ${paramsResolved}>`;
}

/** 虚拟模块导出面声明(`declare module` 内部内容,环境声明产物使用)。 */
function renderVirtualModuleBody(input: PagesModuleInput, moduleId: string): string {
  const pages = input.pages;
  const nameUnion = pages.length > 0 ? pages.map(p => JSON.stringify(p.name)).join(' | ') : 'never';
  const notFound = input.notFoundPage ? ` | ${JSON.stringify(input.notFoundPage.name)}` : '';

  return `declare module '${moduleId}' {
  export const routes: import('vue-router').RouteRecordRaw[];
  export type PageName = ${nameUnion}${notFound};
  export const pageNames: PageName[];
  export const layoutNames: string[];
  export const defaultLayout: string | null;
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
  const pages = input.pages;

  const routeNamedMapEntries =
    pages.length > 0
      ? pages.map(p => `    "${p.name}": ${renderRouteRecordInfo(p)};`).join('\n')
      : '    // (no pages scanned)';

  return `// Generated by @ubean/vue — do not edit.
/* eslint-disable */

// 本文件为 module(顶层 export)—— declare module 块按「模块增强」语义合并。
// 虚拟模块 'virtual:ubean-vue-routes' 的环境声明在伴生文件 ubean-vue-routes.d.ts。
export {};

declare module 'vue-router/auto-routes' {
  import type { RouteRecordInfo, ParamValue, ParamValueZeroOrOne } from 'vue-router';

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
