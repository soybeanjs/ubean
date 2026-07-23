import type { Context } from 'hono';
import type { FetchAdapter, FetchAdapterInit, FetchAdapterResponse } from '@soybeanjs/fetch';
import type { UbeanEnv } from '../types/handler';
import type { InternalFetchOptions } from './pages/data';

// ============================================================================
// Fetcher registry
// ============================================================================

type AppFetcher = (request: Request) => Response | Promise<Response>;

const FETCHER_KEY = '__ubean_internal_fetcher__';

export function setInternalFetcher(fetcher: AppFetcher): void {
  (globalThis as Record<string, unknown>)[FETCHER_KEY] = fetcher;
}

export function getInternalFetcher(): AppFetcher | null {
  return ((globalThis as Record<string, unknown>)[FETCHER_KEY] as AppFetcher | undefined) || null;
}

export function clearInternalFetcher(): void {
  delete (globalThis as Record<string, unknown>)[FETCHER_KEY];
}

// ============================================================================
// Helpers
// ============================================================================

const FORWARD_HEADER_DEFAULTS = [
  'cookie',
  'authorization',
  'x-request-id',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
  'accept-language',
  'user-agent'
];

function applyContextHeaders(headers: Headers, c: Context<UbeanEnv>, forwardHeaders?: string[]): void {
  const names = forwardHeaders || FORWARD_HEADER_DEFAULTS;
  for (const name of names) {
    const value = c.req.header(name);
    if (value) headers.set(name, value);
  }
  const requestId = c.get('requestId');
  if (requestId) headers.set('x-request-id', requestId as string);
}

// ============================================================================
// createInternalAdapter — @soybeanjs/fetch FetchAdapter
// ============================================================================

/**
 * 创建进程内调度适配器。
 *
 * 将注册的 Hono `app.fetch` 包装为 `@soybeanjs/fetch` 的 `FetchAdapter`,
 * 使其可通过 `createRequest` / `createTypedClient` / `createFlatTypedClient` 等 API
 * 进行进程内调度(不发起新的网络请求)。
 *
 * 消费者可直接组合使用:
 * ```typescript
 * import { createInternalAdapter } from 'ubean';
 * import { createRequest, createTypedClient } from '@soybeanjs/fetch';
 *
 * const adapter = createInternalAdapter(c);
 * const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
 * const api = createTypedClient<paths>(request);
 * ```
 *
 * @param c - Hono Context(可选,用于转发 cookie/authorization 等请求头)
 * @param options - 选项(`headers` 自定义额外 header,`forwardHeaders` 自定义转发 header 列表)
 */
export function createInternalAdapter(c?: Context<UbeanEnv>, options?: InternalFetchOptions): FetchAdapter {
  const forwardHeaders = options?.forwardHeaders;
  const extraHeaders = options?.headers;

  return async (url: string, init: FetchAdapterInit): Promise<FetchAdapterResponse> => {
    const fetcher = getInternalFetcher();
    if (!fetcher) {
      throw new Error(
        '[ubean] createInternalAdapter: fetcher not registered. Call setInternalFetcher() with your app.fetch first.'
      );
    }
    const headers = new Headers(init.headers);
    headers.set('x-internal-request', '1');
    if (c) applyContextHeaders(headers, c, forwardHeaders);
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
    }
    const request = new Request(url, { ...init, headers } as RequestInit);
    return fetcher(request);
  };
}
