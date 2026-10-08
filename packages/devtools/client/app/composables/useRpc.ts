import { getDevToolsRpcClient } from '@vitejs/devtools-kit/client';
import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { toast } from '@vean/ui';
import type { DevframeRpcClient } from 'devframe/client';

// --- Local type definitions (client self-contained; mirrors server types) ---

export interface DevToolsRouteInfo {
  method: string;
  path: string;
  filePath?: string;
}

export interface DevToolsPageInfo {
  path: string;
  name?: string;
  filePath?: string;
  layout?: string;
}

export interface DevToolsMiddlewareInfo {
  path: string;
  filePath?: string;
  global?: boolean;
}

export interface DevToolsCronInfo {
  name: string;
  schedule?: string;
  filePath?: string;
}

export interface DevToolsLayoutInfo {
  name: string;
  path: string;
  filePath?: string;
  isDefault: boolean;
}

export interface DevToolsCustomTab {
  id: string;
  label: string;
  icon?: string;
  src: string;
  sandbox?: string[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolResults?: Array<{ toolCallId: string; result?: unknown; error?: string }>;
}

export interface AiChatResponse {
  message: AiChatMessage;
  toolResults?: Array<{ toolCallId: string; result?: unknown; error?: string }>;
}

/** A chunk pushed from the server during streaming. */
export interface AiStreamChunk {
  requestId: string;
  /** Accumulated text so far (not a delta — replace, don't append). */
  text: string;
  done: boolean;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  toolResults?: Array<{ toolCallId: string; result?: unknown; error?: string }>;
  error?: string;
}

/** DeepSeek defaults — used when the user hasn't configured a custom provider. */
export const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
export const DEEPSEEK_MODEL = 'deepseek-chat';

export interface DevToolsInfo {
  version: string;
  pages: number;
  apiRoutes: number;
  middleware: number;
  layouts: number;
  crons: number;
  startTime: number;
  presets: string[];
  config: Record<string, unknown>;
  routes: DevToolsRouteInfo[];
  pagesList: DevToolsPageInfo[];
  middlewaresList: DevToolsMiddlewareInfo[];
  layoutsList: DevToolsLayoutInfo[];
  cronsList: DevToolsCronInfo[];
  openAPI?: {
    enabled: boolean;
    scalarPath?: string;
    openAPIPath?: string;
  };
  database?: {
    drizzleStudioAvailable?: boolean;
    studioUrl?: string;
  };
  ai?: {
    enabled: boolean;
    provider?: string;
    model?: string;
  };
  customTabs?: DevToolsCustomTab[];
}

export interface CrudResult {
  success: boolean;
  created?: string[];
  deleted?: string[];
  restored?: string[];
  updated?: string[];
  skipped?: string[];
  errors?: string[];
}

// --- Terminal types (mirrors src/server/terminal.ts) ---

export interface TerminalStartParams {
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string;
}

export interface TerminalPollResult {
  data: string;
  exited: boolean;
  exitCode: number | null;
}

export type CrudResourceType =
  | 'page'
  | 'api'
  | 'layout'
  | 'middleware'
  | 'reuse'
  | 'cron'
  | 'plugin'
  | 'env'
  | 'config';

// --- RPC client singleton ---
// `getDevToolsRpcClient()` auto-detects the DTK dock connection from the
// parent window — no explicit URL/setup needed inside the iframe.
// A timeout is added so the SPA shows a helpful error instead of hanging
// forever when opened directly (not embedded in the DTK dock shell).

let clientPromise: Promise<DevframeRpcClient> | null = null;
function getClient(): Promise<DevframeRpcClient> {
  if (!clientPromise) {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('DTK connection timeout — open this page via the Vite DevTools dock shell, not directly.')),
        5000
      )
    );
    clientPromise = Promise.race([getDevToolsRpcClient(), timeout]);
  }
  return clientPromise;
}

// Untyped call helper — the birpc client is typed server-side via module
// augmentation; on the client we cast to keep the SPA build self-contained.
//
// Declared at module scope so tests can drive it with a fake client instead of
// the real DTK dock (see `RpcClientFactory` below).
async function callRpc<T = unknown>(client: DevframeRpcClient, method: string, args: unknown[]): Promise<T> {
  return (client.call as unknown as (m: string, ...a: unknown[]) => Promise<T>)(method, ...args);
}

/** Where `useRpc` gets its RPC client. Overridable for tests and non-dock use. */
export type RpcClientFactory = () => Promise<DevframeRpcClient>;

export interface UseRpcOptions {
  /**
   * Override the RPC client source (default: the DTK dock connection).
   * Tests use this to exercise the success and failure paths without a dock.
   */
  client?: RpcClientFactory;
}

// --- Pure formatters ---
// Hoisted to module scope (and exported) so they can be asserted directly,
// without setting up a component instance. `useRpc()` just returns them.

export function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function fileName(p?: string): string {
  if (!p) return '';
  return p.split('/').pop() || p;
}

/** 长路径省略中段：保留前 3 段 + 最后 2 段，`parts.length <= 5` 时原样返回。 */
export function filePath(p?: string): string {
  if (!p) return '';
  const parts = p.split('/');
  if (parts.length <= 5) return p;
  const prefix = parts.slice(0, 3).join('/');
  const suffix = parts.slice(-2).join('/');
  return `${prefix}/…/${suffix}`;
}

const METHOD_CLASS: Record<string, string> = {
  GET: 'bg-success/12 text-success',
  POST: 'bg-info/12 text-info',
  PUT: 'bg-warning/12 text-warning',
  DELETE: 'bg-destructive/12 text-destructive',
  PATCH: 'bg-purple-500/12 text-purple-400'
};

/** 未知方法回退到中性样式（不是空串——按钮仍需要有可见底色）。 */
export function methodClass(method: string): string {
  return METHOD_CLASS[method] || 'bg-secondary text-muted-foreground';
}

export function useRpc(useOptions: UseRpcOptions = {}) {
  const clientFactory: RpcClientFactory = useOptions.client ?? getClient;

  async function rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return callRpc<T>(await clientFactory(), method, args);
  }
  const loading = ref(true);
  const error = ref<string | null>(null);
  const info = ref<DevToolsInfo | null>(null);
  const env = ref<Record<string, string>>({});
  const uptime = ref(0);
  let uptimeInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  // `init` / `dispose` are idempotent: the composable runs them on mount/unmount,
  // but they are also part of the returned API (and reachable from tests), so a
  // double call must not double-subscribe or double-clear.
  let initialized = false;
  let disposed = false;

  function showToast(type: 'success' | 'error' | 'info' | 'warning', message: string) {
    const options = { duration: 3000, position: 'top-right' as const };
    switch (type) {
      case 'success':
        toast.success(message, options);
        break;
      case 'error':
        toast.error(message, options);
        break;
      case 'warning':
        toast.warning(message, options);
        break;
      default:
        toast(message, options);
        break;
    }
  }

  async function init() {
    if (initialized || disposed) return;
    initialized = true;
    try {
      const client = await clientFactory();
      // Subscribe to the `ubean:info` sharedState — replaces 3s polling.
      // The server pushes patches on every app rebuild.
      const state = await client.sharedState.get('ubean:info');
      const apply = (fullState: DevToolsInfo) => {
        info.value = fullState;
      };
      info.value = state.value() as DevToolsInfo;
      loading.value = false;
      unsubscribe = state.on('updated', apply) as unknown as () => void;

      // Load env once (CRUD updates mutate it server-side; refresh re-fetches).
      env.value = await rpc<Record<string, string>>('ubean:get-env');

      // Local uptime ticker driven by info.startTime.
      uptimeInterval = setInterval(() => {
        if (info.value) uptime.value = Date.now() - info.value.startTime;
      }, 1000);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to connect';
      loading.value = false;
    }
  }

  async function refresh() {
    try {
      env.value = await rpc<Record<string, string>>('ubean:get-env');
      // `info` is kept fresh by the sharedState subscription; fall back to an
      // explicit fetch if no state has arrived yet.
      if (!info.value) {
        info.value = await rpc<DevToolsInfo>('ubean:get-info');
      }
    } catch {
      // silent
    }
  }

  async function crudCreate(
    type: CrudResourceType,
    path: string,
    options?: { method?: string; content?: string; force?: boolean }
  ): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('ubean:crud:create', { type, path, ...options });
      if (result.success) {
        showToast('success', `Created ${type}: ${path}`);
        await refresh();
      } else if (result.errors?.length) {
        showToast('error', result.errors[0]);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Create failed';
      showToast('error', msg);
      return { success: false, errors: [msg] };
    }
  }

  async function crudRead(
    type: CrudResourceType,
    path?: string
  ): Promise<{ success: boolean; content?: string; data?: unknown; error?: string }> {
    try {
      return await rpc('ubean:crud:read', { type, path });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Read failed' };
    }
  }

  async function crudUpdate(
    type: CrudResourceType,
    options: { path?: string; key?: string; content?: string; value?: string }
  ): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('ubean:crud:update', { type, ...options });
      if (result.success) {
        showToast('success', `Updated ${type}`);
        await refresh();
      } else if (result.errors?.length) {
        showToast('error', result.errors[0]);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      showToast('error', msg);
      return { success: false, errors: [msg] };
    }
  }

  async function crudDelete(
    type: CrudResourceType,
    options: { path?: string; key?: string; force?: boolean }
  ): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('ubean:crud:delete', { type, ...options });
      if (result.success) {
        showToast('success', `Deleted ${type}`);
        await refresh();
      } else if (result.errors?.length) {
        showToast('error', result.errors[0]);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      showToast('error', msg);
      return { success: false, errors: [msg] };
    }
  }

  async function crudRestore(path: string): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('ubean:crud:restore', path);
      if (result.success) {
        showToast('success', `Restored: ${path}`);
        await refresh();
      } else if (result.errors?.length) {
        showToast('error', result.errors[0]);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Restore failed';
      showToast('error', msg);
      return { success: false, errors: [msg] };
    }
  }

  async function aiChat(
    messages: AiChatMessage[],
    options?: { apiKey?: string; apiBase?: string; model?: string }
  ): Promise<AiChatResponse> {
    try {
      return await rpc<AiChatResponse>('ubean:ai:chat', { messages, ...options });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI request failed';
      return { message: { role: 'assistant', content: `Error: ${msg}`, timestamp: Date.now() } };
    }
  }

  async function aiGetTools(): Promise<AiToolDefinition[]> {
    try {
      return await rpc<AiToolDefinition[]>('ubean:ai:tools');
    } catch {
      return [];
    }
  }

  /**
   * Streaming AI chat — subscribes to the `ubean:ai:stream` sharedState
   * and calls `ubean:ai:chat-stream`. The `onChunk` callback is invoked
   * for each text delta pushed by the server. Returns the final response
   * when the stream completes.
   */
  async function aiChatStream(
    messages: AiChatMessage[],
    options: { apiKey?: string; apiBase?: string; model?: string },
    onChunk: (chunk: AiStreamChunk) => void
  ): Promise<AiChatResponse> {
    const requestId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const client = await clientFactory();
      const streamState = await client.sharedState.get('ubean:ai:stream');

      // Filter by requestId so concurrent streams don't crosstalk.
      const _unsubscribe = streamState.on('updated', (value: AiStreamChunk) => {
        if (value && value.requestId === requestId) {
          onChunk(value);
        }
      }) as unknown as () => void;

      try {
        const response = await rpc<AiChatResponse>('ubean:ai:chat-stream', {
          messages,
          requestId,
          ...options
        });
        return response;
      } finally {
        _unsubscribe();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI stream failed';
      return { message: { role: 'assistant', content: `Error: ${msg}`, timestamp: Date.now() } };
    }
  }

  // --- Terminal RPC wrappers ---
  // The server keeps shell sessions in memory; the client opens one session
  // per Terminal view and polls for output via `ubean:terminal:poll`.

  async function terminalStart(params: TerminalStartParams): Promise<{ sessionId: string } | null> {
    try {
      return await rpc<{ sessionId: string }>('ubean:terminal:start', params);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Terminal start failed';
      showToast('error', msg);
      return null;
    }
  }

  async function terminalInput(sessionId: string, data: string): Promise<boolean> {
    try {
      return await rpc<boolean>('ubean:terminal:input', { sessionId, data });
    } catch {
      return false;
    }
  }

  async function terminalResize(sessionId: string, cols: number, rows: number): Promise<boolean> {
    try {
      return await rpc<boolean>('ubean:terminal:resize', { sessionId, cols, rows });
    } catch {
      return false;
    }
  }

  async function terminalPoll(sessionId: string): Promise<TerminalPollResult> {
    try {
      return await rpc<TerminalPollResult>('ubean:terminal:poll', { sessionId });
    } catch {
      return { data: '', exited: true, exitCode: -1 };
    }
  }

  async function terminalKill(sessionId: string): Promise<boolean> {
    try {
      return await rpc<boolean>('ubean:terminal:kill', { sessionId });
    } catch {
      return false;
    }
  }

  /** 释放 sharedState 订阅与 uptime 计时器；可重复调用。 */
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
      uptimeInterval = null;
    }
  }

  // 只在组件 setup 中注册生命周期：`useRpc` 也可在组件外（测试、程序式初始化）调用，
  // 那里调用 `onMounted` 会让 Vue 打 `[Vue warn] onMounted is called when there is no
  // active component instance` 并静默丢弃回调 —— 调用方会误以为订阅已自动生效。
  if (getCurrentInstance()) {
    onMounted(() => {
      void init();
    });

    onUnmounted(dispose);
  }

  return {
    loading,
    error,
    info,
    env,
    uptime,
    fmtUptime,
    fmtTime,
    fmtVal,
    fileName,
    filePath,
    methodClass,
    init,
    dispose,
    refresh,
    crudCreate,
    crudRead,
    crudUpdate,
    crudDelete,
    crudRestore,
    aiChat,
    aiChatStream,
    aiGetTools,
    showToast,
    terminalStart,
    terminalInput,
    terminalResize,
    terminalPoll,
    terminalKill
  };
}
