/**
 * Test helper for integration tests.
 * Provides utilities for making HTTP requests to the dev server
 * and importing ubean functions directly for function-level testing.
 */

export function getBaseUrl(): string {
  const url = process.env.UBEAN_TEST_BASE_URL;
  if (!url) {
    throw new Error('UBEAN_TEST_BASE_URL is not set. global-setup may have failed.');
  }
  return url;
}

export interface ApiResult {
  status: number;
  ok: boolean;
  headers: Headers;
  data: unknown;
  text: string;
}

/**
 * Make an HTTP request to the dev server.
 */
export async function api(
  path: string,
  init: RequestInit = {}
): Promise<ApiResult> {
  const url = path.startsWith('http') ? path : `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    redirect: 'manual'
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Keep as text
  }
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    data,
    text
  };
}

/**
 * Make a GET request to the dev server.
 */
export async function getJson(path: string, headers?: Record<string, string>): Promise<ApiResult> {
  return api(path, { method: 'GET', headers });
}

/**
 * Make a POST request with JSON body.
 */
export async function postJson(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResult> {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

/**
 * Make a POST request with form data.
 */
export async function postForm(path: string, formData: Record<string, string>, headers?: Record<string, string>): Promise<ApiResult> {
  const body = new URLSearchParams(formData).toString();
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body
  });
}

/**
 * Wait for a condition to be true.
 */
export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
