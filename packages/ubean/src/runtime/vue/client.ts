import type { PageObject, PageHead } from '../pages/protocol';

interface MinimalElement {
  textContent: string | null;
}

interface MinimalDocument {
  getElementById(id: string): MinimalElement | null;
}

interface MinimalLocation {
  href: string;
  pathname: string;
  search: string;
  replace(url: string): void;
}

interface MinimalHistory {
  back(): void;
  forward(): void;
  pushState(data: unknown, unused: string, url?: string | null): void;
  replaceState(data: unknown, unused: string, url?: string | null): void;
}

type PopStateEventListener = (event: Event) => void;

interface MinimalWindow {
  location: MinimalLocation;
  history: MinimalHistory;
  fetch: typeof fetch;
  addEventListener(type: 'popstate', listener: PopStateEventListener): void;
}

interface GlobalWithUbeanData {
  document?: MinimalDocument;
  location?: MinimalLocation;
  __UBEAN_PAGE_DATA__?: PageObject | null;
  window?: MinimalWindow;
  fetch?: typeof fetch;
  history?: MinimalHistory;
}

const _global = globalThis as GlobalWithUbeanData;

export interface UbeanVueRouter {
  current: PageObject;
  navigating: boolean;
  submitting: boolean;
  prefetch: (url: string) => Promise<void>;
  push: (url: string, opts?: { replace?: boolean }) => Promise<void>;
  replace: (url: string) => Promise<void>;
  back: () => void;
  forward: () => void;
  refresh: () => Promise<void>;
  submit: (url: string, opts: SubmitOptions) => Promise<SubmitResult>;
}

export interface SubmitOptions {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  replace?: boolean;
}

export interface SubmitResult {
  ok: boolean;
  redirected?: boolean;
  url?: string;
  errors?: Record<string, string> | null;
  data?: Record<string, unknown>;
  status: number;
}

export interface UbeanVueHead {
  setHead: (head: Partial<PageHead>) => void;
  addMeta: (meta: Record<string, string>) => void;
  setTitle: (title: string) => void;
}

export interface UbeanVueApp {
  router: UbeanVueRouter;
  head: UbeanVueHead;
  page: PageObject;
}

export function getInitialPageData<T = Record<string, unknown>>(): PageObject<T> | null {
  if (typeof _global.document === 'undefined') return null;
  const doc = _global.document;
  const el = doc.getElementById('__UBEAN_PAGE_DATA__');
  if (!el) return (_global.__UBEAN_PAGE_DATA__ as PageObject<T> | null) ?? null;
  try {
    return JSON.parse(el.textContent || 'null') as PageObject<T> | null;
  } catch {
    return null;
  }
}

export function createUbeanClient() {
  const initial = getInitialPageData() ?? { component: '', props: {}, params: {}, url: '/' };

  const state: { page: PageObject; navigating: boolean; submitting: boolean } = {
    page: initial as PageObject,
    navigating: false,
    submitting: false
  };

  const listeners = new Set<(page: PageObject) => void>();

  function subscribe(fn: (page: PageObject) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function fetchPage(url: string): Promise<PageObject> {
    const res = await _global.fetch!(url, {
      headers: { 'x-ubeanpages': 'true' }
    });
    if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
    return res.json() as Promise<PageObject>;
  }

  function applyPage(page: PageObject, opts: { replace?: boolean; url?: string } = {}) {
    state.page = page;
    const url = opts.url ?? page.url;
    const loc = _global.location!;
    const hist = _global.history!;
    if (opts.replace) {
      hist.replaceState({}, '', url);
    } else if (url && url !== loc.pathname + loc.search) {
      hist.pushState({}, '', url);
    }
    for (const fn of listeners) fn(page);
  }

  async function navigate(url: string, opts: { replace?: boolean } = {}) {
    state.navigating = true;
    try {
      const page = await fetchPage(url);
      applyPage(page, { ...opts, url });
    } finally {
      state.navigating = false;
    }
  }

  async function prefetch(url: string) {
    try {
      await fetchPage(url);
    } catch {
      // ignore prefetch errors
    }
  }

  function back() {
    _global.history!.back();
  }

  function forward() {
    _global.history!.forward();
  }

  async function refresh() {
    const loc = _global.location!;
    await navigate(loc.pathname + loc.search, { replace: true });
  }

  async function submit(url: string, opts: SubmitOptions = {}): Promise<SubmitResult> {
    const { method = 'POST', body, headers = {}, replace: doReplace = false } = opts;
    state.submitting = true;
    try {
      let fetchBody: unknown;
      const fetchHeaders: Record<string, string> = {
        'x-ubeanpages': 'true',
        ...headers
      };

      if (body instanceof FormData) {
        fetchBody = body;
      } else if (body instanceof URLSearchParams) {
        fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchBody = body;
      } else if (body && typeof body === 'object') {
        fetchHeaders['Content-Type'] = 'application/json';
        fetchBody = JSON.stringify(body);
      }

      const res = await _global.fetch!(url, {
        method,
        headers: fetchHeaders,
        body: fetchBody as string | FormData | URLSearchParams | undefined,
        redirect: 'manual'
      });

      const redirectUrl = res.headers.get('X-Ubean-Redirect');
      if (redirectUrl) {
        await navigate(redirectUrl, { replace: doReplace });
        return { ok: true, redirected: true, url: redirectUrl, status: res.status };
      }

      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as Record<string, unknown>;
        if (typeof data.redirect === 'string') {
          await navigate(data.redirect, { replace: doReplace });
          return { ok: true, redirected: true, url: data.redirect, status: res.status };
        }
        if (data.component) {
          const pageData = data as unknown as PageObject;
          applyPage(pageData, { replace: doReplace, url });
          return {
            ok: res.ok,
            errors: pageData.errors ?? null,
            data: pageData.props as Record<string, unknown>,
            status: res.status
          };
        }
        return { ok: res.ok, data: data as Record<string, unknown>, status: res.status };
      }

      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, errors: { _error: err instanceof Error ? err.message : String(err) }, status: 0 };
    } finally {
      state.submitting = false;
    }
  }

  if (typeof _global.window !== 'undefined') {
    _global.window.addEventListener('popstate', async () => {
      state.navigating = true;
      try {
        const loc = _global.location!;
        const page = await fetchPage(loc.pathname + loc.search);
        applyPage(page);
      } finally {
        state.navigating = false;
      }
    });
  }

  const router: UbeanVueRouter = {
    get current() {
      return state.page;
    },
    get navigating() {
      return state.navigating;
    },
    get submitting() {
      return state.submitting;
    },
    prefetch,
    push: navigate,
    replace: (url: string) => navigate(url, { replace: true }),
    back,
    forward,
    refresh,
    submit
  };

  return { state, subscribe, navigate, fetchPage, applyPage, prefetch, submit, router };
}
