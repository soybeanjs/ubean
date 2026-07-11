import type { PageObject } from '../pages/protocol';

const _global = globalThis as any;

export interface UbeanVueContext {
  __ubean_client?: ReturnType<typeof import('./client').createUbeanClient>;
}

export interface LinkProps {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
}

export function createLinkHandler(ctx: UbeanVueContext) {
  return {
    getProps: () => ({}),
    async navigate(href: string, opts: { replace?: boolean } = {}) {
      if (!ctx.__ubean_client) {
        const loc = _global.location;
        if (opts.replace) loc.replace(href);
        else loc.href = href;
        return;
      }
      await ctx.__ubean_client.navigate(href, opts);
    },
    async prefetch(href: string) {
      if (ctx.__ubean_client) {
        await ctx.__ubean_client.prefetch(href);
      }
    }
  };
}

export function extractPageData<T = Record<string, unknown>>(): PageObject<T> | null {
  if (typeof _global.document === 'undefined') return null;
  const el = _global.document.getElementById('__UBEAN_PAGE_DATA__');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || 'null');
  } catch {
    return null;
  }
}
