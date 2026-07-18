import { getDevToolsRpcClient } from '@vitejs/devtools-kit/client';
import { ref, onMounted, onUnmounted } from 'vue';
import { toast } from '@soybeanjs/ui';
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
async function rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  const client = await getClient();
  return (client.call as unknown as (m: string, ...a: unknown[]) => Promise<T>)(method, ...args);
}

export function useRpc() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const info = ref<DevToolsInfo | null>(null);
  const env = ref<Record<string, string>>({});
  const uptime = ref(0);
  let uptimeInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

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
    try {
      const client = await getClient();
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
      const client = await getClient();
      const streamState = await client.sharedState.get('ubean:ai:stream');

      // Filter by requestId so concurrent streams don't crosstalk.
      const unsubscribe = streamState.on('updated', (value: AiStreamChunk) => {
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
        unsubscribe();
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

  function fmtUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return `[${v.length} items]`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function fileName(p?: string): string {
    if (!p) return '';
    return p.split('/').pop() || p;
  }

  function filePath(p?: string): string {
    if (!p) return '';
    const parts = p.split('/');
    if (parts.length <= 5) return p;
    const prefix = parts.slice(0, 3).join('/');
    const suffix = parts.slice(-2).join('/');
    return `${prefix}/…/${suffix}`;
  }

  function methodClass(method: string): string {
    const map: Record<string, string> = {
      GET: 'bg-success/12 text-success',
      POST: 'bg-info/12 text-info',
      PUT: 'bg-warning/12 text-warning',
      DELETE: 'bg-destructive/12 text-destructive',
      PATCH: 'bg-purple-500/12 text-purple-400'
    };
    return map[method] || 'bg-secondary text-muted-foreground';
  }

  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    if (unsubscribe) unsubscribe();
    if (uptimeInterval) clearInterval(uptimeInterval);
  });

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
