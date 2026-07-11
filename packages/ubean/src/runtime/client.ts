export interface ApiClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  credentials?: any;
  onRequest?: (ctx: { request: any; url: string }) => void | Promise<void>;
  onResponse?: (ctx: { response: Response }) => void | Promise<void>;
  onError?: (ctx: { error: Error; response?: Response }) => void | Promise<void>;
}

export interface ApiRouteDefinition {
  [path: string]: {
    [method: string]: {
      query?: Record<string, unknown>;
      json?: unknown;
      form?: unknown;
      param?: Record<string, string>;
      response?: unknown;
    };
  };
}

type ExtractMethod<T, M extends string> = T extends { [K in M]: infer R } ? R : never;
type ExtractPaths<T> = keyof T & string;

type PathWithParam<T extends string> = T extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof PathWithParamRec<Rest>]: string }
  : T extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string }
    : T extends `${infer _Start}*${infer Param}`
      ? { [K in Param]: string }
      : {};

type PathWithParamRec<T extends string> = T extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & PathWithParamRec<Rest>
  : T extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string }
    : {};

type ClientMethod<D, M extends string> = <P extends ExtractPaths<D>>(
  path: P,
  ...args: ExtractMethod<D[P], M> extends { query?: infer Q; json?: infer B; form?: infer F; response?: infer _R }
    ? [
        options?: {
          params?: PathWithParam<P>;
          query?: Q;
          json?: B;
          form?: F;
          headers?: Record<string, string>;
        }
      ]
    : [
        options?: {
          params?: PathWithParam<P>;
          query?: Record<string, unknown>;
          json?: unknown;
          form?: Record<string, unknown>;
          headers?: Record<string, string>;
        }
      ]
) => Promise<ExtractMethod<D[P], M> extends { response?: infer R } ? R : unknown>;

export interface TypedApiClient<D extends ApiRouteDefinition = ApiRouteDefinition> {
  get: ClientMethod<D, 'GET'>;
  post: ClientMethod<D, 'POST'>;
  put: ClientMethod<D, 'PUT'>;
  patch: ClientMethod<D, 'PATCH'>;
  delete: ClientMethod<D, 'DELETE'>;
  raw(path: string, init?: RequestInit): Promise<Response>;
}

function buildUrl(
  path: string,
  params?: Record<string, string>,
  query?: Record<string, unknown>,
  baseURL?: string
): string {
  let urlPath = path;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      urlPath = urlPath.replace(`:${k}`, encodeURIComponent(String(v)));
      urlPath = urlPath.replace(`*${k}`, encodeURIComponent(String(v)));
    }
  }
  let url = baseURL ? baseURL.replace(/\/$/, '') + urlPath : urlPath;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        qs.append(k, String(v));
      }
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }
  return url;
}

export function createApiClient<D extends ApiRouteDefinition = ApiRouteDefinition>(
  options: ApiClientOptions = {}
): TypedApiClient<D> {
  const { baseURL = '', headers: defaultHeaders, credentials, onRequest, onResponse, onError } = options;

  async function request(
    method: string,
    path: string,
    opts: {
      params?: Record<string, string>;
      query?: Record<string, unknown>;
      json?: unknown;
      form?: Record<string, unknown> | FormData;
      headers?: Record<string, string>;
    } = {}
  ): Promise<any> {
    const { params, query, json, form, headers: optHeaders } = opts;
    const url = buildUrl(path, params, query, baseURL);

    const headers: Record<string, string> = { ...defaultHeaders, ...optHeaders };
    let body: any;

    if (json !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(json);
    } else if (form instanceof FormData) {
      body = form;
    } else if (form && typeof form === 'object') {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) {
        fd.append(k, String(v));
      }
      body = fd;
    }

    const init: RequestInit & { url: string } = {
      method,
      headers,
      body,
      credentials
    } as RequestInit & { url: string };

    if (onRequest) await onRequest({ request: init, url });

    try {
      const response = await fetch(url, init);
      if (onResponse) await onResponse({ response });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (onError) await onError({ error, response });
        throw error;
      }
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }
      return response.text();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) await onError({ error });
      throw error;
    }
  }

  return {
    get: ((path: string, opts?: any) => request('GET', path, opts)) as any,
    post: ((path: string, opts?: any) => request('POST', path, opts)) as any,
    put: ((path: string, opts?: any) => request('PUT', path, opts)) as any,
    patch: ((path: string, opts?: any) => request('PATCH', path, opts)) as any,
    delete: ((path: string, opts?: any) => request('DELETE', path, opts)) as any,
    raw(path: string, init?: RequestInit): Promise<Response> {
      const url = baseURL ? baseURL.replace(/\/$/, '') + path : path;
      return fetch(url, init);
    }
  };
}
