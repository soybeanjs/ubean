import { defineBrowserCommand } from '@vitest/browser';
import type { Page } from 'playwright';

/**
 * E2E browser commands.
 *
 * These commands run on the Node server side (registered via `test.browser.commands`
 * in vite.config.ts). Each command receives the Playwright-augmented
 * `BrowserCommandContext` which exposes `context` (BrowserContext) and `page`.
 *
 * For true e2e navigation we open a *new* page via `context.newPage()` pointing at
 * the ubean-test dev server — we never touch the Vitest runner iframe.
 *
 * For API/HTTP assertions we perform Node-side `fetch` (no CORS restrictions).
 *
 * The active e2e page is stored per-session so subsequent commands (click/fill/...)
 * operate on the same page within a test.
 */

const e2ePages = new Map<string, Page>();

function baseUrl(): string {
  return process.env.UBEAN_E2E_BASE_URL || 'http://127.0.0.1:3998';
}

function resolveUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${baseUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function getPage(ctx: { sessionId: string }): Promise<Page> {
  const page = e2ePages.get(ctx.sessionId);
  if (!page) throw new Error('No active e2e page. Call e2e.open(url) first.');
  return page;
}

export interface E2eFetchResult {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  json: unknown;
}

/** Open a new e2e page at `url` (closes any existing page for this session). */
export const e2eOpen = defineBrowserCommand(async (ctx, url: string) => {
  const existing = e2ePages.get(ctx.sessionId);
  if (existing) {
    await existing.close().catch(() => {});
  }
  const page = await ctx.context.newPage();
  page.setDefaultTimeout(30000);
  e2ePages.set(ctx.sessionId, page);
  await page.goto(resolveUrl(url), { waitUntil: 'networkidle' });
  return { url: page.url(), title: await page.title() };
});

/** Close the active e2e page for this session. */
export const e2eClose = defineBrowserCommand(async ctx => {
  const page = e2ePages.get(ctx.sessionId);
  if (page) {
    await page.close().catch(() => {});
    e2ePages.delete(ctx.sessionId);
  }
  return true;
});

/** Navigate the active page to `url`. */
export const e2eGoto = defineBrowserCommand(async (ctx, url: string) => {
  const page = await getPage(ctx);
  await page.goto(resolveUrl(url), { waitUntil: 'networkidle' });
  return { url: page.url(), title: await page.title() };
});

/** Click an element matching `selector`. */
export const e2eClick = defineBrowserCommand(async (ctx, selector: string) => {
  const page = await getPage(ctx);
  await page.locator(selector).first().click();
  return true;
});

/** Click and wait for navigation to settle (handles both SPA and full reloads). */
export const e2eClickNav = defineBrowserCommand(async (ctx, selector: string) => {
  const page = await getPage(ctx);
  const beforeUrl = page.url();
  await page.locator(selector).first().click();
  // SPA navigation (Vue Router) updates the URL via history.pushState without a
  // network load event, so wait for the URL to change. Fall back to networkidle
  // for full-page navigations.
  await page
    .waitForFunction(prev => location.href !== prev, beforeUrl, { timeout: 10000 })
    .catch(() => page.waitForLoadState('networkidle').catch(() => {}));
  return { url: page.url(), title: await page.title() };
});

/** Fill an input matching `selector` with `value`. */
export const e2eFill = defineBrowserCommand(async (ctx, selector: string, value: string) => {
  const page = await getPage(ctx);
  await page.locator(selector).first().fill(value);
  return true;
});

/** Get the text content of the first element matching `selector`. */
export const e2eText = defineBrowserCommand(async (ctx, selector: string) => {
  const page = await getPage(ctx);
  return page.locator(selector).first().textContent();
});

/** Get innerHTML of the first element matching `selector` (or whole body if omitted). */
export const e2eHtml = defineBrowserCommand(async (ctx, selector?: string) => {
  const page = await getPage(ctx);
  if (selector) {
    return page.locator(selector).first().innerHTML();
  }
  return page.content();
});

/** Get an attribute value from the first element matching `selector`. */
export const e2eAttr = defineBrowserCommand(async (ctx, selector: string, attr: string) => {
  const page = await getPage(ctx);
  return page.locator(selector).first().getAttribute(attr);
});

/** Count elements matching `selector`. */
export const e2eCount = defineBrowserCommand(async (ctx, selector: string) => {
  const page = await getPage(ctx);
  return page.locator(selector).count();
});

/** Evaluate a JS expression (as a function body) in the page and return JSON result. */
export const e2eEval = defineBrowserCommand(async (ctx, js: string) => {
  const page = await getPage(ctx);
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (async () => { ${js} })()`);
  const result = await page.evaluate(fn);
  // Handle undefined/null results gracefully (e.g., history.back() returns undefined)
  if (result === undefined || result === null) return null;
  return JSON.parse(JSON.stringify(result));
});

/** Get the page title. */
export const e2eTitle = defineBrowserCommand(async ctx => {
  const page = await getPage(ctx);
  return page.title();
});

/** Get the current page URL. */
export const e2eUrl = defineBrowserCommand(async ctx => {
  const page = await getPage(ctx);
  return page.url();
});

/** Wait for a selector to be visible. */
export const e2eWaitFor = defineBrowserCommand(async (ctx, selector: string, timeout?: number) => {
  const page = await getPage(ctx);
  await page
    .locator(selector)
    .first()
    .waitFor({ state: 'visible', timeout: timeout ?? 15000 });
  return true;
});

/**
 * Wait for a JS function (evaluated in the page) to return truthy.
 * The `fnSource` is a function body string that receives no args and should
 * return a boolean. Polls every 100ms until truthy or timeout.
 */
export const e2eWaitForFunction = defineBrowserCommand(async (ctx, fnSource: string, timeout?: number) => {
  const page = await getPage(ctx);
  // eslint-disable-next-line no-new-func
  const fn = new Function(fnSource);
  await page.waitForFunction(fn, undefined, { timeout: timeout ?? 30000, polling: 100 });
  return true;
});

/** Get the content of a <meta> tag by its name property. */
export const e2eMeta = defineBrowserCommand(async (ctx, name: string) => {
  const page = await getPage(ctx);
  return page.locator(`meta[name="${name}"]`).getAttribute('content');
});

/** Get the content of a <meta> tag by its property attribute (e.g. og:title). */
export const e2eMetaProp = defineBrowserCommand(async (ctx, prop: string) => {
  const page = await getPage(ctx);
  return page.locator(`meta[property="${prop}"]`).getAttribute('content');
});

/** Get the href of a <link> tag by its rel attribute. */
export const e2eLinkHref = defineBrowserCommand(async (ctx, rel: string) => {
  const page = await getPage(ctx);
  return page.locator(`link[rel="${rel}"]`).getAttribute('href');
});

export interface E2eFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  redirect?: RequestRedirect;
}

/**
 * Perform a Node-side HTTP request to the dev server (no CORS).
 * Returns status, headers, body (text) and parsed json (if applicable).
 */
export const e2eFetch = defineBrowserCommand(async (ctx, url: string, options?: E2eFetchOptions) => {
  const method = options?.method || 'GET';
  const headers: Record<string, string> = { ...options?.headers };
  let body: BodyInit | undefined;
  if (options?.body !== undefined) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(resolveUrl(url), {
    method,
    headers,
    body,
    redirect: options?.redirect || 'manual'
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep as text
  }
  const flatHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    flatHeaders[k] = v;
  });
  const result: E2eFetchResult = {
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
    headers: flatHeaders,
    body: text,
    json: parsed
  };
  return result;
});

export const e2eCommands = {
  e2eOpen,
  e2eClose,
  e2eGoto,
  e2eClick,
  e2eClickNav,
  e2eFill,
  e2eText,
  e2eHtml,
  e2eAttr,
  e2eCount,
  e2eEval,
  e2eTitle,
  e2eUrl,
  e2eWaitFor,
  e2eWaitForFunction,
  e2eMeta,
  e2eMetaProp,
  e2eLinkHref,
  e2eFetch
};
