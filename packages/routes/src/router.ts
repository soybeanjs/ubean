import { compileLocalePaths, localeRedirectTarget, localeSegment } from '@ubean/i18n';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from '@ubean/scan';
import { isServerAction, matchAnyGlob } from '@ubean/shared';
import type { UbeanEnv, RouteMeta, UbeanMiddleware, RouteRule, ServerAction } from '@ubean/shared';
// matcher 系列所有权在 `@ubean/vue` 主入口(vue + vue-router only)。**不要**改回
// `@ubean/scan` —— 那个 barrel 会带进 `@ubean/vue/vite`(`vue/compiler-sfc`),
// 于是服务端运行时图里出现构建期解析器:Node 上只是体积浪费,worker 上
// 构建**直接失败**(`Rolldown failed to resolve import "velocityjs"`)。
import { NOT_FOUND_ROUTE_NAME, resolvePageKind, validateParams as _validateParams } from '@ubean/vue';
import type { Context, Next, MiddlewareHandler } from 'hono';
import { isBotUserAgent } from './bot-detection';
import { extractRouteMeta, isHandlerChain } from './handler';
import { serveIsr } from './isr';
import type { IsrCacheStore } from './isr';
import {
  parseFormActionName as _parseFormActionName,
  handleActionResponse as _handleActionResponse,
  runServerAction as _runServerAction
} from './page-actions';
import { normalizeIsrRule } from './route-rules';
import { resolveSelectSsr, ssrModeHeader } from './select-ssr';

/**
 * Structural type for the route registrar app.
 *
 * Avoids a hard dependency on `@ubean/app` (T2-6). The actual `UbeanApp`
 * returned by `createUbeanApp()` satisfies this interface because it
 * extends `Hono<UbeanEnv>` and adds a `hooks` property from `hookable`.
 */
export interface RouteRegistrar {
  on(method: string, path: string, ...handlers: MiddlewareHandler[]): void;
  on(methods: string[], path: string, ...handlers: MiddlewareHandler[]): void;
  get(path: string, ...handlers: MiddlewareHandler[]): void;
  post(path: string, ...handlers: MiddlewareHandler[]): void;
  hooks: {
    callHook(name: string, ...args: any[]): Promise<void>;
  };
}

export interface RegisterOptions {
  routes: ScannedApiRoute[];
  middleware: ScannedMiddleware[];
  pages: ScannedPageRoute[];
  layouts?: ScannedLayout[];
  routeLoaders: Record<string, () => Promise<Record<string, unknown>>>;
  middlewareLoaders: Record<string, () => Promise<{ default?: UbeanMiddleware }>>;
  pageRenderer?: unknown;
  pageAssetTags?: unknown;
  pageLoaders?: Record<string, () => Promise<any>>;
  i18nConfig?: {
    enabled?: boolean;
    strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
    defaultLocale?: string;
    locales?: string[];
    /** Locale code → URL segment override (see `LocaleRoutingConfig.paths`). */
    paths?: Record<string, string>;
    cookieName?: string;
    baseUrl?: string;
  };
  /**
   * 不进行 SSR 的路由模式列表(glob)。
   * 匹配的页面将跳过服务端渲染,返回客户端渲染 shell。
   */
  ssrExclude?: string[];
  /**
   * 启用流式 SSR。当为 `true` 且 pageRenderer 提供 `renderToStream` 时,
   * 页面响应将以 `ReadableStream` 形式分块输出(头部先发送,app HTML 边渲染边输出),
   * 显著改善 TTFB/LCP。回退:renderer 不支持流式时自动降级为缓冲渲染。
   */
  streaming?: boolean;
  /**
   * 爬虫降级(P9-24 / Task 6 流式 metadata):当 `streaming` 启用且检测到
   * 爬虫/社交预览 UA(Facebook OG、Twitter、Slack 等)时,自动降级为缓冲渲染,
   * 保证动态 `<head>` metadata 出现在初始响应中(社交爬虫只解析初始 `<head>`,
   * 不会执行流式尾部的 metadata 注入)。默认 `true`(仅在 streaming 启用时生效)。
   */
  botFallback?: boolean;
  /**
   * `pages/404.vue` 自动检测的 404 页面。
   * 注册为 Vue Router catch-all 路由的兜底,同时注册 Hono 的 `GET *` 兜底处理器。
   */
  notFoundPage?: ScannedPageRoute;
  /**
   * ISR 缓存存储(P9-03)。与 `@ubean/server` 的 `CacheStore` 结构兼容。
   * 启用 `routeRules[*].isr` 时必须传入,否则 ISR 规则被忽略。
   */
  cacheStore?: IsrCacheStore;
  /**
   * Pre-rendered no-FOUC color-mode script (from `getColorModeScript`).
   * Injected as the first child of `<head>` in every SSR/prerendered HTML
   * response so the correct theme class is set before first paint.
   * `transformIndexHtml` only runs in dev — SSG/prerender bypasses it, so
   * the script must be injected here to cover production HTML.
   */
  colorModeScript?: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

const HTTP_METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function normalizeMethod(m: string | undefined): Method | undefined {
  if (!m) return undefined;
  const upper = m.toUpperCase() as Method;
  return HTTP_METHODS.includes(upper) ? upper : undefined;
}

export function convertUbeanRoutePath(path: string): string {
  let honoPath = path;
  // Handle already-converted catch-all from filePathToRoute: /**:slug → *
  // (filePathToRoute converts [...slug] to **:slug, so by this point there are
  // no brackets to match — convert the Vue Router catch-all to Hono's wildcard.)
  // Using '*' (not '/*') so specific routes like '/' still get priority.
  if (/\/\*\*:/.test(honoPath)) {
    honoPath = '*';
  }
  // Handle bracket notation (for paths that still use raw bracket syntax)
  honoPath = honoPath.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, rest, name) => {
    if (rest) return `*${name}`;
    return `:${name}`;
  });
  // Handle Vue Router custom regex params from `definePage({ path })`, e.g.
  // `/blog/:slug(.*)*`. Hono/rou3 only understands `{regex}` — left as-is, the
  // parentheses become part of the param name and multi-segment URLs 404.
  // `.*` regexes match across segments, so catch-all semantics are preserved
  // and the value stays readable via `c.req.param('slug')` (e.g. "a/b").
  // rou3 cannot express the repeatable-zero (`*`) / optional (`?`) modifiers:
  // a zero-segment URL (`/blog` for `/blog/:slug(.*)*`) will NOT match server
  // side — pair such a page with a concrete sibling page if that is needed.
  honoPath = honoPath.replace(/:([A-Za-z_][\w-]*)\(([^()]*)\)[*+?]?/g, (_m, name, regex) => `:${name}{${regex}}`);
  return honoPath;
}

/**
 * Sort page routes so catch-all routes are registered last. Hono's
 * RegExpRouter matches in registration order, so a catch-all registered
 * before a specific path (e.g. `/`) would swallow it. File-system sort
 * order puts `[...slug].vue` before `index.vue` (`[` < `i`), which is
 * wrong for Hono — this sort corrects it.
 *
 * 两级档位：普通 catch-all（用户 `[...slug].vue`）在具体路径之后，**内置全局捕获路由**
 * （`isGlobalCatchAll`，即 `pages/404.vue`）再在其后。两级都必需 —— 同档位内按注册顺序
 * 匹配，内置 404 排在用户捕获页之前会把它整个吞掉（vue-router 侧同规则，见
 * `@ubean/vue` 的 `sortPagesForRouting`，两侧必须一致否则 SSR/客户端水合不一致）。
 *
 * Detects both catch-all spellings: the scan-default `/**:slug` form and
 * the vue-router regex form `:slug(.*)*` / `:slug(.*)` used by custom
 * `definePage({ path })` values.
 *
 * Stable: non-catch-all pages keep their original relative order.
 */
const CATCH_ALL_ROUTE_REGEX = /\/\*\*:|\(\.\*\)/;

export function sortPagesForRegistration<T extends { route: string; isGlobalCatchAll?: boolean }>(
  pages: readonly T[]
): T[] {
  const rank = (p: T): number => {
    if (p.isGlobalCatchAll) return 2;
    return CATCH_ALL_ROUTE_REGEX.test(p.route) ? 1 : 0;
  };
  return [...pages].sort((a, b) => rank(a) - rank(b));
}

/**
 * Specificity score for a Hono path shape. Higher wins, so sorting
 * descending puts literal paths in front of dynamic ones.
 *
 * Same idea as `pathSpecificity` in ./route-rules (which tiebreaks route
 * rules and therefore stays private there), adapted to Hono path shapes:
 * `:id{regex}` counts as dynamic, `*` as a catch-all.
 *
 * - literal segment: `+1`
 * - `:param` (optionally with a `{regex}` suffix): `-1`
 * - `*` / `*name` catch-all: `-10`
 */
export function apiPathSpecificity(path: string): number {
  const segments = path.split('/').filter(segment => segment.length > 0);
  let score = 0;

  for (const segment of segments) {
    if (segment.startsWith('*')) {
      score -= 10;
    } else if (segment.startsWith(':')) {
      score -= 1;
    } else {
      score += 1;
    }
  }

  return score;
}

/**
 * Sort API routes so literal paths are registered before paths with dynamic
 * segments, keeping catch-alls last.
 *
 * Hono resolves routes in registration order (`TrieRouter`, the router the
 * default `SmartRouter` silently falls back to once a `:param` and a literal
 * sibling coexist). Without this sort, `/api/user/:id` may be registered
 * before `/api/user/list` and answer `id === 'list'`.
 *
 * The scan order is a plain sort of absolute file paths, so apps used to
 * carry a `(r)/` route group to force literals first — `(` (0x28) sorts
 * before `[` (0x5b). That was a naming accident; the guarantee belongs here.
 *
 * Stable: paths with equal specificity keep their scan order (e.g.
 * `/api/user/:id/roles` stays after `/api/user/:id`).
 */
export function sortApiRoutesForRegistration<T extends { route: string }>(routes: readonly T[]): T[] {
  return [...routes].sort((a, b) => apiPathSpecificity(b.route) - apiPathSpecificity(a.route));
}

function middlewarePathToHonoPath(relativePath: string): string {
  const noExt = relativePath.replace(/\.(mjs|js|jsx|cjs|ts|tsx|mts|cts)$/i, '');
  const segments = noExt.split('/');

  if (segments.length === 1) {
    return '/*';
  }

  const dirSegments = segments.slice(0, -1);
  const dirPath = `/${dirSegments.join('/')}`;
  return `${dirPath}/*`;
}

function matchMiddlewarePath(mountPath: string, routePath: string): boolean {
  if (mountPath === '*' || mountPath === '/*') return true;
  if (mountPath.endsWith('/*')) {
    const prefix = mountPath.slice(0, -1);
    return routePath === prefix.slice(0, -1) || routePath.startsWith(prefix);
  }
  return routePath === mountPath;
}

function resolveRouteExport(mod: Record<string, unknown>, method: Method): MiddlewareHandler[] | Function | null {
  const namedHandler = mod[method];
  if (isHandlerChain(namedHandler)) return namedHandler;
  if (typeof namedHandler === 'function') return namedHandler as Function;

  const lowerHandler = mod[method.toLowerCase()];
  if (isHandlerChain(lowerHandler)) return lowerHandler;
  if (typeof lowerHandler === 'function') return lowerHandler as Function;

  if (isHandlerChain(mod.default)) return mod.default as MiddlewareHandler[];
  if (typeof mod.default === 'function') return mod.default as Function;

  return null;
}

/* -------------------------------------------------------------------------- */
/* Optional peer-dependency loaders                                           */
/* -------------------------------------------------------------------------- */

type PagesModule = typeof import('@ubean/pages');
type I18nModule = typeof import('@ubean/i18n');

let _pagesMod: PagesModule | null | undefined;
let _i18nMod: I18nModule | null | undefined;

async function loadPages(): Promise<PagesModule | null> {
  if (_pagesMod !== undefined) return _pagesMod;
  try {
    _pagesMod = await import('@ubean/pages');
  } catch {
    _pagesMod = null;
  }
  return _pagesMod;
}

async function loadI18n(): Promise<I18nModule | null> {
  if (_i18nMod !== undefined) return _i18nMod;
  try {
    _i18nMod = await import('@ubean/i18n');
  } catch {
    _i18nMod = null;
  }
  return _i18nMod;
}

/* -------------------------------------------------------------------------- */
/* Server Actions helpers (P9-02) live in ./page-actions — a thin adapter     */
/* over Server Actions primitives (runAction).                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* registerApiRoutes — API-only registration (no page deps)                  */
/* -------------------------------------------------------------------------- */

export async function registerApiRoutes(app: RouteRegistrar, options: RegisterOptions): Promise<void> {
  const { routes, middleware, routeLoaders, middlewareLoaders } = options;

  const sortedMiddleware = [...middleware].sort((a, b) => a.order - b.order);

  interface LoadedMiddleware {
    mountPath: string;
    handler: MiddlewareHandler<UbeanEnv>;
  }

  const loadedUserMiddleware: LoadedMiddleware[] = [];

  for (const mw of sortedMiddleware) {
    await app.hooks.callHook('middleware:register', mw);
    const loader = middlewareLoaders[mw.relativePath];
    if (loader) {
      try {
        const mod = await loader();
        if (mod.default) {
          const mountPath = mw.global ? '*' : middlewarePathToHonoPath(mw.relativePath);
          loadedUserMiddleware.push({ mountPath, handler: mod.default as MiddlewareHandler<UbeanEnv> });
        }
      } catch {
        // ignore loading errors in dev
      }
    }
  }

  function getMatchingMiddleware(routePath: string): MiddlewareHandler<UbeanEnv>[] {
    return loadedUserMiddleware.filter(mw => matchMiddlewarePath(mw.mountPath, routePath)).map(mw => mw.handler);
  }

  interface RouteEntry {
    definition: MiddlewareHandler[] | Function;
    fileMeta?: Record<string, unknown>;
    matchers?: Record<string, string>;
  }

  const routesByPath = new Map<string, Map<Method, RouteEntry>>();

  const routeFileGroups = new Map<string, ScannedApiRoute[]>();
  for (const route of routes) {
    const key = route.relativePath;
    const group = routeFileGroups.get(key);
    if (group) {
      group.push(route);
    } else {
      routeFileGroups.set(key, [route]);
    }
  }

  for (const [relativePath, routeGroup] of routeFileGroups) {
    const loader = routeLoaders[relativePath];
    if (!loader) continue;

    const first = routeGroup[0];
    const honoPath = convertUbeanRoutePath(first.route);

    let pathMethods = routesByPath.get(honoPath);
    if (!pathMethods) {
      pathMethods = new Map();
      routesByPath.set(honoPath, pathMethods);
    }

    let mod: any;
    try {
      mod = await loader();
    } catch {
      continue;
    }

    for (const route of routeGroup) {
      const method = normalizeMethod(route.method);
      if (!method) continue;

      const resolved = resolveRouteExport(mod, method);
      if (resolved) {
        pathMethods.set(method, {
          definition: resolved,
          fileMeta: first.fileMeta,
          matchers: first.matchers
        });
      }
    }
  }

  // Literal paths must be registered before dynamic ones: the router the
  // default SmartRouter falls back to (`TrieRouter`) is first-match-wins, so
  // `/api/user/:id` scanned before `/api/user/list` would swallow the latter.
  const orderedApiPaths = [...routesByPath.entries()].sort(
    (a, b) => apiPathSpecificity(b[0]) - apiPathSpecificity(a[0])
  );

  for (const [honoPath, pathMethods] of orderedApiPaths) {
    for (const [method, entry] of pathMethods) {
      const { definition, fileMeta, matchers } = entry;
      const matchingMiddleware = getMatchingMiddleware(honoPath);

      // Task 7 (P1): API 路由 matchers —— 在 metaMiddleware 之后、handler 之前
      // 插入参数校验。matcher 拒绝时返回 404,让 Hono 继续匹配下一候选路由。
      // 无 matchers 的路由此中间件直接 `next()`(零开销)。
      const matcherMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
        if (!matchers) {
          await next();
          return;
        }
        const params = c.req.param();
        if (!_validateParams(matchers, params)) {
          return c.json({ error: 'Not Found', path: c.req.path, method: c.req.method }, 404);
        }
        await next();
      };

      if (isHandlerChain(definition)) {
        const routeMeta = { ...extractRouteMeta(definition) } as RouteMeta;
        if (fileMeta) {
          Object.assign(routeMeta, fileMeta);
        }

        await app.hooks.callHook('route:register', {
          method,
          path: honoPath,
          handler: definition,
          meta: routeMeta
        });

        const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
          c.set('route', { meta: routeMeta, path: c.req.path, method: c.req.method });
          await next();
        };

        const honoHandlers = [metaMiddleware, matcherMiddleware, ...matchingMiddleware, ...definition];
        app.on(method.toLowerCase(), honoPath, ...honoHandlers);
      } else {
        const routeMeta = { requiresAuth: true, ...fileMeta } as RouteMeta;

        const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
          c.set('route', { meta: routeMeta, path: c.req.path, method: c.req.method });
          await next();
        };

        const handlerWrapper = async (c: Context<UbeanEnv>) => {
          const result = await (definition as Function)(c);
          if (result instanceof Response) return result;
          if (typeof result === 'string') {
            return new Response(result, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
          }
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        };

        await app.hooks.callHook('route:register', {
          method,
          path: honoPath,
          handler: definition,
          meta: routeMeta
        });

        const honoHandlers = [metaMiddleware, matcherMiddleware, ...matchingMiddleware, handlerWrapper];
        app.on(method.toLowerCase(), honoPath, ...honoHandlers);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* registerPageRoutes — page registration (requires @ubean/pages)            */
/* -------------------------------------------------------------------------- */

export async function registerPageRoutes(app: RouteRegistrar, options: RegisterOptions): Promise<void> {
  const { pages, layouts = [], middleware, middlewareLoaders, i18nConfig } = options;

  const pagesMod = await loadPages();
  if (!pagesMod) {
    // @ubean/pages not installed — skip page route registration
    return;
  }

  const sortedMiddleware = [...middleware].sort((a, b) => a.order - b.order);

  interface LoadedMiddleware {
    mountPath: string;
    handler: MiddlewareHandler<UbeanEnv>;
  }
  const loadedUserMiddleware: LoadedMiddleware[] = [];

  for (const mw of sortedMiddleware) {
    const loader = middlewareLoaders[mw.relativePath];
    if (loader) {
      try {
        const mod = await loader();
        if (mod.default) {
          const mountPath = mw.global ? '*' : middlewarePathToHonoPath(mw.relativePath);
          loadedUserMiddleware.push({ mountPath, handler: mod.default as MiddlewareHandler<UbeanEnv> });
        }
      } catch {
        // ignore
      }
    }
  }

  function getMatchingMiddleware(routePath: string): MiddlewareHandler<UbeanEnv>[] {
    return loadedUserMiddleware.filter(mw => matchMiddlewarePath(mw.mountPath, routePath)).map(mw => mw.handler);
  }

  function getHonoLocalePaths(honoPath: string): Array<{ locale: string; path: string }> {
    if (!i18nConfig?.locales?.length || i18nConfig.strategy === 'no_prefix' || honoPath === '*') {
      return [{ locale: i18nConfig?.defaultLocale || 'en', path: honoPath }];
    }
    return compileLocalePaths(honoPath === '/' ? '/' : honoPath, {
      defaultLocale: i18nConfig.defaultLocale || 'en',
      locales: i18nConfig.locales,
      strategy: i18nConfig.strategy || 'prefix_except_default',
      paths: i18nConfig.paths
    }).hono;
  }

  /**
   * `definePage({ redirect })` 的目标,按当前请求的语言补前缀。
   *
   * `c.get('locale')` 是 locale **代码**(`zh-CN`),不是 URL 段(`zh`)——
   * 与 `getHonoLocalePaths` 一样交给 `@ubean/i18n` 换算,不在这里手拼。
   */
  function resolvePageRedirect(target: string, c: Context<UbeanEnv>): string {
    if (!i18nConfig?.locales?.length || i18nConfig.strategy === 'no_prefix') return target;
    return localeRedirectTarget(target, (c.get('locale') as string) || '', {
      defaultLocale: i18nConfig.defaultLocale || 'en',
      locales: i18nConfig.locales,
      strategy: i18nConfig.strategy || 'prefix_except_default',
      paths: i18nConfig.paths
    });
  }

  const hasDefaultLayout = layouts.some(l => l.isDefault);
  const { isPagesRequest, pageJsonResponse, renderPage, renderPageToStream } = pagesMod;
  const pageLoaders = options.pageLoaders;

  /**
   * 捕获页在**未带语言段**的那条路由上注册（`/:pathMatch(.*)*`），所以 Hono 给的
   * `pathMatch` 把语言段也算进去了（`/zh/nope-xyz` → `zh/nope-xyz`），而 vue-router
   * 的 catch-all 落在带语言段的父路由下，客户端算出来的是 `nope-xyz` —— 两侧不一致。
   * 这里把语言段剥掉再写进 page data。
   */
  function stripLocaleSegment(params: Record<string, string>): Record<string, string> {
    const match = params.pathMatch;
    if (match === undefined || !i18nConfig?.locales?.length || i18nConfig.strategy === 'no_prefix') return params;
    const first = match.split('/')[0];
    if (!first) return params;
    const isLocaleSegment = i18nConfig.locales.some(code => localeSegment(code, i18nConfig.paths) === first);
    if (!isLocaleSegment) return params;
    return { ...params, pathMatch: match.slice(first.length + 1) };
  }
  const pageRenderer = options.pageRenderer as Parameters<typeof renderPage>[2] | null | undefined;
  const pageAssetTags = options.pageAssetTags as Parameters<typeof renderPage>[1] | undefined;
  const ssrExclude = options.ssrExclude ?? [];
  const streaming = options.streaming === true;
  // P9-24: 爬虫降级默认开启(仅在 streaming 启用时实际生效)。
  const botFallback = options.botFallback !== false;
  const cacheStore = options.cacheStore;
  const colorModeScript = options.colorModeScript;
  const injectColorMode = (html: string): string =>
    colorModeScript ? html.replace('<head>', `<head>\n    ${colorModeScript}`) : html;

  async function handlePageRequest(
    c: Context<UbeanEnv>,
    page: ScannedPageRoute,
    method: 'GET' | 'POST',
    loaderKey?: string
  ) {
    c.set('route', {
      meta: { requiresAuth: page.pageMeta?.requiresAuth ?? true } as RouteMeta,
      path: c.req.path,
      method: c.req.method
    });

    // 内置全局捕获页（`pages/404.vue`）现在是普通路由，会吃到**任何**未匹配的 URL ——
    // 包括 `/api/*` 与 `/_*`。这两类路径必须给 JSON 404：前者是 API（HTML 404 会让
    // `res.json()` 直接抛解析错误），后者是框架保留命名空间（未匹配说明拼错了）。
    // 旧实现在 `app.get('*')` 兜底里做这件事，捕获得早一步后就落到了这里。
    if (page.isGlobalCatchAll) {
      const path = c.req.path;
      if (path.startsWith('/api/') || path.startsWith('/_')) {
        return c.json({ error: 'Not Found', path, method: c.req.method }, 404);
      }
    }

    // `definePage({ redirect })`: 本路由不渲染组件,GET 直接 302。
    //
    // 必须在客户端路由表里也是重定向记录 —— 否则服务端渲染原页、客户端
    // 跳到目标,水合直接对不上。两侧由同一份扫描元数据驱动(见 virtual-pages.ts)。
    //
    // 302 而非 301:目标可能随配置/内容变化,永久重定向会被浏览器与 CDN 缓存住。
    // `data-only` / CSR 页面同理 —— 重定向与 SSR 开关无关。
    if (method === 'GET' && page.redirect) {
      return c.redirect(resolvePageRedirect(page.redirect, c), 302);
    }

    let loader: (() => Promise<any>) | undefined;
    let mod: any;
    let loaderResult: any;
    let actionResult: any;
    let actionErrors: Record<string, string> | null = null;

    if (pageLoaders) {
      // For reuse routes, `loaderKey` points to the target page's
      // `relativePath` so we load the target's module (which has the
      // `loader()` / `action()` exports). For regular pages, `loaderKey`
      // equals `page.relativePath` (the default).
      loader = pageLoaders[loaderKey ?? page.relativePath];
      if (loader) {
        try {
          mod = await loader();
        } catch {
          // ignore loading errors in dev
        }
      }
    }

    if (method === 'POST') {
      // P9-02: Server Actions — `mod.actions` map (SvelteKit-style `?/name`).
      // Page modules may export an `actions` object whose values are
      // `ServerAction`s created via `defineAction()`. The action name is
      // parsed from the URL search query (`?/login` → `actions.login`).
      const actionsExport = mod?.actions;
      if (actionsExport && typeof actionsExport === 'object') {
        const actionName = _parseFormActionName(c.req.url);
        const action = (actionsExport as Record<string, ServerAction>)[actionName];
        if (action && isServerAction(action)) {
          const res = await _runServerAction(action, c);
          if (res.response) {
            const handled = _handleActionResponse(c, res.response, isPagesRequest);
            if (handled) return handled;
            actionResult = res.response;
          } else if (res.errors) {
            actionErrors = res.errors;
          } else {
            actionResult = res.data;
          }
        }
      }
      // Legacy: `mod.action(c)` function (backward compat).
      else if (mod?.action && typeof mod.action === 'function') {
        try {
          actionResult = await mod.action(c);
          if (actionResult instanceof Response) {
            const handled = _handleActionResponse(c, actionResult, isPagesRequest);
            if (handled) return handled;
          }
          if (actionResult && typeof actionResult === 'object' && 'errors' in actionResult) {
            actionErrors = actionResult.errors as Record<string, string>;
            actionResult = undefined;
          }
        } catch (err) {
          if (err instanceof Response) {
            const handled = _handleActionResponse(c, err, isPagesRequest);
            if (handled) return handled;
            return err;
          }
          if (isPagesRequest(c)) {
            return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
          }
          actionErrors = { _error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const routeRule = c.get('routeRule') as RouteRule | undefined;
    const isrRule = normalizeIsrRule(routeRule?.isr);
    const pprEnabled = routeRule?.ppr === true;
    // 服务端无法知道客户端的路由表（它是构建期烧进产物的），所以“未匹配”这件事
    // 只有渲染器在场时才成立：显式 `ssr: false` / `ssr.exclude` / 无 renderer 时
    // 服务端只发 CSR 外壳，对 404 的判断是猜的。
    const serverRenders = pageRenderer != null && !matchAnyGlob(c.req.path, ssrExclude);
    const selected = resolveSelectSsr({
      pageSsr: page.pageMeta?.ssr as boolean | 'streaming' | 'data-only' | undefined,
      routeRuleSsr: routeRule?.ssr,
      ppr: pprEnabled,
      excludedByGlob: !serverRenders,
      streaming
    });
    const routeStreaming = selected.mode === 'streaming';
    const renderer = selected.useRenderer ? (pageRenderer ?? null) : null;

    if (selected.runLoader && mod?.loader && typeof mod.loader === 'function') {
      try {
        loaderResult = await mod.loader(c);
        if (loaderResult instanceof Response) return loaderResult;
      } catch {
        // ignore loader errors in dev
      }
    }

    const props: Record<string, unknown> = { ...loaderResult } as Record<string, unknown>;
    if (actionResult !== undefined && actionResult && typeof actionResult === 'object') {
      Object.assign(props, actionResult as Record<string, unknown>);
    }

    const pageComponent = page.reuseTarget || page.name;

    const pageObj = {
      component: pageComponent,
      props,
      params: stripLocaleSegment(c.req.param()),
      url: c.req.path + (c.req.url.includes('?') ? new URL(c.req.url).search : ''),
      layout: (page.layout === false
        ? false
        : page.layout || page.pageMeta?.layout || (hasDefaultLayout ? 'default' : false)) as string | false | undefined,
      errors: actionErrors,
      head: page.pageMeta?.head
    };

    if (isPagesRequest(c)) {
      return pageJsonResponse(pageObj);
    }

    if (method === 'POST' && actionResult instanceof Response) {
      return actionResult;
    }

    const currentLocale = (c.get('locale') as string) || '';
    const renderContext: Record<string, unknown> = { locale: currentLocale, localeDir: 'ltr' as const };

    // Routing config must be in the SSR payload even if message catalogs fail
    // to load — the client hydrates `switchLocalePath` / `setLocale` from it.
    if (i18nConfig) {
      renderContext.routing = {
        defaultLocale: i18nConfig.defaultLocale || 'en',
        locales: i18nConfig.locales || [],
        strategy: i18nConfig.strategy || 'prefix_except_default',
        ...(i18nConfig.paths ? { paths: i18nConfig.paths } : {})
      };
      if (i18nConfig.cookieName) renderContext.cookieName = i18nConfig.cookieName;
      if (i18nConfig.baseUrl) renderContext.baseUrl = i18nConfig.baseUrl;
    }

    // Load i18n lazily — only needed when rendering HTML pages
    const i18nMod = await loadI18n();
    if (i18nMod && currentLocale) {
      renderContext.localeDir = i18nMod.getLocaleDir(currentLocale);
      renderContext.messages = i18nMod.getLocaleMessages(currentLocale);
      const fallback = i18nMod.getFallbackLocale();
      renderContext.fallbackLocale = fallback;
      if (fallback !== currentLocale) {
        renderContext.fallbackMessages = i18nMod.getLocaleMessages(fallback);
      }
      renderContext.availableLocales = i18nMod.getRegisteredLocalesMeta();
    }

    const htmlHeaders: Record<string, string> = { 'X-SSR-Mode': ssrModeHeader(selected.mode) };
    if (pprEnabled) htmlHeaders['X-PPR'] = 'streaming';

    // ISR(P9-03):仅对 GET 请求、且配置了 cacheStore 与 isr 规则时启用。
    // 渲染函数封装为同步重新生成入口,供 serveIsr 命中失败时调用。
    if (isrRule && cacheStore && method === 'GET') {
      const pathname = new URL(c.req.url).pathname;
      const isrResponse = await serveIsr(c, {
        pathname,
        rule: isrRule,
        store: cacheStore,
        render: async () => {
          const html = await renderPage(
            pageObj as Parameters<typeof renderPage>[0],
            pageAssetTags ?? {},
            renderer,
            'app',
            renderContext as Parameters<typeof renderPage>[4]
          );
          return { html, status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...htmlHeaders } };
        }
      });
      if (isrResponse) {
        return isrResponse;
      }
    }

    // 流式 SSR:当启用且 renderer 支持时,返回 ReadableStream 响应。
    // 回退:renderer 不支持流式时,renderPageToStream 内部自动降级为缓冲渲染。
    // Streaming responses advertise `X-SSR-Mode`. `ppr: true` also sets
    // `X-PPR: streaming` so operators know this is not a Next static shell.
    // P9-24: 爬虫/社交预览 UA 降级为缓冲渲染,保证动态 `<head>` metadata
    //         出现在初始响应中(社交爬虫只解析初始 `<head>`)。
    const userAgent = c.req.header('user-agent');
    const isBot = botFallback && isBotUserAgent(userAgent);
    if (routeStreaming && renderer && !isBot) {
      const stream = renderPageToStream(
        pageObj as Parameters<typeof renderPageToStream>[0],
        pageAssetTags ?? {},
        renderer,
        'app',
        renderContext as Parameters<typeof renderPageToStream>[4]
      );
      return c.body(stream, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...htmlHeaders
        },
        ...(method === 'POST' && actionErrors ? { status: 422 } : {})
      });
    }

    const html = await renderPage(
      pageObj as Parameters<typeof renderPage>[0],
      pageAssetTags ?? {},
      renderer,
      'app',
      renderContext as Parameters<typeof renderPage>[4]
    );
    // 全局捕获路由就是 404 页：URL 未匹配任何页面。带上 404 状态码，
    // 否则搜索引擎与监控会把不存在的页面当成 200 收录（捕获页自己也有真实路由，
    // 因此不能用 `options.notFoundPage` 兜底那层来判断）。
    return c.html(injectColorMode(html), {
      // 服务端渲染了 404 页 = URL 确实未匹配任何页面 → 404。
      // CSR 外壳时服务端没有渲染，无法断言“不存在” → 200（对齐 Nuxt `ssr: false`
      // 的 `200.html`：客户端路由表是构建期产物，服务端不可能知道它有哪些路由）。
      status: page.isGlobalCatchAll && selected.mode !== 'csr' ? 404 : 200,
      headers: htmlHeaders,
      ...(method === 'POST' && actionErrors ? { status: 422 } : {})
    });
  }

  // Build name → page map so reuse routes can resolve their target page's
  // loader. The `.reuse.ts` file only contains `definePage` metadata, not a
  // Vue component — reuse routes must share the target's module loader to
  // access `loader()` / `action()` exports defined on the target page.
  const pageByName = new Map<string, ScannedPageRoute>();
  for (const p of pages) pageByName.set(p.name, p);

  // Register specific routes before catch-all routes. Hono's RegExpRouter
  // matches in registration order, so a catch-all ('*') registered before
  // '/' would swallow the homepage. See `sortPagesForRegistration`.
  //
  // `routable: false` 的页面跳过注册 —— 它们只是扫描清单里的条目（菜单目录、外链
  // 入口等）。若照旧注册，这些 URL 会返回 HTML，而客户端没有对应路由，SSR 与水合
  // 直接对不上。
  const routablePages = pages.filter(p => p.routable !== false);
  const sortedPages = sortPagesForRegistration(routablePages);

  for (const page of sortedPages) {
    // Reuse routes are no longer skipped — they need their own Hono route
    // handler registered at their path. The component resolution already
    // uses `page.reuseTarget` (see handlePageRequest), and the loader is
    // resolved to the target's `relativePath` via `pageByName` below.
    const honoPath = convertUbeanRoutePath(page.route);
    const matchingMiddleware = getMatchingMiddleware(honoPath);
    const pageMeta = { requiresAuth: page.pageMeta?.requiresAuth ?? true } as RouteMeta;

    // Task 7 (P1): 动态路由 matchers —— 在 localeMetaMiddleware 之后、页面 handler 之前
    // 插入参数校验中间件。若 `page.matchers` 存在且任一 matcher 返回 falsy,
    // 立即返回 404(不调用 `next()`,跳过该路由,让 Hono 继续匹配下一候选路由
    // 或最终落入 404 catch-all)。无 matchers 的路由此中间件直接 `next()`(零开销)。
    const matcherMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
      if (!page.matchers) {
        await next();
        return;
      }
      const params = c.req.param();
      if (!_validateParams(page.matchers, params)) {
        // matcher 拒绝:返回 404 让 Hono 继续匹配其他候选路由。
        // 注意:这里返回 JSON 404 仅在被 catch-all 兜底前可见;Hono 的 `*`
        // 兜底处理器(`notFoundPage`)会重新接管浏览器导航请求的 HTML 404 渲染。
        return c.json({ error: 'Not Found', path: c.req.path, method: c.req.method }, 404);
      }
      await next();
    };

    // For reuse routes, the loader key points to the target page's
    // `relativePath` so `pageLoaders[loaderKey]` finds the target's module.
    const loaderKey =
      resolvePageKind(page) === 'reuse' && page.reuseTarget
        ? (pageByName.get(page.reuseTarget)?.relativePath ?? page.relativePath)
        : page.relativePath;

    const pageHandler = (method: 'GET' | 'POST') => async (c: Context<UbeanEnv>) =>
      handlePageRequest(c, page, method, loaderKey);

    for (const { path: mountPath } of getHonoLocalePaths(honoPath)) {
      const localeMetaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
        c.set('route', { meta: pageMeta, path: c.req.path, method: c.req.method });
        await next();
      };
      app.on(['GET'], mountPath, localeMetaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('GET'));
      app.on(['POST'], mountPath, localeMetaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('POST'));
    }
  }

  // 404 catch-all: register a fallback GET handler that renders the
  // `pages/404.vue` component for unmatched browser navigation requests.
  // Hono 的 `*` 兜底**不会**自动让位于更具体的路径：它按注册顺序参与匹配，因此内置
  // `_` 前缀路由（`/_openapi.json`、`/_scalar` 等）必须在调用本函数之前注册，否则会被
  // 这个兜底抢先匹配成 404（实测；`/_health` 因注册更早而未受影响）。
  //
  // 本兜底只给**浏览器导航**用。用户的 `[...slug].vue` 作为普通页面已在上面的循环里
  // 注册成真正的路由（跑 loader / actions / 返回 200）；这里是「连捕获页都没有」时的最后一层。
  if (options.notFoundPage) {
    const notFoundPage = options.notFoundPage;
    const pageAssetTagsOpt = options.pageAssetTags;
    const _ssrExclude = options.ssrExclude ?? [];
    const pageRendererOpt = options.pageRenderer as Parameters<typeof renderPage>[2] | null | undefined;

    app.get('*', async (c: Context<UbeanEnv>) => {
      // Skip API and internal paths — let the default notFound handler
      // return JSON for those.
      const path = c.req.path;
      if (path.startsWith('/api/') || path.startsWith('/_')) {
        return c.json({ error: 'Not Found', path, method: c.req.method }, 404);
      }

      // For SPA page requests, return the page data as JSON
      if (isPagesRequest(c)) {
        return pageJsonResponse({
          component: NOT_FOUND_ROUTE_NAME,
          props: {},
          params: {},
          url: path + (c.req.url.includes('?') ? new URL(c.req.url).search : ''),
          layout:
            (Array.isArray(notFoundPage.layout) ? notFoundPage.layout[0] : notFoundPage.layout) ??
            (layouts.some(l => l.isDefault) ? 'default' : false),
          errors: null,
          head: notFoundPage.pageMeta?.head
        });
      }

      // For browser navigation, render the 404 page (SSR if available, CSR fallback)
      const currentLocale = (c.get('locale') as string) || '';
      const renderContext: Record<string, unknown> = { locale: currentLocale, localeDir: 'ltr' as const };
      const i18nMod = await loadI18n();
      if (i18nMod && currentLocale) {
        renderContext.localeDir = i18nMod.getLocaleDir(currentLocale);
        renderContext.messages = i18nMod.getLocaleMessages(currentLocale);
        const fallback = i18nMod.getFallbackLocale();
        renderContext.fallbackLocale = fallback;
        if (fallback !== currentLocale) {
          renderContext.fallbackMessages = i18nMod.getLocaleMessages(fallback);
        }
        renderContext.availableLocales = i18nMod.getRegisteredLocalesMeta();
      }

      const pageObj = {
        component: 'NotFound',
        props: {},
        params: {},
        url: path + (c.req.url.includes('?') ? new URL(c.req.url).search : ''),
        layout: notFoundPage.layout ?? (layouts.some(l => l.isDefault) ? 'default' : false),
        errors: null,
        head: notFoundPage.pageMeta?.head
      };

      // 与主页面处理器同一套判定：`X-SSR-Mode` 必须反映**实际**用了什么，
      // 之前这里硬编码 404 + 不发 header，于是 `ssr: false` 的项目在 dev 下
      // 看到 `x-ssr-mode: ssr` 配 `data-ubean-ssr="false"` 的自相矛盾响应。
      const routeRule = c.get('routeRule') as RouteRule | undefined;
      const selected = resolveSelectSsr({
        routeRuleSsr: routeRule?.ssr,
        ppr: routeRule?.ppr === true,
        excludedByGlob: matchAnyGlob(c.req.path, _ssrExclude) || !pageRendererOpt,
        streaming
      });
      const renderer = selected.useRenderer ? (pageRendererOpt ?? null) : null;
      const htmlHeaders: Record<string, string> = { 'X-SSR-Mode': ssrModeHeader(selected.mode) };
      if (routeRule?.ppr === true) htmlHeaders['X-PPR'] = 'streaming';
      // 渲染了 404 页 = URL 确实未匹配 → 404；CSR 外壳 = 服务端没渲染，
      // 无法断言“不存在” → 200（见 `handlePageRequest` 的同一判定）。
      const status = selected.mode === 'csr' ? 200 : 404;

      // 流式 SSR(与主页面处理器一致);P9-24: 爬虫 UA 降级为缓冲渲染。
      const userAgent = c.req.header('user-agent');
      const isBot = botFallback && isBotUserAgent(userAgent);
      if (selected.mode === 'streaming' && renderer && !isBot) {
        const stream = renderPageToStream(
          pageObj as Parameters<typeof renderPageToStream>[0],
          pageAssetTagsOpt ?? {},
          renderer,
          'app',
          renderContext as Parameters<typeof renderPageToStream>[4]
        );
        return c.body(stream, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...htmlHeaders },
          status
        });
      }

      const html = await renderPage(
        pageObj as Parameters<typeof renderPage>[0],
        pageAssetTagsOpt ?? {},
        renderer,
        'app',
        renderContext as Parameters<typeof renderPage>[4]
      );
      return c.html(injectColorMode(html), { status, headers: htmlHeaders });
    });
  }
}

/* -------------------------------------------------------------------------- */
/* registerRoutes — convenience wrapper (API + pages)                        */
/* -------------------------------------------------------------------------- */

export async function registerRoutes(app: RouteRegistrar, options: RegisterOptions): Promise<void> {
  await registerApiRoutes(app, options);
  await registerPageRoutes(app, options);
}

export function createRouteLoader(importMetaGlob: Record<string, () => Promise<any>>) {
  return Object.fromEntries(
    Object.entries(importMetaGlob).map(([key, loader]) => {
      const normalized = key.replace(/^\.\//, '');
      return [normalized, loader];
    })
  );
}
