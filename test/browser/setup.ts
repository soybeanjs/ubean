/**
 * Browser-side setup (runs in the test iframe before each test file).
 *
 * This file is type-only: it augments the `BrowserCommands` interface so custom
 * e2e commands are typed at call sites. We intentionally avoid runtime imports
 * of `@vitest/browser` here (importing it in a setup file triggers a
 * `__vite__injectQuery` redeclaration under the current Vite version).
 *
 * Page lifecycle is managed by the `e2eOpen` command itself, which closes any
 * previous e2e page for the session before opening a new one — so per-test
 * isolation is guaranteed without an explicit `afterEach` hook.
 */

declare module 'vitest/browser' {
  interface BrowserCommands {
    e2eOpen: (url: string) => Promise<{ url: string; title: string }>;
    e2eClose: () => Promise<boolean>;
    e2eGoto: (url: string) => Promise<{ url: string; title: string }>;
    e2eClick: (selector: string) => Promise<boolean>;
    e2eClickNav: (selector: string) => Promise<{ url: string; title: string }>;
    e2eFill: (selector: string, value: string) => Promise<boolean>;
    e2eText: (selector: string) => Promise<string | null>;
    e2eHtml: (selector?: string) => Promise<string>;
    e2eAttr: (selector: string, attr: string) => Promise<string | null>;
    e2eCount: (selector: string) => Promise<number>;
    e2eEval: (js: string) => Promise<unknown>;
    e2eTitle: () => Promise<string>;
    e2eUrl: () => Promise<string>;
    e2eWaitFor: (selector: string, timeout?: number) => Promise<boolean>;
    e2eWaitForFunction: (fnSource: string, timeout?: number) => Promise<boolean>;
    e2eMeta: (name: string) => Promise<string | null>;
    e2eMetaProp: (prop: string) => Promise<string | null>;
    e2eLinkHref: (rel: string) => Promise<string | null>;
    e2eFetch: (
      url: string,
      options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
        redirect?: RequestRedirect;
      }
    ) => Promise<{
      status: number;
      statusText: string;
      ok: boolean;
      headers: Record<string, string>;
      body: string;
      json: unknown;
    }>;
  }
}
