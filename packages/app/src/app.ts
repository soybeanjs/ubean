import { AsyncLocalStorage } from 'node:async_hooks';
import { createI18nMiddleware, ensureLocaleMessages } from '@ubean/i18n';
import { createServerComponentMiddleware, SERVER_COMPONENT_ENDPOINT } from '@ubean/islands/server';
import {
  createActionsMiddleware,
  ACTIONS_ENDPOINT,
  bindActionContextStorage,
  buildActionContext,
  registerRoutes,
  setInternalFetcher,
  registerOpenAPIRoutes,
  SCALAR_SCRIPT_ORIGIN,
  createRouteRulesMiddleware
} from '@ubean/routes';
import type { RouteRegistrar, RegisterOptions, IsrCacheStore } from '@ubean/routes';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout, ScannedCronTask } from '@ubean/scan';
// Semantic subpath imports (ADR-0003 OPT-06) — avoids pulling the whole
// `@ubean/server` barrel (30 modules) into type resolution for this package.
import {
  createCacheMiddleware,
  resolveRouteCacheRules,
  useCacheStore,
  createMemoryStore,
  createLazyCacheStore,
  loadFsCacheStore
} from '@ubean/server/cache';
import type { CacheStore } from '@ubean/server/cache';
import { createDataCacheMiddleware } from '@ubean/server/middleware';
import type { DataCacheMiddlewareOptions } from '@ubean/server/middleware';
import { createWebSocketMiddleware } from '@ubean/server/realtime';
import {
  createCsrfMiddleware,
  createSecurityHeadersMiddleware,
  extendCspScriptSrc,
  mergeSecurityHeadersOptions,
  serializeCsp
} from '@ubean/server/security';
import type { CsrfOptions, SecurityHeadersOptions } from '@ubean/server/security';
import { errorToResponse, isNodeRuntime, isUbeanError, UbeanError } from '@ubean/shared';
import type {
  RouteRule,
  UbeanEnv,
  RouteMeta,
  UbeanMiddleware,
  UbeanMiddlewareStep,
  ComposedHandler,
  ActionContext
} from '@ubean/shared';
import { Hono } from 'hono';
import type { Context, Next, MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import { createHooks } from 'hookable';
import type { Hookable } from 'hookable';
import { join, isAbsolute } from 'pathe';
import { applyHandleHook, applyHandleFetchHook, applyHandleErrorHook } from './hooks';

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

export interface UbeanRuntimeHooks {
  'app:created': (app: Hono<UbeanEnv>) => void | Promise<void>;
  'app:before:register': (app: Hono<UbeanEnv>) => void | Promise<void>;
  'app:after:register': (app: Hono<UbeanEnv>) => void | Promise<void>;
  'request:start': (c: Context<UbeanEnv>) => void | Promise<void>;
  'request:end': (c: Context<UbeanEnv>, res: Response) => void | Promise<void>;
  'request:error': (c: Context<UbeanEnv>, err: Error) => void | Promise<void>;
  'route:register': (route: {
    method: string;
    path: string;
    handler: MiddlewareHandler[] | ComposedHandler | Function;
    meta?: RouteMeta;
  }) => void | Promise<void>;
  'middleware:register': (mw: ScannedMiddleware) => void | Promise<void>;
  error: (err: Error, c: Context<UbeanEnv>) => void | Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Page renderer shape (satisfied by `@ubean/client/ssr`'s `PageRenderer`).
 * Declared as a type alias to the actual `@ubean/pages`'s `PageRenderer`
 * interface so consumers don't need to install `@ubean/pages` separately
 * to type-check against `UbeanAppOptions.pageRenderer`.
 *
 * Type-only import works even when `@ubean/pages` is an optional peerDep —
 * only runtime imports would fail. Consumers without `@ubean/pages` will
 * see this type fall back to `any` (TS' default for missing modules under
 * `skipLibCheck`).
 */
export type PageRenderer = import('@ubean/pages').PageRenderer;

export interface PageAssetTags {
  head?: string;
  bodyAttrs?: string;
  htmlAttrs?: string;
  /** Favicon HREF (如 `/favicon.ico`),自动注入 `<link rel="icon">` 到 `<head>` */
  favicon?: string;
}

export interface UbeanAppOptions {
  rootDir?: string;
  routes?: ScannedApiRoute[];
  middleware?: ScannedMiddleware[];
  pages?: ScannedPageRoute[];
  layouts?: ScannedLayout[];
  crons?: ScannedCronTask[];
  routeRules?: Record<string, RouteRule>;
  plugins?: UbeanAppPlugin[];
  routeLoaders?: Record<
    string,
    () => Promise<
      { default?: ComposedHandler | MiddlewareHandler[] } | Record<string, ComposedHandler | MiddlewareHandler[]>
    >
  >;
  middlewareLoaders?: Record<string, () => Promise<{ default: UbeanMiddleware }>>;
  pageLoaders?: Record<string, () => Promise<unknown>>;
  pageRenderer?: PageRenderer | null;
  pageAssetTags?: PageAssetTags;
  /** 不进行 SSR 的路由模式列表(glob),匹配的页面走 CSR */
  ssrExclude?: string[];
  /**
   * 启用流式 SSR。`true` 时页面响应以 `ReadableStream` 分块输出
   * (头部先发送,app HTML 边渲染边输出),改善 TTFB/LCP。
   * renderer 不支持流式时自动降级为缓冲渲染。
   */
  streaming?: boolean;
  /**
   * 爬虫降级(P9-24):当 `streaming` 启用且检测到爬虫/社交预览 UA 时,
   * 自动降级为缓冲渲染以保证 metadata 出现在初始 `<head>`。
   * 默认 `true`。设为 `false` 可禁用爬虫检测(不推荐)。
   */
  botFallback?: boolean;
  publicDir?: string;
  healthEndpoint?: boolean;
  openAPI?:
    | boolean
    | {
        title?: string;
        version?: string;
        description?: string;
        scalarPath?: string;
        openAPIPath?: string;
      };
  i18nConfig?: {
    enabled?: boolean;
    strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
    defaultLocale?: string;
    locales?: string[] | Array<{ code: string }>;
    detectBrowserLanguage?: false | { cookieName?: string; redirectOn?: 'root' | 'all'; alwaysRedirect?: boolean };
    fallbackLocale?: string;
    baseUrl?: string;
  };
  /** `pages/404.vue` 自动检测的 404 页面,注册为 Hono 兜底处理器 */
  notFoundPage?: ScannedPageRoute;
  /**
   * Pre-rendered no-FOUC color-mode script (from `getColorModeScript`).
   * Injected into `<head>` of every SSR/prerendered HTML response. Covers
   * the SSG/prerender path that bypasses Vite's `transformIndexHtml`.
   */
  colorModeScript?: string;
  /**
   * CSRF protection. Default `true` (origin check). `false` disables.
   * Pass `CsrfOptions` to override (e.g. token mode).
   */
  csrf?: boolean | CsrfOptions;
  /**
   * Security response headers. Default `true`. `false` disables.
   */
  securityHeaders?: boolean | SecurityHeadersOptions;
  /**
   * Cross-request fetch Data Cache (`next: { revalidate, tags }`).
   * Default `true`. Dev still skips cache unless `forceDevCache`.
   */
  dataCache?: boolean | DataCacheMiddlewareOptions;
  /**
   * HTTP / ISR cache store. Default is in-process memory (not shared
   * across instances). Pass `loadFsCacheStore(dir)`（Node fs 后端，动态加载）for a Node backend.
   */
  cacheStore?: CacheStore;
  /** Declarative cache backend. `store: 'fs'` 走 `loadFsCacheStore()`（Node-only，动态加载）。 */
  cache?: { store?: 'memory' | 'fs'; dir?: string };
  /**
   * File-convention SEO (`src/sitemap.ts`, `robots.ts`, …). Default: on when
   * `rootDir` or `seoConventions.srcDir` is set. `false` disables.
   */
  seoConventions?: boolean | { srcDir?: string };
  /**
   * Preloaded SEO convention modules (production `import.meta.glob`). When
   * set, disk discovery is skipped — required on serverless.
   */
  seoConventionModules?: Record<string, { default?: unknown }>;
  /**
   * Production `/_ipx` handler (from `@ubean/image` when `image` is enabled).
   * Dev still uses the Vite middleware.
   */
  ipxHandler?: MiddlewareHandler<UbeanEnv>;
}

const actionContextAls = new AsyncLocalStorage<ActionContext>();
bindActionContextStorage(actionContextAls);

const DEFAULT_CSRF_EXCLUDE = ['/_health', '/_openapi.json', '/_scalar', '/_ipx/**', '/_devtools/**', '/_iconify/**'];

const DEFAULT_SECURITY_HEADERS: SecurityHeadersOptions = {
  strictTransportSecurity: false,
  contentSecurityPolicy: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'ws:', 'wss:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"]
  }
};

function resolveToggle<T extends object>(value: boolean | T | undefined, defaultOn: boolean): false | T {
  if (value === false) return false;
  if (value === undefined) return defaultOn ? ({} as T) : false;
  if (value === true) return {} as T;
  return value;
}

/**
 * TS-07：把中间件链的每一步按**注册/执行顺序**记进请求级变量。
 *
 * 顺序是结构性事实 —— 13 步表（见 `_setupBaseMiddleware()` 与本包 middleware-order 测试）把它
 * 固定下来，改动注册顺序即破坏契约。记录值只用于可观测性断言（`GET /_health` 回读），不参与任何请求处理逻辑。
 */
function markMiddlewareStep(c: Context<UbeanEnv>, step: UbeanMiddlewareStep): void {
  const recorded = c.get('__ubean_mw_order__');
  c.set('__ubean_mw_order__', recorded ? [...recorded, step] : [step]);
}

/** 给中间件套一层「记录步骤名」外壳；注册顺序与不套壳时完全一致。 */
function withStep(step: UbeanMiddlewareStep, handler: MiddlewareHandler<UbeanEnv>): MiddlewareHandler<UbeanEnv> {
  return async (c: Context<UbeanEnv>, next: Next) => {
    markMiddlewareStep(c, step);
    // 必须转发返回值：短路型中间件（缓存命中 / i18n 重定向 / CSRF 拒绝）靠 `return Response`
    // 结束请求而不写 `c.res`；丢弃返回值会让 Hono 判定 `Context is not finalized` 并返回 500。
    return handler(c, next);
  };
}

/**
 * TS-07：链上存在「不是中间件、但有固定位置」的步骤（如 ⑦ cacheStore 初始化）。
 *
 * 为了让 13 步全序可观测，这里在该位置插一个**纯记录、纯透传**的空壳：它不读不写请求、
 * 不改响应，只把步骤名按注册位置记进请求级序列。
 */
function recordOnlyStep(step: UbeanMiddlewareStep): MiddlewareHandler<UbeanEnv> {
  return async (c: Context<UbeanEnv>, next: Next) => {
    markMiddlewareStep(c, step);
    return next();
  };
}

export interface UbeanAppPlugin {
  name: string;
  /** Called after app is created but before routes are registered */
  setup?: (app: UbeanApp) => void | Promise<void>;
  /** Called after all routes are registered */
  ready?: (app: UbeanApp) => void | Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* UbeanApp                                                                    */
/* -------------------------------------------------------------------------- */

export class UbeanApp {
  readonly hono: Hono<UbeanEnv>;
  readonly hooks: Hookable<UbeanRuntimeHooks>;
  readonly plugins: UbeanAppPlugin[];
  readonly options: UbeanAppOptions;
  private _ready = false;
  /**
   * Scalar 文档页（`/_scalar`）专用的 CSP：生效 CSP + `{@link SCALAR_SCRIPT_ORIGIN}`。
   *
   * 该页面从 CDN 取脚本，而 CSP 是全局的一份 —— 只在这一条响应上追加它需要的来源，不放宽应用
   * 其余部分的策略。CSP 被关闭时为 `undefined`（不重加头）。构造期算好，`init()` 注册路由时用。
   */
  private _scalarCsp: string | undefined;

  constructor(options: UbeanAppOptions = {}) {
    this.options = options;
    this.hono = new Hono<UbeanEnv>({ strict: false });
    this.hooks = createHooks<UbeanRuntimeHooks>();
    this.plugins = options.plugins || [];

    this._setupBaseMiddleware();
    this._setupFallback();
  }

  private _setupBaseMiddleware(): void {
    // 本方法就是「13 步中间件链」的唯一事实来源 —— 注册顺序即契约。
    // 每个中间件按注册顺序包一层 `withStep()`，把步骤名写进请求级 `__ubean_mw_order__`；非中间件的
    // 两步（⑦ cacheStore 初始化、⑬ /_health）在各自位置单独打点。
    // ① handle ② requestId ③ actionContext ④ securityHeaders ⑤ csrf ⑥ dataCache ⑦ cacheStore
    // ⑧ i18n ⑨ routeRules ⑩ routeCache ⑪ websocket ⑫ lifecycle ⑬ healthEndpoint
    // 被配置关闭的步骤整段不注册，于是在序列里整段缺席（TS-07 验收③）。
    //
    // P9-09: Global `handle` hook — registered FIRST so it wraps everything
    // (all middleware, routes, 404, and error responses). The hook is stored
    // in a global registry set by `applyServerConfig`. If no `handle` hook
    // is registered, `applyHandleHook` returns `false` and the request
    // proceeds normally via `next()`. When a `handle` hook IS registered,
    // it owns the response (it must call `resolve` to invoke downstream
    // handlers, or return its own Response to short-circuit).
    this.hono.use(
      '*',
      withStep('handle', async (c: Context<UbeanEnv>, next: Next) => {
        const handled = await applyHandleHook(c, next);
        if (!handled) {
          // No global `handle` hook — proceed with normal middleware chain
          await next();
        }
      })
    );

    this.hono.use('*', withStep('requestId', requestId()));

    this.hono.use(
      '*',
      withStep('actionContext', async (c: Context<UbeanEnv>, next: Next) => {
        await actionContextAls.run(buildActionContext(c), () => next());
      })
    );

    const securityHeaders = resolveToggle(this.options.securityHeaders, true);
    if (securityHeaders !== false) {
      // 深合并:用户只覆盖单个 CSP 指令时(如 connect-src),其余指令保持框架默认
      const mergedSecurity = mergeSecurityHeadersOptions(DEFAULT_SECURITY_HEADERS, securityHeaders);
      this.hono.use('*', withStep('securityHeaders', createSecurityHeadersMiddleware(mergedSecurity)));

      // 框架内置的 Scalar 文档页从 CDN 取脚本；生效 CSP 未必允许它（默认 `script-src 'self'`
      // 就挡住了，表现为 DevTools 的 API Docs 面板整页空白）。这里算出该页专用的一份。
      const effectiveCsp = mergedSecurity.contentSecurityPolicy;
      if (effectiveCsp && typeof effectiveCsp === 'object') {
        this._scalarCsp = serializeCsp(extendCspScriptSrc(effectiveCsp, [SCALAR_SCRIPT_ORIGIN]));
      }
    }

    const csrf = resolveToggle(this.options.csrf, true);
    if (csrf !== false) {
      this.hono.use(
        '*',
        withStep(
          'csrf',
          createCsrfMiddleware({
            mode: 'origin',
            ...csrf,
            exclude: [...DEFAULT_CSRF_EXCLUDE, ...(csrf.exclude ?? [])]
          })
        )
      );
    }

    const dataCache = resolveToggle(this.options.dataCache, true);
    if (dataCache !== false) {
      this.hono.use('*', withStep('dataCache', createDataCacheMiddleware(dataCache)));
    }

    if (this.options.cacheStore) {
      useCacheStore(this.options.cacheStore);
    } else if (this.options.cache?.store === 'fs') {
      // 懒加载：fs 存储静态 import `node:fs/promises`，而本文件在服务端图主链路上 —— 静态导入
      // 会让 worker 产物带上 `node:fs`（workerd 在模块实例化阶段失败）。构造器是同步的，因此用
      // 懒包装（首次使用时才加载）；worker 侧 `store` 永远不是 'fs'（preset 解析为 memory）。
      const fsDir = this.options.cache.dir || '.ubean/cache';
      useCacheStore(createLazyCacheStore(() => loadFsCacheStore(fsDir)));
    }
    // ⑦ cacheStore 初始化本身不是中间件（构造期同步执行），此处在同一位置插纯记录空壳，
    // 让 13 步全序在请求期可观测。仅在真的初始化了 store 时登记。
    if (this.options.cacheStore || this.options.cache?.store === 'fs') {
      this.hono.use('*', recordOnlyStep('cacheStore'));
    }

    const i18nCfg = this.options.i18nConfig;
    const i18nEnabled = i18nCfg?.enabled !== false && (i18nCfg?.locales?.length ?? 0) > 0;
    if (i18nEnabled && i18nCfg) {
      const locales = (i18nCfg.locales || []).map(l => (typeof l === 'string' ? l : l.code));
      this.hono.use(
        '*',
        withStep(
          'i18n',
          createI18nMiddleware({
            defaultLocale: i18nCfg.defaultLocale || 'en',
            locales,
            strategy: i18nCfg.strategy || 'prefix_except_default',
            detectBrowserLanguage: i18nCfg.detectBrowserLanguage,
            loadMessages: (locale, fallback) => ensureLocaleMessages(locale, fallback)
          })
        )
      );
    }

    if (this.options.routeRules && Object.keys(this.options.routeRules).length > 0) {
      this.hono.use(
        '*',
        withStep(
          'routeRules',
          createRouteRulesMiddleware(this.options.routeRules, {
            dispatch: req => Promise.resolve(this.hono.fetch(req))
          })
        )
      );
      const cacheRules = resolveRouteCacheRules(this.options.routeRules);
      // P9-03: 总是初始化全局 cacheStore(即使无 cache 规则),供 ISR 使用。
      // `useCacheStore` 单例,注册一次后续 registerRoutes 可复用。
      const hasIsrRules = Object.values(this.options.routeRules).some(r => r?.isr !== undefined);
      if (Object.keys(cacheRules).length > 0 || hasIsrRules) {
        if (!this.options.cacheStore && this.options.cache?.store !== 'fs') {
          useCacheStore(createMemoryStore());
        }
        if (Object.keys(cacheRules).length > 0) {
          this.hono.use('*', withStep('routeCache', createCacheMiddleware({ rules: cacheRules })));
        }
      }
    }

    this.hono.use('*', withStep('websocket', createWebSocketMiddleware()));

    this.hono.use(
      '*',
      withStep('lifecycle', async (c: Context<UbeanEnv>, next: Next) => {
        c.set('route', {
          meta: { requiresAuth: true } as RouteMeta,
          path: c.req.path,
          method: c.req.method
        });
        await this.hooks.callHook('request:start', c);
        try {
          await next();
          await this.hooks.callHook('request:end', c, c.res as Response);
        } catch (err) {
          await this.hooks.callHook('request:error', c, err as Error);
          throw err;
        }
      })
    );

    if (this.options.healthEndpoint !== false) {
      this.hono.use('*', recordOnlyStep('healthEndpoint'));
      this.hono.get('/_health', (c: Context<UbeanEnv>) => {
        return c.json({ status: 'ok', timestamp: Date.now(), mwOrder: c.get('__ubean_mw_order__') ?? [] });
      });
    }
  }

  async init(): Promise<this> {
    if (this._ready) return this;

    await this.hooks.callHook('app:created', this.hono);

    for (const plugin of this.plugins) {
      if (plugin.setup) {
        await plugin.setup(this);
      }
    }

    await this.hooks.callHook('app:before:register', this.hono);

    // Register the static file middleware BEFORE route handlers so that
    // prerendered HTML files (e.g. dist/public/about/index.html) are served
    // directly instead of re-rendering through SSR. `serveStatic` already
    // skips `/api/*` and `/_*` paths, so API and built-in routes are unaffected.
    // Files that don't exist fall through to `next()` and hit the SSR handler.
    // 仅在 **Node 系运行时**注册：`serveStatic` 读磁盘（`node:fs`），而 Cloudflare Workers 这类
    // 运行时没有文件系统（静态资源由平台层按 `wrangler.toml` 的 `assets.directory` 服务）。
    // 判据与 `import()` 都必须在分支内 —— 静态 import 会把 `node:fs` 留在产物里，workerd 在
    // **模块实例化**阶段就失败，轮不到运行时判断（实测 `No such module "node:fs/promises"`）。
    if (this.options.publicDir && isNodeRuntime()) {
      const { existsSync } = await import('node:fs');
      const publicDir = isAbsolute(this.options.publicDir)
        ? this.options.publicDir
        : this.options.rootDir
          ? join(this.options.rootDir, this.options.publicDir)
          : this.options.publicDir;
      const { serveStatic } = await import('@ubean/server/static');
      if (existsSync(publicDir)) {
        this.hono.use('/*', serveStatic({ publicDir }));
      }
    }

    const registerOpts: RegisterOptions = {
      routes: this.options.routes || [],
      middleware: this.options.middleware || [],
      pages: this.options.pages || [],
      layouts: this.options.layouts || [],
      routeLoaders: this.options.routeLoaders || {},
      middlewareLoaders: this.options.middlewareLoaders || {},
      pageLoaders: this.options.pageLoaders || {},
      pageRenderer: this.options.pageRenderer ?? null,
      pageAssetTags: this.options.pageAssetTags ?? {},
      ssrExclude: this.options.ssrExclude,
      streaming: this.options.streaming,
      botFallback: this.options.botFallback,
      i18nConfig: this.options.i18nConfig
        ? {
            strategy: this.options.i18nConfig.strategy,
            defaultLocale: this.options.i18nConfig.defaultLocale,
            locales: (this.options.i18nConfig.locales || []).map(l => (typeof l === 'string' ? l : l.code)),
            cookieName:
              this.options.i18nConfig.detectBrowserLanguage === false
                ? undefined
                : this.options.i18nConfig.detectBrowserLanguage?.cookieName || 'ubean_locale',
            baseUrl: this.options.i18nConfig.baseUrl
          }
        : undefined,
      notFoundPage: this.options.notFoundPage,
      colorModeScript: this.options.colorModeScript,
      // P9-03: 注入全局 cacheStore 供 ISR 使用。仅当配置了 isr 规则时
      // `useCacheStore()` 才会被初始化(见 `_setupBaseMiddleware`);无 isr
      // 规则时 `useCacheStore` 返回默认内存存储,不影响行为。
      cacheStore:
        this.options.routeRules && Object.keys(this.options.routeRules).length > 0
          ? (useCacheStore() as unknown as IsrCacheStore)
          : undefined
    };

    // 内置 `_` 前缀路由必须在 `registerRoutes` **之前**注册：`pages/404.vue` 存在时，
    // `registerRoutes` 会挂上页面兜底处理器，晚注册的内置路由会被它抢先匹配
    // （实测 `/_openapi.json` / `/_scalar` 变为 404，而更早注册的 `/_health` 不受影响）。
    if (this.options.openAPI) {
      const openAPIOpts = typeof this.options.openAPI === 'object' ? this.options.openAPI : {};
      registerOpenAPIRoutes(this.hono, { ...openAPIOpts, contentSecurityPolicy: this._scalarCsp });
    }

    await registerRoutes(this as unknown as RouteRegistrar, registerOpts);

    if (this.options.ipxHandler) {
      this.hono.get('/_ipx/*', this.options.ipxHandler);
    }

    await this._registerSeoConventions();

    // P9-02: Server Actions — mount the `/__actions` POST endpoint for
    // RPC-style invocation from the client (`useAction()` / `callAction()`).
    // The endpoint looks up actions by ID from the global registry; unknown
    // IDs return 404. Form actions (`?/name`) are handled by the page route
    // POST handler in `registerRoutes`, not here.
    this.hono.on('POST', ACTIONS_ENDPOINT, createActionsMiddleware());

    // Task 9.4: Server Component props re-render — mount the
    // `/__server-component` POST endpoint for `defineServerIsland(Comp, {
    // rerenderOnPropsChange: true })` to refresh server-rendered HTML when
    // client-side props change. The endpoint looks up the component by path
    // from the global registry populated during SSR; unknown paths return 404.
    this.hono.on('POST', SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware());

    await this.hooks.callHook('app:after:register', this.hono);

    // P9-09: Wrap the internal fetcher with `handleFetch` hook so server-side
    // `internalFetch` / `createInternalAdapter` calls can be intercepted
    // (modify headers, URL, inject auth tokens, etc.). When no `handleFetch`
    // hook is registered, `applyHandleFetchHook` falls through to the default
    // fetcher with no overhead beyond a single function call.
    setInternalFetcher((req: Request) =>
      applyHandleFetchHook(req, (r: Request) => Promise.resolve(this.hono.fetch(r)))
    );

    for (const plugin of this.plugins) {
      if (plugin.ready) {
        await plugin.ready(this);
      }
    }

    this._ready = true;
    return this;
  }

  private async _registerSeoConventions(): Promise<void> {
    if (this.options.seoConventions === false) return;
    // 约定文件是**磁盘上的源文件**（`src/sitemap.ts` …），扫描它需要 `node:fs`；worker 运行时
    // 既没有磁盘也没有这个目录。显式传入的模块数组（`seoConventionModules`）不依赖磁盘，照常生效。
    if (!this.options.seoConventionModules && !isNodeRuntime()) return;

    const explicit = typeof this.options.seoConventions === 'object' ? this.options.seoConventions : {};
    const srcDir = explicit.srcDir ?? (this.options.rootDir ? join(this.options.rootDir, 'src') : undefined);

    try {
      const mod = await import('@ubean/seo/conventions');
      if (this.options.seoConventionModules) {
        await mod.registerSeoConventionModules(this, this.options.seoConventionModules);
        return;
      }
      if (!srcDir) return;
      await mod.registerSeoConventions(this, { srcDir });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Cannot find module '@ubean/seo") || message.includes('Failed to resolve')) {
        return;
      }
      throw err;
    }
  }

  private _lazyInitPromise: Promise<this> | null = null;

  lazyInit(): Promise<this> {
    if (this._ready) return Promise.resolve(this);
    if (!this._lazyInitPromise) {
      this._lazyInitPromise = this.init();
    }
    return this._lazyInitPromise;
  }

  resetInit(): void {
    this._ready = false;
    this._lazyInitPromise = null;
  }

  private _setupFallback(): void {
    this.hono.notFound((c: Context<UbeanEnv>) => {
      return c.json({ error: 'Not Found', path: c.req.path, method: c.req.method }, 404);
    });

    this.hono.onError((err: Error, c: Context<UbeanEnv>) => {
      void this.hooks.callHook('error', err, c);
      // P9-09: Call global `handleError` hook for logging/reporting
      const status = isUbeanError(err) ? err.statusCode : 500;
      void applyHandleErrorHook(c, err, status);
      if (isUbeanError(err)) {
        return errorToResponse(c, err);
      }
      return errorToResponse(c, new UbeanError(500, err.message || 'Internal Server Error'));
    });
  }

  use(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this;
  use(...handlers: MiddlewareHandler<UbeanEnv>[]): this;
  use(pathOrHandler: string | MiddlewareHandler<UbeanEnv>, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type UseFn = (...args: [string | MiddlewareHandler<UbeanEnv>, ...MiddlewareHandler<UbeanEnv>[]]) => void;
    (this.hono.use as UseFn)(pathOrHandler, ...handlers);
    return this;
  }

  on(method: string | string[], path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type OnFn = (method: string, path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      (this.hono.on as OnFn)(m, path, ...handlers);
    }
    return this;
  }

  get(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type MethodFn = (path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    (this.hono.get as MethodFn)(path, ...handlers);
    return this;
  }

  post(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type MethodFn = (path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    (this.hono.post as MethodFn)(path, ...handlers);
    return this;
  }

  put(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type MethodFn = (path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    (this.hono.put as MethodFn)(path, ...handlers);
    return this;
  }

  patch(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type MethodFn = (path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    (this.hono.patch as MethodFn)(path, ...handlers);
    return this;
  }

  delete(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]): this {
    type MethodFn = (path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) => void;
    (this.hono.delete as MethodFn)(path, ...handlers);
    return this;
  }

  fetch: Hono<UbeanEnv>['fetch'] = async (...args: Parameters<Hono<UbeanEnv>['fetch']>) => {
    await this.lazyInit();
    return this.hono.fetch(...args);
  };

  request: Hono<UbeanEnv>['request'] = async (...args: Parameters<Hono<UbeanEnv>['request']>) => {
    await this.lazyInit();
    return this.hono.request(...args);
  };
}

/* -------------------------------------------------------------------------- */
/* Factory + Plugin type                                                       */
/* -------------------------------------------------------------------------- */

export interface AppPlugin {
  name: string;
  setup?: (app: Hono<UbeanEnv>) => void | Promise<void>;
}

export function createUbeanApp(options: UbeanAppOptions = {}): UbeanApp {
  return new UbeanApp(options);
}

// NOTE: the public surface of this module (`./app` entry) is re-exported from
// `./index.ts`. Do not add convenience re-exports here — a duplicate export from
// both files makes every symbol look unused to static analysis (knip), and the
// package only exposes the `.` entry anyway.
