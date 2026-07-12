import { ref, onMounted, onUnmounted } from 'vue';
import { toast } from '@soybeanjs/ui';

declare global {
  interface Window {
    __UBEAN_DEVTOOLS_CONFIG__?: {
      rpcPath: string;
    };
  }
}

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
  schedule: string;
  filePath?: string;
}

export interface DevToolsInfo {
  version: string;
  pages: number;
  apiRoutes: number;
  middleware: number;
  crons: number;
  startTime: number;
  presets: string[];
  config: Record<string, unknown>;
  routes: DevToolsRouteInfo[];
  pagesList: DevToolsPageInfo[];
  middlewaresList: DevToolsMiddlewareInfo[];
  cronsList: DevToolsCronInfo[];
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

export type CrudResourceType = 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'env' | 'config';

export function useRpc() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const info = ref<DevToolsInfo | null>(null);
  const env = ref<Record<string, string>>({});
  const uptime = ref(0);
  let interval: ReturnType<typeof setInterval> | null = null;
  let reqId = 0;

  const rpcPath = window.__UBEAN_DEVTOOLS_CONFIG__?.rpcPath || '/__ubean_devtools/rpc';

  function showToast(type: 'success' | 'error' | 'info' | 'warning', message: string) {
    const options = {
      duration: 3000,
      position: 'top-right' as const
    };

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
      case 'info':
      default:
        toast(message, options);
        break;
    }
  }

  async function rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = String(++reqId);
    const res = await fetch(rpcPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, method, params })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result as T;
  }

  async function loadInfo() {
    try {
      const data = await rpc<DevToolsInfo>('getInfo');
      info.value = data;
      uptime.value = Date.now() - data.startTime;
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to connect';
    } finally {
      loading.value = false;
    }
  }

  async function loadEnv() {
    try {
      env.value = await rpc<Record<string, string>>('getEnv');
    } catch {
      // silent fail
    }
  }

  async function crudCreate(type: CrudResourceType, path: string, options?: { method?: string; content?: string; force?: boolean }): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('crud:create', { type, path, ...options });
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

  async function crudRead(type: CrudResourceType, path?: string): Promise<{ success: boolean; content?: string; data?: unknown; error?: string }> {
    try {
      return await rpc('crud:read', { type, path });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Read failed' };
    }
  }

  async function crudUpdate(type: CrudResourceType, options: { path?: string; key?: string; content?: string; value?: string }): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('crud:update', { type, ...options });
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

  async function crudDelete(type: CrudResourceType, options: { path?: string; key?: string; force?: boolean }): Promise<CrudResult> {
    try {
      const result = await rpc<CrudResult>('crud:delete', { type, ...options });
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
      const result = await rpc<CrudResult>('crud:restore', { path });
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

  function close() {
    window.parent.postMessage({ type: '__ubean_devtools_close' }, '*');
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
    if (parts.length > 4) {
      return '.../' + parts.slice(-3).join('/');
    }
    return p;
  }

  function methodColor(method: string): string {
    const colors: Record<string, string> = {
      GET: 'success',
      POST: 'info',
      PUT: 'warning',
      DELETE: 'destructive',
      PATCH: 'accent',
      ALL: 'muted'
    };
    return colors[method] || 'muted';
  }

  function methodClass(method: string): string {
    const map: Record<string, string> = {
      GET: 'method-get',
      POST: 'method-post',
      PUT: 'method-put',
      DELETE: 'method-delete',
      PATCH: 'method-patch'
    };
    return map[method] || 'method-all';
  }

  function getStatusColor(status: string): string {
    if (status === 'running') return 'success';
    return 'muted';
  }

  async function refresh() {
    await Promise.all([loadInfo(), loadEnv()]);
  }

  onMounted(() => {
    loadInfo();
    loadEnv();
    interval = setInterval(() => {
      loadInfo();
    }, 3000);
  });

  onUnmounted(() => {
    if (interval) clearInterval(interval);
  });

  return {
    loading,
    error,
    info,
    env,
    uptime,
    close,
    fmtUptime,
    fmtTime,
    fmtVal,
    fileName,
    filePath,
    methodColor,
    methodClass,
    getStatusColor,
    refresh,
    crudCreate,
    crudRead,
    crudUpdate,
    crudDelete,
    crudRestore,
    showToast
  };
}
