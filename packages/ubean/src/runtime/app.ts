import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { Context, Next, MiddlewareHandler } from 'hono';
import { createHooks } from 'hookable';
import { join } from 'pathe';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute } from '../core/routing/types';
import type { RouteRule } from '../core/config/types';
import type { UbeanEnv, RouteMeta, UbeanMiddleware, ComposedHandler } from '../types/handler';
import { registerRoutes } from './router';
import { errorToResponse, isUbeanError, UbeanError } from './error';
import { registerOpenAPIRoutes } from './internal/openapi';
import { serveStatic } from './static';
import { createRequestIdMiddleware } from './observability';
import { createRouteRulesMiddleware } from './route-rules';

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
    handler: ComposedHandler;
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
  routeRules?: Record<string, RouteRule>;
  plugins?: UbeanAppPlugin[];
  routeLoaders?: Record<string, () => Promise<{ default: ComposedHandler } | Record<string, ComposedHandler>>>;
  middlewareLoaders?: Record<string, () => Promise<{ default: UbeanMiddleware }>>;
  pageLoaders?: Record<string, () => Promise<any>>;
  pageRenderer?: import('./pages').PageRenderer | null;
  pageAssetTags?: import('./pages').PageAssetTags;
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
}

export interface UbeanAppPlugin {
  name: string;
  /** Called after app is created but before routes are registered */
  setup?: (app: UbeanApp) => void | Promise<void>;
  /** Called after all routes are registered */
  ready?: (app: UbeanApp) => void | Promise<void>;
}

export class UbeanApp {
  readonly hono: Hono<UbeanEnv>;
  readonly hooks = createHooks<UbeanRuntimeHooks>();
  readonly plugins: UbeanAppPlugin[];
  readonly options: UbeanAppOptions;
  private _ready = false;

  constructor(options: UbeanAppOptions = {}) {
    this.options = options;
    this.hono = new Hono<UbeanEnv>();
    this.plugins = options.plugins || [];

    this._setupBaseMiddleware();
    this._setupFallback();
  }

  private _setupBaseMiddleware() {
    this.hono.use('*', createRequestIdMiddleware());

    if (this.options.routeRules && Object.keys(this.options.routeRules).length > 0) {
      this.hono.use('*', createRouteRulesMiddleware(this.options.routeRules));
    }

    this.hono.use('*', async (c: Context<UbeanEnv>, next: Next) => {
      c.set('route', { meta: { public: true } as RouteMeta, path: c.req.path, method: c.req.method });
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
      routeLoaders: this.options.routeLoaders || {},
      middlewareLoaders: this.options.middlewareLoaders || {},
      pageLoaders: this.options.pageLoaders || {},
      pageRenderer: this.options.pageRenderer ?? null,
      pageAssetTags: this.options.pageAssetTags ?? {}
    });

    if (this.options.publicDir) {
      const publicDir = this.options.rootDir
        ? join(this.options.rootDir, this.options.publicDir)
        : this.options.publicDir;
      if (existsSync(publicDir)) {
        this.hono.use('/*', serveStatic({ publicDir }));
      }
    }

    if (this.options.openAPI) {
      const openAPIOpts = typeof this.options.openAPI === 'object' ? this.options.openAPI : {};
      registerOpenAPIRoutes(this.hono, this.options.routes || [], this.options.middleware || [], openAPIOpts);
    }

    await this.hooks.callHook('app:after:register', this.hono);

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
