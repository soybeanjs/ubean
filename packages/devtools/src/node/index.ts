import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
/// <reference types="@vitejs/devtools-kit" />
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { ViteDevToolsNodeContext } from '@vitejs/devtools-kit';
import { maskSensitiveEnv } from '../shared/env';
import { createDevToolsHooks } from '../server/hooks';
import { createAiServer } from '../server/ai';
import type { DevToolsAiServer } from '../server/ai';
import { createCrudServer } from '../server/crud';
import type { DevToolsCrudServer } from '../server/crud';
import { createTerminalServer } from '../server/terminal';
import type { TerminalServer } from '../server/terminal';
import type { DevToolsCustomTab, DevToolsInfo } from '../types';
import { createAllRpcFunctions } from './rpc';
import {
  buildDevToolsInfo,
  emptyDevToolsInfo,
  initSharedState,
  refreshSharedState,
  UBEAN_INFO_STATE_KEY
} from './state';
import type { ScanResultLike, DevToolsConfigMeta } from './state';

export { defineRpcFunction } from '@vitejs/devtools-kit';
export type { ViteDevToolsNodeContext } from '@vitejs/devtools-kit';
export { buildDevToolsInfo, emptyDevToolsInfo, UBEAN_INFO_STATE_KEY };
export type { ScanResultLike, DevToolsConfigMeta };

/**
 * Options injected by the ubean dev runner so the DevTools plugin can reach
 * Hono-runtime data (scanned routes/pages, the Hono app for in-process
 * playground forwarding) without `@ubean/devtools` statically depending on
 * `ubean`.
 */
export interface UbeanDevtoolsPluginOptions {
  /** Project root directory (used by the CRUD server for file scaffolding). */
  getCwd: () => string;
  /** Accessor for the live Hono app — used by the playground RPC to forward
   *  HTTP requests in-process without a network round-trip. */
  getApp?: () => { fetch: (req: Request) => Response | Promise<Response> } | undefined;
  /** Accessor for the latest project scan result (routes/pages/middleware/...). */
  getScanResult?: () => ScanResultLike | null;
  /** Accessor for resolved config metadata shown in the Overview tab. */
  getConfigMeta?: () => DevToolsConfigMeta | null;
  /** Accessor for user-defined custom tabs (from `defineDevToolsTab`). */
  getCustomTabs?: () => DevToolsCustomTab[];
  /** AI provider configuration forwarded to the AI server. */
  ai?: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
  };
  /**
   * Trigger an immediate project rescan + app reload. Called by the CRUD
   * server after file create/update/delete so the DevTools list updates
   * without waiting for the file watcher's debounce.
   */
  triggerRescan?: () => void | Promise<void>;
  /**
   * The dev runner registers a refresh callback here. Whenever the app is
   * rebuilt (file change), the runner invokes it so the plugin can rebuild
   * `DevToolsInfo` from the latest scan data and push patches to clients
   * via sharedState — replacing the old 3s polling pattern.
   */
  registerRefresh?: (fn: () => void) => void;
}

/**
 * Path to the pre-built client SPA. Resolved relative to the built server
 * bundle (`dist/index.mjs`), so this points to `dist/client/` at runtime.
 */
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), 'client');

/**
 * Ubean DevTools as a Vite plugin.
 *
 * Registers a dock entry (iframe pointing at the pre-built SPA), hosts the
 * SPA's static assets, and wires up the type-safe RPC + sharedState used by
 * the SPA. This replaces the previous Hono-middleware-based transport with
 * the Vite DevTools Kit (DTK) birpc + shared-state machinery.
 */
export function ubeanDevtoolsPlugin(options: UbeanDevtoolsPluginOptions = { getCwd: () => process.cwd() }): Plugin {
  return {
    name: 'ubean:devtools',
    devtools: {
      async setup(ctx: ViteDevToolsNodeContext) {
        // eslint-disable-next-line no-console
        console.log('[ubean:devtools] devtools.setup hook fired — DTK integration active');

        // 1. Host the pre-built SPA static assets (replaces runtime/middleware.ts).
        ctx.views.hostStatic('/__ubean_devtools__/', CLIENT_DIST);

        // 2. Register dock entries — one per view (or grouped domain).
        //    Routes + Playground share an iframe to preserve the "try route"
        //    cross-view interaction; Middlewares + Layouts are grouped as
        //    "Structure". DTK dock shell provides navigation chrome; the SPA
        //    renders only the view matching `window.location.hash`.
        const SPA_BASE = '/__ubean_devtools__/index.html';
        const dockEntries = [
          {
            id: 'ubean:overview',
            title: 'Overview',
            icon: 'lucide:layout-dashboard',
            url: `${SPA_BASE}#/overview`,
            order: 100
          },
          { id: 'ubean:pages', title: 'Pages', icon: 'lucide:file-text', url: `${SPA_BASE}#/pages`, order: 95 },
          { id: 'ubean:api', title: 'API', icon: 'lucide:send', url: `${SPA_BASE}#/api`, order: 90 },
          {
            id: 'ubean:middleware',
            title: 'Middleware',
            icon: 'lucide:layers',
            url: `${SPA_BASE}#/middleware`,
            order: 85
          },
          { id: 'ubean:crons', title: 'Crons', icon: 'lucide:clock', url: `${SPA_BASE}#/crons`, order: 80 },
          { id: 'ubean:config', title: 'Config', icon: 'lucide:settings', url: `${SPA_BASE}#/config`, order: 75 },
          { id: 'ubean:env', title: 'Env', icon: 'lucide:terminal', url: `${SPA_BASE}#/env`, order: 70 },
          {
            id: 'ubean:api-docs',
            title: 'API Docs',
            icon: 'lucide:book-open',
            url: `${SPA_BASE}#/api-docs`,
            order: 65
          },
          { id: 'ubean:database', title: 'Database', icon: 'lucide:database', url: `${SPA_BASE}#/database`, order: 60 },
          {
            id: 'ubean:terminal',
            title: 'Terminal',
            icon: 'lucide:square-terminal',
            url: `${SPA_BASE}#/terminal`,
            order: 58
          },
          { id: 'ubean:ai', title: 'AI', icon: 'lucide:sparkles', url: `${SPA_BASE}#/ai`, order: 55 }
        ];
        for (const entry of dockEntries) {
          ctx.docks.register({
            id: entry.id,
            title: entry.title,
            icon: entry.icon,
            type: 'iframe',
            url: entry.url,
            category: 'framework',
            defaultOrder: entry.order
          });
        }

        // 3. Build the initial DevToolsInfo snapshot from scan + config data.
        const startTime = Date.now();
        const customTabs = options.getCustomTabs?.() ?? [];
        const envData = snapshotEnv(options.getCwd());
        const initialInfo = options.getScanResult
          ? buildDevToolsInfo({
              scan: options.getScanResult(),
              configMeta: options.getConfigMeta?.() ?? null,
              customTabs,
              ai: options.ai,
              startTime,
              envData
            })
          : emptyDevToolsInfo(startTime);

        // 3b. Register custom tabs as independent dock entries (each points
        //     directly to the user-provided src URL, not through the SPA).
        for (const tab of customTabs) {
          ctx.docks.register({
            id: `ubean:custom:${tab.id}`,
            title: tab.label,
            icon: tab.icon || 'lucide:plugin',
            type: 'iframe',
            url: tab.src,
            category: 'framework',
            defaultOrder: 50
          });
        }

        // 4. Initialise the shared state — clients subscribe to `ubean:info`
        //    and receive patches on every refresh (no polling).
        const state = await initSharedState(ctx, initialInfo);

        // 4b. AI streaming shared state — the AI server pushes text deltas
        //     here during `streamText`, and clients subscribe to render
        //     live updates. Keyed by `requestId` so multiple clients don't
        //     clobber each other.
        const aiStreamState = await ctx.rpc.sharedState.get('ubean:ai:stream', {
          initialValue: { requestId: '', text: '', done: true } as {
            requestId: string;
            text: string;
            done: boolean;
            toolCalls?: unknown[];
            toolResults?: unknown[];
            error?: string;
          }
        });

        // 5. Instantiate the CRUD + AI servers (reused as-is from the old
        //    server/ modules — only the transport layer changed).
        const hooks = createDevToolsHooks();
        const crud: DevToolsCrudServer = createCrudServer({
          cwd: options.getCwd(),
          hooks,
          getEnv: () => envData,
          setEnv: env => {
            Object.keys(envData).forEach(k => delete envData[k]);
            Object.assign(envData, env);
          },
          getConfig: () => (options.getConfigMeta?.() ?? {}) as Record<string, unknown>,
          onFileChange: async () => {
            // Trigger an immediate rescan so the DevTools list updates
            // without waiting for the file watcher's debounce. The rescan
            // rebuilds the scan result, calls `updateApp()`, which calls
            // `refreshDevtools()`, which pushes fresh data to clients via
            // sharedState.
            if (options.triggerRescan) {
              await options.triggerRescan();
            }
          }
        });
        const ai: DevToolsAiServer = createAiServer(
          crud,
          () => state.value() as DevToolsInfo,
          chunk => {
            // Push each chunk to the shared state — clients receive the
            // updated value via their `on('updated')` subscription.
            aiStreamState.mutate(() => chunk);
          }
        );
        const terminal: TerminalServer = createTerminalServer();

        // 6. Register all RPC functions (info / crud / ai / playground / terminal).
        const fns = createAllRpcFunctions({
          state,
          getEnvData: () => envData,
          crud,
          ai,
          terminal,
          getApp: options.getApp
        });
        for (const fn of fns) ctx.rpc.register(fn);

        // 7. Register the refresh callback so the dev runner can push scan
        //    updates to all connected clients after an app rebuild.
        const refresh = () => {
          const info = options.getScanResult
            ? buildDevToolsInfo({
                scan: options.getScanResult(),
                configMeta: options.getConfigMeta?.() ?? null,
                customTabs: options.getCustomTabs?.() ?? [],
                ai: options.ai,
                startTime,
                envData
              })
            : initialInfo;
          refreshSharedState(state, info);
        };
        options.registerRefresh?.(refresh);

        void ctx;
      }
    }
  };
}

/**
 * Parse a single .env file and return the key/value pairs.
 * - Ignores blank lines and `#` comments.
 * - Strips surrounding single/double quotes from values.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip inline comments (only when value is unquoted).
    const hashIndex = value.search(/\s+#.*$/);
    if (hashIndex !== -1 && !value.startsWith('"') && !value.startsWith("'")) {
      value = value.slice(0, hashIndex).trim();
    }
    // Strip surrounding quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Snapshot env vars relevant to the ubean app.
 *
 * Instead of dumping all of `process.env` (which includes noisy system vars
 * like PATH, HOME, SHELL, LANG, TERM, etc.), we only collect:
 *   1. Vars defined in .env / .env.local / .env.development / .env.development.local
 *   2. UBEAN_* prefixed vars from process.env (framework/CLI vars set by shell)
 *
 * Values from process.env override .env file values (shell overrides take
 * precedence), matching Vite's env loading semantics.
 */
function snapshotEnv(cwd: string): Record<string, string> {
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];
  const env: Record<string, string> = {};

  // 1. Load values from .env files (later files override earlier ones).
  for (const file of envFiles) {
    Object.assign(env, parseEnvFile(resolve(cwd, file)));
  }

  // 2. Override with process.env for keys already loaded from .env files.
  //    Also include UBEAN_* vars (framework/CLI vars) from process.env.
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && (key in env || key.startsWith('UBEAN_'))) {
      env[key] = value;
    }
  }

  return env;
}

// Re-export env masking helper for consumers that need it.
export { maskSensitiveEnv };
