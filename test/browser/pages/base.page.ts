import { e2e } from '../lib/runner';
import type { E2eFetchResult } from '../commands';

/**
 * Base page object.
 *
 * All POMs extend this. It wraps the custom e2e browser commands (which run on
 * Node with Playwright access) into a clean, chainable API. Selectors are
 * Playwright selectors (CSS, text=, role=, ...).
 */
export class BasePage {
  constructor(public readonly path: string = '/') {}

  /** Open this page in a fresh e2e browser tab. */
  async open(): Promise<this> {
    await e2e.open(this.path);
    await this.waitForHydration();
    return this;
  }

  /** Navigate the active tab to this page (reuses the tab). */
  async goto(): Promise<this> {
    await e2e.goto(this.path);
    await this.waitForHydration();
    return this;
  }

  async title(): Promise<string> {
    return e2e.title();
  }

  async url(): Promise<string> {
    return e2e.url();
  }

  async text(selector: string): Promise<string | null> {
    return e2e.text(selector);
  }

  async html(selector?: string): Promise<string> {
    return e2e.html(selector);
  }

  async attr(selector: string, name: string): Promise<string | null> {
    return e2e.attr(selector, name);
  }

  async count(selector: string): Promise<number> {
    return e2e.count(selector);
  }

  async click(selector: string): Promise<void> {
    await e2e.click(selector);
  }

  /** Click and wait for navigation to settle; returns the new URL + title. */
  async clickNav(selector: string): Promise<{ url: string; title: string }> {
    return e2e.clickNav(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    await e2e.fill(selector, value);
  }

  async waitFor(selector: string, timeout?: number): Promise<void> {
    await e2e.waitFor(selector, timeout);
  }

  /** Wait for a JS expression (function body) to return truthy in the page. */
  async waitForFunction(fnSource: string, timeout?: number): Promise<void> {
    await e2e.waitForFunction(fnSource, timeout);
  }

  /**
   * Wait for hydration to complete by checking that Vue has mounted the app
   * (the SSR shell has a `data-v-app` attribute or the ubean hydration marker
   * is gone). Falls back gracefully if markers are not found.
   */
  async waitForHydration(timeout: number = 10000): Promise<void> {
    try {
      await e2e.waitForFunction(
        'return !!document.querySelector("#app[data-v-app]") || !!window.__UBEAN_HYDRATED__',
        timeout
      );
    } catch {
      // Hydration marker might not exist — assume hydration completed after a brief wait
    }
  }

  async meta(name: string): Promise<string | null> {
    return e2e.meta(name);
  }

  async metaProp(prop: string): Promise<string | null> {
    return e2e.metaProp(prop);
  }

  async linkHref(rel: string): Promise<string | null> {
    return e2e.linkHref(rel);
  }

  async eval(js: string): Promise<unknown> {
    return e2e.eval(js);
  }
}

/**
 * API client for HTTP-level assertions against the dev server.
 * Uses Node-side fetch (via e2eFetch command) — no CORS restrictions.
 */
export const api = {
  async get(path: string, headers?: Record<string, string>): Promise<E2eFetchResult> {
    return e2e.fetch(path, { method: 'GET', headers });
  },
  async post(path: string, body?: unknown, headers?: Record<string, string>): Promise<E2eFetchResult> {
    return e2e.fetch(path, { method: 'POST', body, headers });
  },
  async put(path: string, body?: unknown, headers?: Record<string, string>): Promise<E2eFetchResult> {
    return e2e.fetch(path, { method: 'PUT', body, headers });
  },
  async patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<E2eFetchResult> {
    return e2e.fetch(path, { method: 'PATCH', body, headers });
  },
  async delete(path: string, headers?: Record<string, string>): Promise<E2eFetchResult> {
    return e2e.fetch(path, { method: 'DELETE', headers });
  },
  async request(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      redirect?: RequestRedirect;
    }
  ): Promise<E2eFetchResult> {
    return e2e.fetch(path, options);
  }
};
