import { $fetch, createFetch, FetchError } from 'ofetch';
import type { FetchOptions } from 'ofetch';
import type { HttpMethod } from '../core/routing/types';

const g = globalThis as any;

export interface ClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  timeout?: number;
  retry?: number;
  retryDelay?: number;
  onUploadProgress?: (loaded: number, total: number) => void;
  onRequest?: FetchOptions['onRequest'];
  onRequestError?: FetchOptions['onRequestError'];
  onResponse?: FetchOptions['onResponse'];
  onResponseError?: FetchOptions['onResponseError'];
}

export interface RequestOptions<T = unknown> extends Omit<ClientOptions, 'baseURL'> {
  body?: T;
  query?: Record<string, string | number | boolean | undefined | null>;
  params?: Record<string, string>;
}

export interface FlatResponse<T> {
  data: T | null;
  error: ClientError | null;
  status: number;
}

export interface ClientError extends Error {
  status: number;
  data: unknown;
}

function detectRuntime(): string {
  if (typeof g.window !== 'undefined') return 'browser';
  if (g.process?.versions?.node) return `node/${g.process.versions.node}`;
  if (typeof g.Deno !== 'undefined') return 'deno';
  if (typeof g.Bun !== 'undefined') return 'bun';
  if (typeof g.EdgeRuntime !== 'undefined') return 'edge';
  if (typeof g.workerd !== 'undefined') return 'workerd';
  return 'unknown';
}

function createXhrFetch(onUploadProgress: (loaded: number, total: number) => void): any {
  if (typeof g.XMLHttpRequest === 'undefined') {
    return undefined;
  }

  const XHR = g.XMLHttpRequest;

  return ((input: any, init?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XHR();
      const method = init?.method || 'GET';
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }

      xhr.open(method, url, true);

      xhr.responseType = 'blob';

      if (init?.headers) {
        const headersList: [string, string][] = Array.isArray(init.headers)
          ? init.headers
          : typeof init.headers.forEach === 'function' || init.headers instanceof Headers
            ? []
            : Object.entries(init.headers);
        for (const [key, value] of headersList) {
          xhr.setRequestHeader(key, value);
        }
      }

      if (init?.credentials === 'include') {
        xhr.withCredentials = true;
      }

      xhr.upload.addEventListener('progress', (event: any) => {
        if (event.lengthComputable) {
          onUploadProgress(event.loaded, event.total);
        }
      });

      xhr.addEventListener('load', () => {
        const headers = new g.Headers();
        const headerStr = xhr.getAllResponseHeaders() || '';
        const headerLines = headerStr.trim().split(/\r\n/);
        for (const line of headerLines) {
          const idx = line.indexOf(': ');
          if (idx > 0) {
            headers.append(line.slice(0, idx), line.slice(idx + 2));
          }
        }

        resolve(
          new g.Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers
          })
        );
      });

      xhr.addEventListener('error', () => {
        reject(new TypeError('Network request failed'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new TypeError('Network request timed out'));
      });

      xhr.send(init?.body);
    });
  }) as typeof fetch;
}

function createClientError(err: unknown): ClientError {
  if (err instanceof FetchError) {
    const clientError = new Error(err.message) as ClientError;
    clientError.status = err.response?.status || 0;
    clientError.data = err.data || null;
    clientError.stack = err.stack;
    return clientError;
  }
  if (err instanceof Error) {
    const clientError = err as ClientError;
    clientError.status = (err as any).status || 0;
    clientError.data = (err as any).data || null;
    return clientError;
  }
  const clientError = new Error(String(err)) as ClientError;
  clientError.status = 0;
  clientError.data = null;
  return clientError;
}

export function createClient(defaultOptions: ClientOptions = {}) {
  const runtime = detectRuntime();

  const globalOptions: Record<string, any> = {};
  if (defaultOptions.baseURL) globalOptions.baseURL = defaultOptions.baseURL;
  if (defaultOptions.timeout) globalOptions.timeout = defaultOptions.timeout;
  if (defaultOptions.retry !== undefined) globalOptions.retry = defaultOptions.retry;
  if (defaultOptions.retryDelay !== undefined) globalOptions.retryDelay = defaultOptions.retryDelay;
  if (defaultOptions.headers) globalOptions.headers = defaultOptions.headers;
  if (defaultOptions.credentials) globalOptions.credentials = defaultOptions.credentials;
  if (defaultOptions.onRequest) globalOptions.onRequest = defaultOptions.onRequest;
  if (defaultOptions.onRequestError) globalOptions.onRequestError = defaultOptions.onRequestError;
  if (defaultOptions.onResponse) globalOptions.onResponse = defaultOptions.onResponse;
  if (defaultOptions.onResponseError) globalOptions.onResponseError = defaultOptions.onResponseError;

  const baseFetch = $fetch.create(globalOptions as FetchOptions);

  function buildOptions<B>(options: RequestOptions<B> = {}): any {
    const fetchOpts: Record<string, any> = {
      retry: options.retry ?? defaultOptions.retry ?? 1,
      retryDelay: options.retryDelay ?? defaultOptions.retryDelay ?? 0,
      timeout: options.timeout ?? defaultOptions.timeout
    };

    if (options.headers) fetchOpts.headers = options.headers;
    if (options.credentials) fetchOpts.credentials = options.credentials;
    if (options.params) fetchOpts.params = options.params;
    if (options.body !== undefined) fetchOpts.body = options.body as any;
    if (options.query) fetchOpts.query = options.query as any;
    if (options.onRequest) fetchOpts.onRequest = options.onRequest;
    if (options.onRequestError) fetchOpts.onRequestError = options.onRequestError;
    if (options.onResponse) fetchOpts.onResponse = options.onResponse;
    if (options.onResponseError) fetchOpts.onResponseError = options.onResponseError;

    return fetchOpts;
  }

  async function request<T = unknown, B = unknown>(
    method: HttpMethod,
    url: string,
    options?: RequestOptions<B>
  ): Promise<T> {
    try {
      const opts = buildOptions(options);
      if (options?.onUploadProgress) {
        const xhrFetch = createXhrFetch(options.onUploadProgress);
        if (xhrFetch) {
          const customFetch = createFetch({ defaults: opts, fetch: xhrFetch } as any);
          return await customFetch<T>(url, { method: method as any });
        }
      }
      return await baseFetch<T>(url, { method: method as any, ...opts });
    } catch (err) {
      throw createClientError(err);
    }
  }

  async function requestFlat<T = unknown, B = unknown>(
    method: HttpMethod,
    url: string,
    options?: RequestOptions<B>
  ): Promise<FlatResponse<T>> {
    try {
      const opts = buildOptions(options);
      let response;
      if (options?.onUploadProgress) {
        const xhrFetch = createXhrFetch(options.onUploadProgress);
        if (xhrFetch) {
          const customFetch = createFetch({ defaults: opts, fetch: xhrFetch } as any);
          response = await customFetch.raw<T>(url, { method: method as any });
        } else {
          response = await baseFetch.raw<T>(url, { method: method as any, ...opts });
        }
      } else {
        response = await baseFetch.raw<T>(url, { method: method as any, ...opts });
      }
      return {
        data: (response as any)._data as T,
        error: null,
        status: response.status
      };
    } catch (err) {
      const clientError = createClientError(err);
      const status = (err as any)?.response?.status || 0;
      return {
        data: null,
        error: clientError,
        status
      };
    }
  }

  const client = {
    get<T = unknown>(url: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
      return request<T>('GET', url, options);
    },
    post<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<T> {
      return request<T, B>('POST', url, { ...options, body });
    },
    put<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<T> {
      return request<T, B>('PUT', url, { ...options, body });
    },
    patch<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<T> {
      return request<T, B>('PATCH', url, { ...options, body });
    },
    delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
      return request<T>('DELETE', url, options);
    },
    head<T = unknown>(url: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
      return request<T>('HEAD', url, options);
    },
    options<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
      return request<T>('OPTIONS', url, options);
    },

    $get<T = unknown>(url: string, options?: Omit<RequestOptions, 'body'>): Promise<FlatResponse<T>> {
      return requestFlat<T>('GET', url, options);
    },
    $post<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<FlatResponse<T>> {
      return requestFlat<T, B>('POST', url, { ...options, body });
    },
    $put<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<FlatResponse<T>> {
      return requestFlat<T, B>('PUT', url, { ...options, body });
    },
    $patch<T = unknown, B = unknown>(url: string, body?: B, options?: RequestOptions<B>): Promise<FlatResponse<T>> {
      return requestFlat<T, B>('PATCH', url, { ...options, body });
    },
    $delete<T = unknown>(url: string, options?: RequestOptions): Promise<FlatResponse<T>> {
      return requestFlat<T>('DELETE', url, options);
    },

    raw<T = unknown, B = unknown>(method: HttpMethod, url: string, options?: RequestOptions<B>) {
      const opts = buildOptions(options);
      return baseFetch.raw<T>(url, { method: method as any, ...opts });
    },

    extend(options: ClientOptions) {
      return createClient({
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers
        }
      });
    },

    runtime,

    /** 原始配置选项(用于 typed-client 等需要直接访问 baseURL 的场景) */
    defaults: defaultOptions
  };

  return client;
}

export type ApiClient = ReturnType<typeof createClient>;

export const defaultClient = createClient();

export const {
  get,
  post,
  put,
  patch,
  delete: del,
  head,
  options: opts,
  $get,
  $post,
  $put,
  $patch,
  $delete: $del,
  raw,
  extend,
  runtime
} = defaultClient;

export function diagnoseEnvironment(): {
  runtime: string;
  hasFetch: boolean;
  hasXHR: boolean;
  hasAbortController: boolean;
} {
  return {
    runtime: detectRuntime(),
    hasFetch: typeof g.fetch !== 'undefined',
    hasXHR: typeof g.XMLHttpRequest !== 'undefined',
    hasAbortController: typeof g.AbortController !== 'undefined'
  };
}
