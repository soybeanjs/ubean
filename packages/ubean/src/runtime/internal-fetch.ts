import type { Context } from 'hono';
import type { UbeanEnv } from '../types/handler';

export interface InternalRequestOptions {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string | ArrayBuffer | Uint8Array | Record<string, unknown> | FormData;
  query?: Record<string, string | number | boolean | undefined>;
  parseResponse?: boolean;
}

export interface InternalRequestResult<T = unknown> {
  response: Response;
  data: T;
  status: number;
  headers: Headers;
}

type AppFetcher = (request: Request) => Response | Promise<Response>;

let globalFetcher: AppFetcher | null = null;

export function setInternalFetcher(fetcher: AppFetcher): void {
  globalFetcher = fetcher;
}

export function getInternalFetcher(): AppFetcher | null {
  return globalFetcher;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const base = 'internal://local';
  let url = path.startsWith('/') ? base + path : path;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  return url;
}

function buildHeaders(c?: Context<UbeanEnv>, headers?: Record<string, string> | Headers): Headers {
  const h = new Headers();

  h.set('x-internal-request', '1');

  if (c) {
    const cookie = c.req.header('cookie');
    if (cookie) h.set('cookie', cookie);
    const auth = c.req.header('authorization');
    if (auth) h.set('authorization', auth);
    const requestId = c.get('requestId');
    if (requestId) h.set('x-request-id', requestId as string);
    const forwardHeaders = ['accept-language', 'user-agent', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'];
    for (const name of forwardHeaders) {
      const value = c.req.header(name);
      if (value) h.set(name, value);
    }
  }

  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((value, key) => h.set(key, value));
    } else {
      for (const [key, value] of Object.entries(headers)) {
        h.set(key, value);
      }
    }
  }

  return h;
}

type BodyInitLike = string | ArrayBuffer | Uint8Array | FormData;

function buildBody(body?: InternalRequestOptions['body']): BodyInitLike | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof Uint8Array) return body;
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
}

export async function callInternal<T = unknown>(
  path: string,
  options: InternalRequestOptions = {}
): Promise<InternalRequestResult<T>> {
  if (!globalFetcher) {
    throw new Error(
      '[ubean] callInternal: fetcher not registered. Call setInternalFetcher() with your app.fetch first.'
    );
  }

  const method = (options.method || 'GET').toUpperCase();
  const url = buildUrl(path, options.query);
  const headers = buildHeaders(undefined, options.headers);
  const body = buildBody(options.body);

  if (method !== 'GET' && method !== 'HEAD' && body && typeof body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const request = new Request(url, { method, headers, body });
  const response = await globalFetcher(request);

  let data: T = undefined as T;
  if (options.parseResponse !== false) {
    const contentType = response.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else if (contentType.includes('text/')) {
        data = (await response.text()) as unknown as T;
      } else {
        data = (await response.arrayBuffer()) as unknown as T;
      }
    } catch {
      data = undefined as T;
    }
  }

  return { response, data, status: response.status, headers: response.headers };
}

export function createRequestSender(c: Context<UbeanEnv>) {
  return async function $request<T = unknown>(
    path: string,
    options: Omit<InternalRequestOptions, 'headers'> & { headers?: Record<string, string> | Headers } = {}
  ): Promise<InternalRequestResult<T>> {
    if (!globalFetcher) {
      throw new Error('[ubean] $request: fetcher not registered.');
    }

    const method = (options.method || 'GET').toUpperCase();
    const url = buildUrl(path, options.query);
    const headers = buildHeaders(c, options.headers);
    const body = buildBody(options.body);

    if (method !== 'GET' && method !== 'HEAD' && body && typeof body === 'string' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const request = new Request(url, { method, headers, body });
    const response = await globalFetcher(request);

    let data: T = undefined as T;
    if (options.parseResponse !== false) {
      const contentType = response.headers.get('content-type') || '';
      try {
        if (contentType.includes('application/json')) {
          data = (await response.json()) as T;
        } else if (contentType.includes('text/')) {
          data = (await response.text()) as unknown as T;
        } else {
          data = (await response.arrayBuffer()) as unknown as T;
        }
      } catch {
        data = undefined as T;
      }
    }

    return { response, data, status: response.status, headers: response.headers };
  };
}

export function clearInternalFetcher(): void {
  globalFetcher = null;
}
