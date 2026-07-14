import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { Context, Next, MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import { createHooks } from 'hookable';
import { join } from 'pathe';
import type { RouteRule } from '../core/config/types';
import { getCustomTabs } from '../core/devtools/define-tab';
import type {
  DevToolsCustomTab,
  DevToolsInfo,
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsLayoutInfo,
  DevToolsCronInfo
} from '../core/devtools/types';
import type {
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPageRoute,
  ScannedLayout,
  ScannedCronTask
} from '../core/routing/types';
import type { UbeanEnv, RouteMeta, UbeanMiddleware, ComposedHandler } from '../types/handler';
import { registerRoutes } from './router';
import { createCacheMiddleware, resolveRouteCacheRules, useCacheStore, createMemoryStore } from './cache';
import { errorToResponse, isUbeanError, UbeanError } from './error';
import { setInternalFetcher } from './internal-fetch';
import { registerOpenAPIRoutes } from './internal/openapi';
import { createRouteRulesMiddleware } from './route-rules';
import { serveStatic } from './static';
import { createWebSocketMiddleware } from './websocket';

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
  pageLoaders?: Record<string, () => Promise<any>>;
  pageRenderer?: import('./pages').PageRenderer | null;
  pageAssetTags?: import('./pages').PageAssetTags;
  publicDir?: string;
  healthEndpoint?: boolean;
  devtools?:
    | boolean
    | {
        customTabs?: DevToolsCustomTab[];
        ai?: {
          apiKey?: string;
          apiBase?: string;
          model?: string;
        };
      };
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
}

export interface UbeanAppPlugin {
  name: string;
  /** Called after app is created but before routes are registered */
  setup?: (app: UbeanApp) => void | Promise<void>;
  /** Called after all routes are registered */
  ready?: (app: UbeanApp) => void | Promise<void>;
}

/**
 * Structural view of the DevTools middleware returned by `createDevToolsMiddleware`
 * in `@ubean/devtools`. Defined locally (rather than importing the real return
 * type) so `ubean` has no static dependency on `@ubean/devtools` — the package is
 * loaded via a dynamic `import()` only when DevTools is enabled.
 */
export interface DevToolsInstance {
  rpc: {
    setRoutes(routes: DevToolsRouteInfo[]): void;
    setPages(pages: DevToolsPageInfo[]): void;
    setMiddlewares(middlewares: DevToolsMiddlewareInfo[]): void;
    setLayouts(layouts: DevToolsLayoutInfo[]): void;
    setCrons(crons: DevToolsCronInfo[]): void;
    setPresets(presets: string[]): void;
    setOpenAPI(openAPI: { enabled: boolean; scalarPath?: string; openAPIPath?: string }): void;
    setCustomTabs(tabs: DevToolsCustomTab[]): void;
    updateInfo(partial: Partial<DevToolsInfo>): void;
  };
  middleware: (c: Context<UbeanEnv>, next: Next) => Promise<Response | void>;
}

export class UbeanApp {
  readonly hono: Hono<UbeanEnv>;
  readonly hooks = createHooks<UbeanRuntimeHooks>();
  readonly plugins: UbeanAppPlugin[];
  readonly options: UbeanAppOptions;
  readonly devtools?: DevToolsInstance;
  private _devtoolsPromise: Promise<void> | null = null;
  private _ready = false;

  constructor(options: UbeanAppOptions = {}) {
    this.options = options;
    this.hono = new Hono<UbeanEnv>({ strict: false });
    this.plugins = options.plugins || [];

    // DevTools is loaded lazily via a dynamic import of `@ubean/devtools` so the
    // dependency stays optional. The placeholder middleware registered below
    // awaits this promise before delegating to the real middleware.
    if (options.devtools) {
      this._devtoolsPromise = this._initDevtools();
    }

    this._setupBaseMiddleware();
    this._setupFallback();
  }

  private _setupBaseMiddleware() {
    this.hono.use('*', requestId());

    // Placeholder: wait for the lazy DevTools import to resolve, then delegate
    // to the real middleware. Registered unconditionally when DevTools is opted
    // in (the middleware instance itself is populated asynchronously).
    if (this.options.devtools) {
      this.hono.use('*', async (c: Context<UbeanEnv>, next: Next) => {
        if (this._devtoolsPromise) await this._devtoolsPromise;
        if (this.devtools) return this.devtools.middleware(c, next);
        return next();
      });
    }

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
      c.set('route', { meta: { requiresAuth: true } as RouteMeta, path: c.req.path, method: c.req.method });
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

    await registerRoutes(this, {
      routes: this.options.routes || [],
      middleware: this.options.middleware || [],
      pages: this.options.pages || [],
      layouts: this.options.layouts || [],
      routeLoaders: this.options.routeLoaders || {},
      middlewareLoaders: this.options.middlewareLoaders || {},
      pageLoaders: this.options.pageLoaders || {},
      pageRenderer: this.options.pageRenderer ?? null,
      pageAssetTags: this.options.pageAssetTags ?? {},
      i18nConfig: this.options.i18nConfig
    });

    if (this.options.publicDir) {
      const publicDir = this.options.rootDir
        ? join(this.options.rootDir, this.options.publicDir)
        : this.options.publicDir;
      if (existsSync(publicDir)) {
        this.hono.use('/*', serveStatic({ publicDir }));
      }
    }

    // Ensure the lazy DevTools import has resolved before seeding its RPC
    // server with OpenAPI / custom-tab metadata below.
    if (this._devtoolsPromise) await this._devtoolsPromise;

    if (this.options.openAPI) {
      const openAPIOpts = typeof this.options.openAPI === 'object' ? this.options.openAPI : {};
      registerOpenAPIRoutes(this.hono, openAPIOpts);
      if (this.devtools) {
        this.devtools.rpc.setOpenAPI({
          enabled: true,
          scalarPath: openAPIOpts.scalarPath || '/_scalar',
          openAPIPath: openAPIOpts.openAPIPath || '/_openapi.json'
        });
      }
    } else if (this.devtools) {
      this.devtools.rpc.setOpenAPI({ enabled: false });
    }

    if (this.devtools) {
      const optionTabs =
        typeof this.options.devtools === 'object' && this.options.devtools.customTabs
          ? this.options.devtools.customTabs
          : [];
      const definedTabs = getCustomTabs();
      const allTabs = [...definedTabs];
      for (const tab of optionTabs) {
        if (!allTabs.find(t => t.id === tab.id)) {
          allTabs.push(tab);
        }
      }
      this.devtools.rpc.setCustomTabs(allTabs);
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

  /**
   * Resolves once the lazy DevTools import has settled. Safe to call when
   * DevTools is disabled (resolves immediately). External callers (e.g. the dev
   * runner) use this to wait before seeding the RPC server with route/page data.
   */
  async ensureDevtools(): Promise<void> {
    if (this._devtoolsPromise) await this._devtoolsPromise;
  }

  private async _initDevtools(): Promise<void> {
    if (!this.options.devtools) return;
    const dtOpts = typeof this.options.devtools === 'object' ? this.options.devtools : {};
    try {
      const { createDevToolsMiddleware } = await import('@ubean/devtools');
      (this as { devtools?: DevToolsInstance }).devtools = createDevToolsMiddleware({
        ai: dtOpts.ai
      });
    } catch (err) {
      console.warn(
        '[ubean] @ubean/devtools is not available — DevTools disabled. Install `@ubean/devtools` to enable it.',
        err instanceof Error ? err.message : err
      );
    }
  }

  private _setupFallback() {
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

  use(path: string | MiddlewareHandler<UbeanEnv>, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.use(path as any, ...(handlers as any));
    return this;
  }

  on(method: string | string[], path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.on(method as any, path as any, ...(handlers as any));
    return this;
  }

  get(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.get(path as any, ...(handlers as any));
    return this;
  }

  post(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.post(path as any, ...(handlers as any));
    return this;
  }

  put(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.put(path as any, ...(handlers as any));
    return this;
  }

  patch(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.patch(path as any, ...(handlers as any));
    return this;
  }

  delete(path: string, ...handlers: MiddlewareHandler<UbeanEnv>[]) {
    this.hono.delete(path as any, ...(handlers as any));
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

export interface AppPlugin {
  name: string;
  setup?: (app: Hono<UbeanEnv>) => void | Promise<void>;
}

export function createUbeanApp(options: UbeanAppOptions = {}): UbeanApp {
  return new UbeanApp(options);
}
