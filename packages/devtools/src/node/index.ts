import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { DevframeHubContext } from '@devframes/hub';
import type { DevframeDefinition, DevframeNodeContext } from 'devframe/types';
import type { SharedState } from 'devframe/utils/shared-state';
import { maskSensitiveEnv } from '../shared/env';
import { createDevToolsHooks } from '../server/hooks';
import { createAiServer } from '../server/ai';
import type { DevToolsAiServer } from '../server/ai';
import { createCrudServer } from '../server/crud';
import type { DevToolsCrudServer } from '../server/crud';
import { createTerminalServer } from '../server/terminal';
import type { TerminalServer } from '../server/terminal';
import type { DevToolsCustomTab, DevToolsInfo, DevToolsScaffoldOps } from '../types';
import { createAllRpcFunctions } from './rpc';
import { UBEAN_AI_STREAM_STATE_KEY, UBEAN_RPC_NAMESPACE } from './rpc/types';
import {
  buildDevToolsInfo,
  emptyDevToolsInfo,
  initSharedState,
  refreshSharedState,
  UBEAN_INFO_STATE_KEY
} from './state';
import type { ScanResultLike, DevToolsConfigMeta } from './state';

export { buildDevToolsInfo, emptyDevToolsInfo, UBEAN_INFO_STATE_KEY };
export type { ScanResultLike, DevToolsConfigMeta };
// anchor dock 的共享 iframe 配置（`frameId` / `subTabs` / `visibility`）属于
// `DevframeViewIframe`，必须经 `ctx.install(def, { dock })` 传入 —— CLI 从这里取。
export { UBEAN_ANCHOR_DOCK } from './rpc/types';

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
  /**
   * Scaffold operations injected by ubean so @ubean/devtools never has a
   * hard runtime dependency on ubean. Provides fs ops + scaffold/delete/recover
   * functions used by the CRUD server for file creation/deletion.
   */
  scaffoldOps?: DevToolsScaffoldOps;
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
  /**
   * Mount base for the DevTools SPA. Defaults to `/_devtools/`.
   *
   * devframe 的约定是每个 devframe 挂在 hub base 的 `<id>/` 下；ubean 保留
   * `/_devtools/` 作为**用户可见**的路径（CLI banner、文档、`devtools` 命令都印它），
   * 与 Vite 自己的 `/__devtools/` 外壳互不干扰。SPA 产物必须用相对 base 构建
   * （见 `client/vite.config.ts` 的 `base: './'`），否则换前缀就白屏。
   */
  basePath?: string;
}

/**
 * Path to the pre-built client SPA. Resolved relative to the built server
 * bundle (`dist/index.js`), so this points to `dist/client/` at runtime.
 */
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), 'client');

/**
 * 构建 `@ubean/devtools` 的 devframe 定义。
 *
 * 与旧 DTK 接线的区别：
 * - 不再手动 `ctx.views.hostStatic` / 手写 11 个 dock entry —— hub 的 `ctx.install()`
 *   负责服务 SPA、注册 anchor dock 与 `__connection.json`；
 * - 不再有那段 `__connection.json` 转发 hack（hub 的 `mountConnectionMeta` 原生支持）；
 * - RPC 走 `ctx.scope('ubean')`，裸名注册（`get-info` → wire 名 `ubean:get-info`）。
 */
export function createUbeanDevframe(options: UbeanDevtoolsPluginOptions): DevframeDefinition {
  const basePath = options.basePath ?? '/_devtools/';

  return {
    id: 'ubean',
    name: 'Ubean DevTools',
    version: '0.6.1',
    packageName: '@ubean/devtools',
    homepage: 'https://github.com/SoybeanJS/ubean',
    description: 'Ubean 项目的路由 / 页面 / API / 配置 / 终端 / AI 可视化面板。',
    // 解析基准：让 hub 用**本包自己的依赖图**解析 client assets 与远程资源，
    // 而不是消费方 app 的（devframe 的 importMetaUrl 契约）。
    importMetaUrl: import.meta.url,
    icon: 'https://img.soybeanjs.dev/logo-ubean.svg?v=202608192144',
    basePath,
    // DevTools 写真实文件（页面 / API / 布局增删改），静态导出只会得到一个不能写的空壳。
    capabilities: { build: false },
    clientAssets: CLIENT_DIST,
    dock: {
      title: 'Ubean',
      defaultOrder: 100,
      category: 'framework'
    },
    setup: async (nodeCtx: DevframeNodeContext) => {
      // devframe 把 `setup(ctx)` 的类型写成框架中立的 `DevframeNodeContext`，但 hub 实际传入的
      // 是自己的 `DevframeHubContext`（多出 docks / terminals / messages / commands）。
      // 这是 devframe 的已知类型缺口，不是运行时风险：`ctx.install()` 只在 hub 内可用。
      const ctx = nodeCtx as DevframeHubContext;
      const cwd = options.getCwd();
      const startTime = Date.now();
      const scoped = ctx.scope(UBEAN_RPC_NAMESPACE);
      const envData = snapshotEnv(cwd);

      // 1. 初始 DevToolsInfo 快照（扫描 + 配置元数据）。
      const buildInfo = (): DevToolsInfo => {
        const scan = options.getScanResult?.() ?? null;
        return scan
          ? buildDevToolsInfo({
              scan,
              configMeta: options.getConfigMeta?.() ?? null,
              customTabs: options.getCustomTabs?.() ?? [],
              ai: options.ai,
              startTime,
              envData
            })
          : emptyDevToolsInfo(startTime);
      };

      // 2. shared state：`ubean:info`（客户端订阅，取代旧 3s 轮询）。
      const state: SharedState<DevToolsInfo> = await initSharedState(ctx, buildInfo());

      // 3. AI 流式分片 state —— AI server 把文本增量推到这里，客户端按 requestId 过滤。
      const aiStreamState = await ctx.rpc.sharedState.get(UBEAN_AI_STREAM_STATE_KEY, {
        initialValue: { requestId: '', text: '', done: true } as {
          requestId: string;
          text: string;
          done: boolean;
          toolCalls?: unknown[];
          toolResults?: unknown[];
          error?: string;
        }
      });

      // 4. CRUD / AI / Terminal server（传输无关，原样复用）。
      const hooks = createDevToolsHooks();
      const crud: DevToolsCrudServer = createCrudServer({
        cwd,
        hooks,
        scaffoldOps: options.scaffoldOps,
        getEnv: () => envData,
        setEnv: env => {
          Object.keys(envData).forEach(k => delete envData[k]);
          Object.assign(envData, env);
        },
        getConfig: () => (options.getConfigMeta?.() ?? {}) as Record<string, unknown>,
        onFileChange: async () => {
          // 立刻重扫，别等文件监听的 debounce：rescan 会重建扫描结果 → updateApp() →
          // refreshDevtools() → 经 sharedState 把新数据推给客户端。
          if (options.triggerRescan) {
            await options.triggerRescan();
          }
        }
      });
      const ai: DevToolsAiServer = createAiServer(
        crud,
        () => state.value() as DevToolsInfo,
        chunk => {
          // 推给 shared state —— 客户端靠 `on('updated')` 订阅收到。
          aiStreamState.mutate(() => chunk);
        }
      );
      const terminal: TerminalServer = createTerminalServer();

      // 5. 注册 RPC（裸名 → scope 统一加 `ubean:` 前缀）。
      const fns = createAllRpcFunctions({
        state,
        getEnvData: () => envData,
        crud,
        ai,
        terminal,
        getApp: options.getApp
      });
      for (const fn of fns) scoped.rpc.register(fn);

      // 6. custom tabs 作为独立 dock entry（直接指向用户给的 src，不经过本 SPA）。
      for (const tab of options.getCustomTabs?.() ?? []) {
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

      // 7. 刷新回调：dev runner 在每次重建后调用它推新快照。
      const refresh = () => {
        refreshSharedState(state, buildInfo());
      };
      options.registerRefresh?.(refresh);
    }
  };
}

/**
 * Ubean DevTools 的 Vite 插件 —— `createUbeanDevframe()` 的装配壳。
 *
 * 插件本身**不挂 hub**：hub 由 `@devframes/vite/hub` 的 `viteDevframeHub()` 在 dev server
 * 里挂载，本插件只是把 devframe 定义交给它（`devframes: [createUbeanDevframe(...)]`）。
 * 因此这个函数返回的 `Plugin` 仅用于携带 `__ubeanDevframe` 标记，便于 CLI 组装。
 */
export interface UbeanDevtoolsPlugin extends Plugin {
  /** 供 CLI 取出定义并挂到 hub 上。 */
  readonly __ubeanDevframe: DevframeDefinition;
}

export function ubeanDevtoolsPlugin(options: UbeanDevtoolsPluginOptions): UbeanDevtoolsPlugin {
  const devframe = createUbeanDevframe(options);
  return {
    name: 'ubean:devtools',
    __ubeanDevframe: devframe
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
