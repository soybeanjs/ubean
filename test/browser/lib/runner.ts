import type { E2eFetchResult, E2eFetchOptions } from '../commands';

/**
 * Browser-side accessor for custom e2e commands.
 *
 * We deliberately bypass `import { commands } from '@vitest/browser'` because the
 * project uses `vite-plus` (a custom Vite distribution) which declares
 * `__vite__injectQuery` in a way that conflicts with `@vitest/browser`'s context
 * module when imported inside a browser test file.
 *
 * Instead we reach for the `__vitest_browser_runner__` global that Vitest injects
 * into the test iframe and call `commands.triggerCommand(name, args)` directly —
 * this is exactly what `@vitest/browser`'s generated `commands` proxy does under
 * the hood.
 */

interface VitestBrowserRunner {
  commands: {
    triggerCommand: <T = unknown>(name: string, args: unknown[]) => Promise<T>;
  };
}

function runner(): VitestBrowserRunner {
  const r = (globalThis as unknown as { __vitest_browser_runner__?: VitestBrowserRunner }).__vitest_browser_runner__;
  if (!r) {
    throw new Error('__vitest_browser_runner__ is not available — are we inside a Vitest browser context?');
  }
  return r;
}

function cmd<T>(name: string, ...args: unknown[]): Promise<T> {
  return runner().commands.triggerCommand<T>(name, args);
}

export const e2e = {
  open: (url: string) => cmd<{ url: string; title: string }>('e2eOpen', url),
  close: () => cmd<boolean>('e2eClose'),
  goto: (url: string) => cmd<{ url: string; title: string }>('e2eGoto', url),
  click: (selector: string) => cmd<boolean>('e2eClick', selector),
  clickNav: (selector: string) => cmd<{ url: string; title: string }>('e2eClickNav', selector),
  fill: (selector: string, value: string) => cmd<boolean>('e2eFill', selector, value),
  text: (selector: string) => cmd<string | null>('e2eText', selector),
  html: (selector?: string) => cmd<string>('e2eHtml', selector),
  attr: (selector: string, name: string) => cmd<string | null>('e2eAttr', selector, name),
  count: (selector: string) => cmd<number>('e2eCount', selector),
  eval: (js: string) => cmd<unknown>('e2eEval', js),
  title: () => cmd<string>('e2eTitle'),
  url: () => cmd<string>('e2eUrl'),
  waitFor: (selector: string, timeout?: number) => cmd<boolean>('e2eWaitFor', selector, timeout),
  waitForFunction: (fnSource: string, timeout?: number) => cmd<boolean>('e2eWaitForFunction', fnSource, timeout),
  meta: (name: string) => cmd<string | null>('e2eMeta', name),
  metaProp: (prop: string) => cmd<string | null>('e2eMetaProp', prop),
  linkHref: (rel: string) => cmd<string | null>('e2eLinkHref', rel),
  fetch: (url: string, options?: E2eFetchOptions) => cmd<E2eFetchResult>('e2eFetch', url, options)
};

export type { E2eFetchResult };
