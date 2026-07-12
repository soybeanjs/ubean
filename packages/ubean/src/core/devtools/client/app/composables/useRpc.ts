import { ref, onMounted, onUnmounted } from 'vue';

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

export function useRpc() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const info = ref<DevToolsInfo | null>(null);
  const env = ref<Record<string, string>>({});
  const uptime = ref(0);
  let interval: ReturnType<typeof setInterval> | null = null;
  let reqId = 0;

  const rpcPath = window.__UBEAN_DEVTOOLS_CONFIG__?.rpcPath || '/__ubean_devtools/rpc';

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
    refresh: loadInfo
  };
}
