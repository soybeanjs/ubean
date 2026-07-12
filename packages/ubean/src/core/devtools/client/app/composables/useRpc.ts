import { ref, onMounted, onUnmounted } from 'vue';

declare global {
  interface Window {
    __UBEAN_DEVTOOLS_CONFIG__?: {
      rpcPath: string;
    };
  }
}

export interface DevToolsInfo {
  version: string;
  pages: number;
  apiRoutes: number;
  middleware: number;
  startTime: number;
  routes: Array<{ method: string; path: string; filePath?: string }>;
  pagesList: Array<{ path: string; name?: string; filePath?: string }>;
  middlewaresList: Array<{ path: string; global?: boolean; filePath?: string }>;
  config?: Record<string, unknown>;
}

export function useRpc() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const info = ref<DevToolsInfo | null>(null);
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
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function fileName(p: string): string {
    return p.split('/').pop() || p;
  }

  function methodColor(method: string): string {
    const colors: Record<string, string> = {
      GET: 'success',
      POST: 'info',
      PUT: 'warning',
      DELETE: 'danger',
      PATCH: 'accent'
    };
    return colors[method] || 'secondary';
  }

  onMounted(() => {
    loadInfo();
    interval = setInterval(() => {
      if (info.value) {
        uptime.value = Date.now() - info.value.startTime;
      }
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
    uptime,
    close,
    fmtUptime,
    fmtTime,
    fmtVal,
    fileName,
    methodColor
  };
}
