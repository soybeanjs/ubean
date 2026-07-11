import type { PageObject, PageHead } from '../pages/protocol';

export interface UbeanVueRouter {
  current: PageObject;
  navigating: boolean;
  prefetch: (url: string) => Promise<void>;
  push: (url: string, opts?: { replace?: boolean }) => Promise<void>;
  replace: (url: string) => Promise<void>;
  back: () => void;
  forward: () => void;
  refresh: () => Promise<void>;
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

const _global = globalThis as any;

export function getInitialPageData<T = Record<string, unknown>>(): PageObject<T> | null {
  if (typeof _global.document === 'undefined') return null;
  const doc = _global.document;
  const el = doc.getElementById('__UBEAN_PAGE_DATA__');
  if (!el) return _global.__UBEAN_PAGE_DATA__ ?? null;
  try {
    return JSON.parse(el.textContent || 'null');
  } catch {
    return null;
  }
}

export function createUbeanClient() {
  const initial = getInitialPageData() ?? { component: '', props: {}, params: {}, url: '/' };

  const state: { page: PageObject; navigating: boolean } = {
    page: initial as PageObject,
    navigating: false
  };

  const listeners = new Set<(page: PageObject) => void>();

  function subscribe(fn: (page: PageObject) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function fetchPage(url: string): Promise<PageObject> {
    const res = await _global.fetch(url, {
      headers: { 'x-ubeanpages': 'true' }
    });
    if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
    return res.json();
  }

  async function navigate(url: string, opts: { replace?: boolean } = {}) {
    state.navigating = true;
    try {
      const page = await fetchPage(url);
      state.page = page;
      if (opts.replace) {
        _global.history.replaceState({}, '', url);
      } else {
        _global.history.pushState({}, '', url);
      }
      for (const fn of listeners) fn(page);
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
    _global.history.back();
  }

  function forward() {
    _global.history.forward();
  }

  async function refresh() {
    await navigate(_global.location.pathname + _global.location.search, { replace: true });
  }

  if (typeof _global.window !== 'undefined') {
    _global.window.addEventListener('popstate', async () => {
      state.navigating = true;
      try {
        const page = await fetchPage(_global.location.pathname + _global.location.search);
        state.page = page;
        for (const fn of listeners) fn(page);
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
    prefetch,
    push: navigate,
    replace: (url: string) => navigate(url, { replace: true }),
    back,
    forward,
    refresh
  };

  return { state, subscribe, navigate, prefetch, router };
}
