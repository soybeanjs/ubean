import type { Context, Next, MiddlewareHandler, Hono } from 'hono';
import { validateParams as _validateParams } from '@ubean/scan';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from '@ubean/scan';
import { isServerAction } from '@ubean/shared';
import type { UbeanEnv, RouteMeta, UbeanMiddleware, RouteRule, ServerAction } from '@ubean/shared';
import { matchAnyGlob } from '@ubean/shared';
import { isBotUserAgent } from './bot-detection';
import {
  parseFormActionName as _parseFormActionName,
  handleActionResponse as _handleActionResponse,
  runServerAction as _runServerAction
} from './page-actions';
import { extractRouteMeta, isHandlerChain } from './handler';
import { serveIsr } from './isr';
import type { IsrCacheStore } from './isr';
import { normalizeIsrRule } from './route-rules';

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
    strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
    defaultLocale?: string;
    locales?: string[];
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

function convertUbeanRoutePath(path: string): string {
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
  return honoPath;
}

/**
 * Sort page routes so catch-all routes (`/**:slug`, converted to Hono `*`)
 * are registered last. Hono's RegExpRouter matches in registration order,
 * so a catch-all registered before a specific path (e.g. `/`) would swallow
 * it. File-system sort order puts `[...slug].vue` before `index.vue`
 * (`[` < `i`), which is wrong for Hono — this sort corrects it.
 *
 * Stable: non-catch-all pages keep their original relative order.
 */
export function sortPagesForRegistration<T extends { route: string }>(pages: readonly T[]): T[] {
  return [...pages].sort((a, b) => {
    const aCatchall = /\/\*\*:/.test(a.route);
    const bCatchall = /\/\*\*:/.test(b.route);
    if (aCatchall && !bCatchall) return 1;
    if (!aCatchall && bCatchall) return -1;
    return 0;
  });
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
/* over @ubean/actions primitives (runAction).                                */
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

  for (const [honoPath, pathMethods] of routesByPath) {
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

  function getLocalePrefixedPaths(honoPath: string): Array<{ locale: string; path: string }> {
    if (!i18nConfig) return [];
    const { strategy, defaultLocale, locales = [] } = i18nConfig;
    if (strategy === 'no_prefix') return [];

    const result: Array<{ locale: string; path: string }> = [];
    for (const locale of locales) {
      if (strategy === 'prefix_except_default' && locale === defaultLocale) continue;
      const cleanPath = honoPath === '/' ? '' : honoPath;
      result.push({ locale, path: `/${locale}${cleanPath}` });
    }
    return result;
  }

  const hasDefaultLayout = layouts.some(l => l.isDefault);
  const { isPagesRequest, pageJsonResponse, renderPage, renderPageToStream } = pagesMod;
  const pageLoaders = options.pageLoaders;
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

    if (mod?.loader && typeof mod.loader === 'function') {
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
      params: c.req.param(),
      url:
        ((c.get('pathWithoutLocale') as string | undefined) || c.req.path) +
        (c.req.url.includes('?') ? new URL(c.req.url).search : ''),
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

    // Load i18n lazily — only needed when rendering HTML pages
    const i18nMod = await loadI18n();
    if (i18nMod && currentLocale) {
      renderContext.localeDir = i18nMod.getLocaleDir(currentLocale);
      renderContext.messages = i18nMod.getLocaleMessages(currentLocale);
      renderContext.availableLocales = i18nMod.getRegisteredLocalesMeta();
    }

    // P9-03: per-route 渲染规则 —— 从 context 读取匹配的 routeRule,
    // 覆盖全局 ssr.exclude / streaming 配置。
    // P9-04: `ppr: true` 隐式等价于 `ssr: 'streaming'`(强制流式 SSR + 覆盖 exclude)。
    const routeRule = c.get('routeRule') as RouteRule | undefined;
    const perRouteSsr = routeRule?.ssr;
    const isrRule = normalizeIsrRule(routeRule?.isr);
    const pprEnabled = routeRule?.ppr === true;

    // SSR exclude: matched pages skip server rendering → CSR shell.
    // per-route `ssr` 规则覆盖全局 exclude:
    //   - `ssr: false`  → 强制 CSR(即使全局未排除)
    //   - `ssr: true`   → 强制 SSR(即使命中全局 exclude)
    //   - `ssr: 'streaming'` → 强制 SSR + 流式输出
    // P9-04: `ppr: true` → 强制 SSR + 流式输出(等价于 `ssr: 'streaming'`)
    let excluded = matchAnyGlob(page.route, ssrExclude);
    let routeStreaming = streaming;
    if (perRouteSsr === false) {
      excluded = true;
    } else if (perRouteSsr === true) {
      excluded = false;
    } else if (perRouteSsr === 'streaming') {
      excluded = false;
      routeStreaming = true;
    } else if (pprEnabled) {
      // PPR 需要流式 SSR(Suspense 边界流式输出动态内容)
      excluded = false;
      routeStreaming = true;
    }
    const renderer = excluded ? null : (pageRenderer ?? null);

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
          return { html, status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } };
        }
      });
      if (isrResponse) {
        return isrResponse;
      }
    }

    // 流式 SSR:当启用且 renderer 支持时,返回 ReadableStream 响应。
    // 回退:renderer 不支持流式时,renderPageToStream 内部自动降级为缓冲渲染。
    // P9-04: PPR 路由也走此分支(ppr: true → routeStreaming = true),
    //         响应头附加 `X-PPR: true` 标记,便于调试与可观测性。
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
      const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
      if (pprEnabled) headers['X-PPR'] = 'true';
      return c.body(stream, {
        headers,
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
    return c.html(injectColorMode(html), method === 'POST' && actionErrors ? { status: 422 } : undefined);
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
  const sortedPages = sortPagesForRegistration(pages);

  for (const page of sortedPages) {
    // Reuse routes are no longer skipped — they need their own Hono route
    // handler registered at their path. The component resolution already
    // uses `page.reuseTarget` (see handlePageRequest), and the loader is
    // resolved to the target's `relativePath` via `pageByName` below.
    const honoPath = convertUbeanRoutePath(page.route);
    const matchingMiddleware = getMatchingMiddleware(honoPath);
    const pageMeta = { requiresAuth: page.pageMeta?.requiresAuth ?? true } as RouteMeta;

    const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
      c.set('route', { meta: pageMeta, path: c.req.path, method: c.req.method });
      await next();
    };

    // Task 7 (P1): 动态路由 matchers —— 在 metaMiddleware 之后、页面 handler 之前
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
      page.isReuse && page.reuseTarget
        ? (pageByName.get(page.reuseTarget)?.relativePath ?? page.relativePath)
        : page.relativePath;

    const pageHandler = (method: 'GET' | 'POST') => async (c: Context<UbeanEnv>) =>
      handlePageRequest(c, page, method, loaderKey);

    app.on(['GET'], honoPath, metaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('GET'));
    app.on(['POST'], honoPath, metaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('POST'));

    for (const { path: localePath } of getLocalePrefixedPaths(honoPath)) {
      const localeMetaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
        c.set('route', { meta: pageMeta, path: c.req.path, method: c.req.method });
        await next();
      };
      app.on(['GET'], localePath, localeMetaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('GET'));
      app.on(['POST'], localePath, localeMetaMiddleware, matcherMiddleware, ...matchingMiddleware, pageHandler('POST'));
    }
  }

  // 404 catch-all: register a fallback GET handler that renders the
  // `pages/404.vue` component for unmatched browser navigation requests.
  // Hono's router (rou3) gives priority to specific paths, so `*` only
  // fires when no registered route matches.
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
          component: 'NotFound',
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

      // SSR exclude: if the 404 route matches an exclude pattern, use CSR
      const excluded = matchAnyGlob('/*', _ssrExclude);
      const renderer = excluded ? null : (pageRendererOpt ?? null);

      // 流式 SSR(与主页面处理器一致);P9-24: 爬虫 UA 降级为缓冲渲染。
      const userAgent = c.req.header('user-agent');
      const isBot = botFallback && isBotUserAgent(userAgent);
      if (streaming && renderer && !isBot) {
        const stream = renderPageToStream(
          pageObj as Parameters<typeof renderPageToStream>[0],
          pageAssetTagsOpt ?? {},
          renderer,
          'app',
          renderContext as Parameters<typeof renderPageToStream>[4]
        );
        return c.body(stream, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          status: 404
        });
      }

      const html = await renderPage(
        pageObj as Parameters<typeof renderPage>[0],
        pageAssetTagsOpt ?? {},
        renderer,
        'app',
        renderContext as Parameters<typeof renderPage>[4]
      );
      return c.html(injectColorMode(html), 404);
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

// Re-export Hono type for convenience
export type { Hono };
