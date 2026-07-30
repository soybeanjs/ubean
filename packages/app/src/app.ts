import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { Context, Next, MiddlewareHandler } from 'hono';
import {
  registerRoutes,
  setInternalFetcher,
  registerOpenAPIRoutes,
  createRouteRulesMiddleware
} from '@ubean/api-routes';
import type { RouteRegistrar, RegisterOptions } from '@ubean/api-routes';
import { errorToResponse, isUbeanError, UbeanError } from '@ubean/error';
import type {
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPageRoute,
  ScannedLayout,
  ScannedCronTask
} from '@ubean/routing';
import {
  createCacheMiddleware,
  resolveRouteCacheRules,
  useCacheStore,
  createMemoryStore,
  serveStatic,
  createWebSocketMiddleware
} from '@ubean/server';
import type { RouteRule, UbeanEnv, RouteMeta, UbeanMiddleware, ComposedHandler } from '@ubean/types';
import { requestId } from 'hono/request-id';
import { createHooks } from 'hookable';
import type { Hookable } from 'hookable';
import { join, isAbsolute } from 'pathe';

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
 * Page renderer shape (satisfied by `@ubean/ssr`'s `PageRenderer`).
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
    strategy?: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
    defaultLocale?: string;
    locales?: string[];
  };
  /** `pages/404.vue` 自动检测的 404 页面,注册为 Hono 兜底处理器 */
  notFoundPage?: ScannedPageRoute;
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

  constructor(options: UbeanAppOptions = {}) {
    this.options = options;
    this.hono = new Hono<UbeanEnv>({ strict: false });
    this.hooks = createHooks<UbeanRuntimeHooks>();
    this.plugins = options.plugins || [];

    this._setupBaseMiddleware();
    this._setupFallback();
  }

  private _setupBaseMiddleware(): void {
    this.hono.use('*', requestId());

    if (this.options.routeRules && Object.keys(this.options.routeRules).length > 0) {
      this.hono.use('*', createRouteRulesMiddleware(this.options.routeRules));
      const cacheRules = resolveRouteCacheRules(this.options.routeRules);
      if (Object.keys(cacheRules).length > 0) {
        useCacheStore(createMemoryStore());
        this.hono.use('*', createCacheMiddleware({ rules: cacheRules }));
      }
    }

    this.hono.use('*', createWebSocketMiddleware());

    this.hono.use('*', async (c: Context<UbeanEnv>, next: Next) => {
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
    });

    if (this.options.healthEndpoint !== false) {
      this.hono.get('/_health', (c: Context<UbeanEnv>) => {
        return c.json({ status: 'ok', timestamp: Date.now() });
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
    if (this.options.publicDir) {
      const publicDir = isAbsolute(this.options.publicDir)
        ? this.options.publicDir
        : this.options.rootDir
          ? join(this.options.rootDir, this.options.publicDir)
          : this.options.publicDir;
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
      i18nConfig: this.options.i18nConfig,
      notFoundPage: this.options.notFoundPage
    };

    await registerRoutes(this as unknown as RouteRegistrar, registerOpts);

    if (this.options.openAPI) {
      const openAPIOpts = typeof this.options.openAPI === 'object' ? this.options.openAPI : {};
      registerOpenAPIRoutes(this.hono, openAPIOpts);
    }

    await this.hooks.callHook('app:after:register', this.hono);

    setInternalFetcher((req: Request) => this.hono.fetch(req));

    for (const plugin of this.plugins) {
      if (plugin.ready) {
        await plugin.ready(this);
      }
    }

    this._ready = true;
    return this;
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

/* -------------------------------------------------------------------------- */
/* Re-exports from define-server (server-side counterpart of defineApp)         */
/* -------------------------------------------------------------------------- */

export { defineServer, createDefaultServerConfig, mergeServerConfigs, applyServerConfig } from './define-server';
export type { DefineServerOptions, ResolvedServerConfig, ServerHooks } from './define-server';

/* -------------------------------------------------------------------------- */
/* Convenience type re-exports                                                 */
/* -------------------------------------------------------------------------- */

export type { RouteRule, RouteMeta, UbeanEnv, UbeanMiddleware, ComposedHandler } from '@ubean/types';

export type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from '@ubean/routing';

export type { RouteRegistrar, RegisterOptions } from '@ubean/api-routes';
