/**
 * `useFetch` — Nuxt-style wrapper around `useAsyncData`.
 *
 * Does not invent an HTTP client. Pass a `@soybeanjs/fetch` `createRequest()`
 * instance (or any duck-typed client) via `setDefaultFetch` / `options.request`.
 * Without a client, falls back to global `fetch` + JSON.
 */
import { useAsyncData } from './data';
import type { DataResult, UseAsyncDataOptions } from './data';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FetchClient {
  get?: <T>(url: string, options?: { query?: Record<string, unknown> }) => Promise<T>;
  request?: <T>(options: {
    url: string;
    method?: string;
    data?: unknown;
    query?: Record<string, unknown>;
  }) => Promise<T>;
}

export interface UseFetchOptions<T> extends UseAsyncDataOptions {
  method?: HttpMethod;
  query?: Record<string, unknown>;
  body?: unknown;
  request?: FetchClient;
  transform?: (data: T) => T;
}

const FETCH_KEY = '__UBEAN_DEFAULT_FETCH__' as const;

type GlobalWithFetch = typeof globalThis & { [FETCH_KEY]?: FetchClient };

export function setDefaultFetch(request: FetchClient | undefined): void {
  (globalThis as GlobalWithFetch)[FETCH_KEY] = request;
}

export function getDefaultFetch(): FetchClient | undefined {
  return (globalThis as GlobalWithFetch)[FETCH_KEY];
}

async function nativeJson<T>(url: string, options: UseFetchOptions<T>): Promise<T> {
  const method = options.method ?? 'GET';
  const target = new URL(url, 'http://ubean.local');
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
  }
  const init: RequestInit = { method };
  if (method !== 'GET' && method !== 'DELETE' && options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const href = url.startsWith('http') ? target.toString() : `${target.pathname}${target.search}`;
  const res = await fetch(href, init);
  if (!res.ok) {
    throw new Error(`useFetch ${method} ${href} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function runFetch<T>(url: string, options: UseFetchOptions<T>): Promise<T> {
  const client = options.request ?? getDefaultFetch();
  const method = options.method ?? 'GET';
  let data: T;
  if (client?.get && method === 'GET') {
    data = await client.get<T>(url, { query: options.query });
  } else if (client?.request) {
    data = await client.request<T>({
      url,
      method,
      data: options.body,
      query: options.query
    });
  } else {
    data = await nativeJson<T>(url, options);
  }
  return options.transform ? options.transform(data) : data;
}

export async function useFetch<T>(
  key: string,
  url: string,
  options: UseFetchOptions<T> = {},
  context?: object
): Promise<DataResult<T>> {
  const { method, query, body, request, transform, ...asyncOpts } = options;
  return useAsyncData(key, () => runFetch<T>(url, { method, query, body, request, transform }), asyncOpts, context);
}
