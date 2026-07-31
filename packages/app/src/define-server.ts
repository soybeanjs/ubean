import { setGlobalHooks } from './hooks';
import type { GlobalHooks } from './hooks';
import type { UbeanApp, UbeanAppPlugin, UbeanRuntimeHooks } from './app';

/**
 * Apply a resolved server config to a `UbeanApp` instance.
 *
 * This must be called BEFORE `app.init()` so that:
 * - `plugins` are available when `init()` calls `setup` / `ready`
 * - `hooks` are registered before `init()` fires `app:created` etc.
 * - `onAppCreate` runs before route registration
 * - `globalHooks` (handle/handleFetch/handleError) are set before any request
 *
 * `onServerReady` is NOT called here — the caller must invoke it after
 * `app.init()` completes.
 */
export async function applyServerConfig(app: UbeanApp, config: ResolvedServerConfig): Promise<void> {
  // Inject plugins (push into the readonly array — safe, just not reassignable)
  if (config.plugins.length > 0) {
    (app.plugins as UbeanAppPlugin[]).push(...config.plugins);
  }

  // Register runtime hooks
  for (const [name, handler] of Object.entries(config.hooks)) {
    if (handler) {
      (app.hooks as { hook: (name: string, handler: (...args: never[]) => void) => void }).hook(
        name,
        handler as (...args: never[]) => void
      );
    }
  }

  // P9-09: Set global hooks (handle/handleFetch/handleError)
  if (config.globalHooks) {
    setGlobalHooks(config.globalHooks);
  }

  // Call onAppCreate before init
  if (config.onAppCreate) {
    await config.onAppCreate(app);
  }
}

/**
 * Partial runtime hooks that users can register via `defineServer`.
 * All hooks are optional — users only declare the ones they need.
 */
export type ServerHooks = Partial<UbeanRuntimeHooks>;

/**
 * Options for `defineServer` — the server-side counterpart of `defineApp`.
 *
 * Users create `src/server.ts` (shared), `src/server.dev.ts` (dev-only),
 * or `src/server.prod.ts` (prod-only) and export the result of
 * `defineServer(...)` as the default export.
 */
export interface DefineServerOptions {
  /**
   * UbeanApp plugins to inject into `createUbeanApp({ plugins })`.
   * Each plugin's `setup` runs before route registration; `ready` runs after.
   */
  plugins?: UbeanAppPlugin[];

  /**
   * Runtime hooks registered on `app.hooks`.
   * Available hooks: `app:created`, `app:before:register`, `app:after:register`,
   * `request:start`, `request:end`, `request:error`, `route:register`,
   * `middleware:register`, `error`.
   */
  hooks?: ServerHooks;

  /**
   * P9-09: Global hooks (SvelteKit-style `handle`/`handleFetch`/`handleError`).
   *
   * - `handle` wraps every request (including 404 and static assets)
   * - `handleFetch` intercepts server-side `fetch()` calls
   * - `handleError` is called on uncaught errors for logging/reporting
   */
  globalHooks?: GlobalHooks;

  /**
   * Called after `UbeanApp` is created but before `app.init()`.
   * Useful for initializing databases, external service connections, etc.
   */
  onAppCreate?: (app: UbeanApp) => void | Promise<void>;

  /**
   * Called after `app.init()` completes (all routes/middleware registered).
   * Useful for starting queue workers, cron schedulers, etc.
   */
  onServerReady?: (app: UbeanApp) => void | Promise<void>;
}

/**
 * Resolved server config — the normalized result of `defineServer`.
 */
export interface ResolvedServerConfig {
  plugins: UbeanAppPlugin[];
  hooks: ServerHooks;
  globalHooks?: GlobalHooks;
  onAppCreate?: (app: UbeanApp) => void | Promise<void>;
  onServerReady?: (app: UbeanApp) => void | Promise<void>;
}

/**
 * Define the backend server configuration.
 *
 * This is the server-side counterpart of `defineApp`. It allows users to
 * inject plugins, register runtime hooks, and run startup/ready logic
 * from a simple entry file (`src/server.ts`).
 *
 * @example
 * ```ts
 * // src/server.ts
 * import { defineServer } from '@ubean/app';
 *
 * export default defineServer({
 *   plugins: [
 *     {
 *       name: 'my-plugin',
 *       setup(app) { app.use('/api/custom', handler); },
 *       ready(app) { /* routes registered *\/ }
 *     }
 *   ],
 *   hooks: {
 *     'request:start': (c) => { console.log(c.req.method, c.req.path); }
 *   },
 *   globalHooks: {
 *     handle: async ({ event, resolve }) => {
 *       const response = await resolve(event);
 *       response.headers.set('X-Custom', 'ubean');
 *       return response;
 *     },
 *     handleError: async ({ error, status }) => {
 *       console.error(`[${status}]`, error);
 *     }
 *   },
 *   onAppCreate: async (app) => { /* init db *\/ },
 *   onServerReady: async (app) => { /* start workers *\/ }
 * });
 * ```
 */
export function defineServer(options: DefineServerOptions): ResolvedServerConfig {
  return {
    plugins: options.plugins || [],
    hooks: options.hooks || {},
    globalHooks: options.globalHooks,
    onAppCreate: options.onAppCreate,
    onServerReady: options.onServerReady
  };
}

/**
 * Create an empty server config — used as the fallback when no
 * `src/server.ts` file exists.
 */
export function createDefaultServerConfig(): ResolvedServerConfig {
  return {
    plugins: [],
    hooks: {}
  };
}

/**
 * Merge multiple server configs (shared + mode-specific) into one.
 * Plugins are concatenated; hooks are merged; mode-specific callbacks
 * override shared ones.
 */
export function mergeServerConfigs(
  base: ResolvedServerConfig,
  ...configs: (ResolvedServerConfig | null | undefined)[]
): ResolvedServerConfig {
  const result: ResolvedServerConfig = {
    plugins: [...base.plugins],
    hooks: { ...base.hooks },
    globalHooks: base.globalHooks ? { ...base.globalHooks } : undefined,
    onAppCreate: base.onAppCreate,
    onServerReady: base.onServerReady
  };

  for (const cfg of configs) {
    if (!cfg) continue;
    if (cfg.plugins) result.plugins.push(...cfg.plugins);
    if (cfg.hooks) Object.assign(result.hooks, cfg.hooks);
    if (cfg.globalHooks) {
      result.globalHooks = { ...result.globalHooks, ...cfg.globalHooks };
    }
    if (cfg.onAppCreate) result.onAppCreate = cfg.onAppCreate;
    if (cfg.onServerReady) result.onServerReady = cfg.onServerReady;
  }

  return result;
}
