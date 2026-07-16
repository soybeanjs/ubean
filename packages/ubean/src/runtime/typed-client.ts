/**
 * 类型化请求客户端
 *
 * 基于 openapi-typescript 生成的 `paths` 类型,提供类型安全的 HTTP 客户端和内部调度。
 *
 * 参数结构与 @soybeanjs/request 保持一致:
 * ```typescript
 * client.get('/api/users/{id}', {
 *   params: {
 *     path: { id: 1 },              // 替换 URL 中的 {id}
 *     query: { page: 1 },            // query string
 *     header: { Authorization: '' }  // 请求头
 *   },
 *   body: { name: 'test' }           // 请求体(POST/PUT/PATCH)
 * })
 * ```
 */

import type { FetchResponse, IFetchError } from 'ofetch';
import type { ApiClient, FlatResponse, ClientError } from './client';
import { callInternal, createRequestSender } from './internal-fetch';
import { createInternalFetch } from './pages/data';
import type { InternalFetchOptions } from './pages/data';

// ============================================================================
// 类型辅助工具
// ============================================================================

/** 支持的 HTTP 方法 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

/**
 * 提取支持指定 HTTP 方法的路径。
 * 方法值为 `never` 或 `undefined` 的路径会被过滤。
 */
export type PathsWithMethod<Paths extends Record<string, any>, M extends HttpMethod> = {
  [P in keyof Paths]: undefined extends Paths[P][M] ? never : P;
}[keyof Paths];

/** 获取 T 中的必填字段 */
export type RequiredKeysOf<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

/** 从 operation 中过滤出指定位置的参数 */
export type FilterKeys<Op, Location extends 'query' | 'path' | 'header' | 'cookie'> = Op extends {
  parameters: Record<Location, infer P>;
}
  ? { parameters: Record<Location, P> }
  : { parameters: Record<Location, never> };

// ============================================================================
// 响应类型与文件下载
// ============================================================================

/** 文件响应数据 */
export interface FileResponseData<T = Blob | ArrayBuffer | Uint8Array> {
  /** 文件内容 */
  file: T;
  /** 从 Content-Disposition 头解析的文件名 */
  filename: string;
  /** 响应头中的内容类型 */
  contentType: string;
}

/** 响应类型 — 决定返回值的解析方式 */
export type ResponseType = 'json' | 'blob' | 'arraybuffer' | 'text' | 'stream';

/** 文件类响应类型(需要解析 Content-Disposition) */
export type FileResponseType = 'blob' | 'arraybuffer' | 'stream';

/** 根据 ResponseType 映射返回值类型 */
export interface ResponseTypeMap {
  blob: FileResponseData<Blob>;
  arraybuffer: FileResponseData<ArrayBuffer>;
  stream: FileResponseData<Uint8Array>;
  text: string;
  json: unknown;
}

/**
 * 根据 R (ResponseType) 映射返回值类型。
 * - 'json' (默认): 返回 JsonType(从 OpenAPI operation 推断的成功响应类型)
 * - 'blob' / 'arraybuffer' / 'stream': 返回 FileResponseData
 * - 'text': 返回 string
 */
export type MappedType<R extends ResponseType, JsonType = unknown> = R extends keyof ResponseTypeMap
  ? R extends 'json'
    ? JsonType
    : ResponseTypeMap[R]
  : JsonType;

// ============================================================================
// Operation 内容提取器
// ============================================================================

/** 从 operation 中提取 JSON 请求体类型,无请求体时返回 `never` */
export type OperationRequestBodyContent<T> = [T] extends [{ requestBody?: never }]
  ? never
  : T extends { requestBody?: { content: { 'application/json': infer B } } }
    ? B
    : T extends { requestBody: { content: { 'application/json': infer B } } }
      ? B
      : never;

/** 检查请求体是否可选 */
export type IsOperationRequestBodyOptional<T> = T extends { requestBody: any } ? false : true;

/** 从 operation 中提取成功响应(200/201)的 JSON 数据 */
export type SuccessResponse<T> = T extends { responses: infer R }
  ? R extends Record<200, infer Res200>
    ? Res200 extends { content: { 'application/json': infer D } }
      ? D
      : unknown
    : R extends Record<201, infer Res201>
      ? Res201 extends { content: { 'application/json': infer D } }
        ? D
        : unknown
      : unknown
  : unknown;

/** 从 operation 中提取错误响应(4xx/5xx)的 JSON 数据 */
export type ErrorResponse<T> = T extends { responses: infer R }
  ? R extends Record<400, infer Res400>
    ? Res400 extends { content: { 'application/json': infer D } }
      ? D
      : unknown
    : R extends Record<500, infer Res500>
      ? Res500 extends { content: { 'application/json': infer D } }
        ? D
        : unknown
      : unknown
  : unknown;

// ============================================================================
// 请求选项类型
// ============================================================================

/** 从 operation 中提取完整参数对象 */
export type OperationParams<T> = T extends { parameters: infer P } ? P : Record<string, never>;

/** 根据 operation 判断 `params` 是否必填 */
export type ParamsOption<T> = T extends { parameters: infer P }
  ? RequiredKeysOf<P> extends never
    ? { params?: P }
    : { params: P }
  : { params?: Record<string, never> };

/** 根据 operation 判断 `body` 是否必填 */
export type RequestBodyOption<T> =
  OperationRequestBodyContent<T> extends never
    ? { body?: never }
    : IsOperationRequestBodyOptional<T> extends true
      ? { body?: OperationRequestBodyContent<T> }
      : { body: OperationRequestBodyContent<T> };

/**
 * OpenAPI operation 的基础请求选项(不含 responseType)。
 * 合并 params、body 和透传的 client 配置(排除 url/method/params/body/query/headers)。
 */
export type BaseRequestOptions<T, Extra = Record<string, any>> = ParamsOption<T> &
  RequestBodyOption<T> & { [K in keyof Extra]?: Extra[K] };

/**
 * OpenAPI operation 的完整请求选项。
 * 在 BaseRequestOptions 基础上,根据 R (ResponseType) 添加 responseType 和 getFileName。
 *
 * - R = 'json' (默认): responseType 可选且不能显式指定为非 json
 * - R = 'blob' | 'arraybuffer' | 'stream' | 'text': responseType 必填,可附带 getFileName
 */
export type TypedRequestOptions<T, R extends ResponseType = 'json', Extra = Record<string, any>> = BaseRequestOptions<
  T,
  Extra
> &
  (R extends 'json'
    ? { responseType?: 'json'; getFileName?: never }
    : { responseType: R; getFileName?: (response: Response) => string });

/** 兼容旧用法:不传 R 时默认为 'json' */
export type LegacyTypedRequestOptions<T, Extra = Record<string, any>> = BaseRequestOptions<T, Extra> & {
  responseType?: ResponseType;
  getFileName?: (response: Response) => string;
};

/** 额外透传给底层 client 的选项(排除已被 typed wrapper 接管的字段) */
export type ClientPassthroughOptions = Omit<Parameters<ApiClient['get']>[1], 'body' | 'query' | 'params' | 'headers'>;

// ============================================================================
// 客户端方法类型
// ============================================================================

/** 从路径条目中提取指定方法的 operation 类型 */
type OperationForPath<PathEntry, M extends HttpMethod> = PathEntry extends Record<M, infer Op> ? Op : never;

/** 类型化的客户端方法(如 GET / POST / ...) — 基于 responseType 重载推断返回类型 */
export type ClientMethod<Paths extends Record<string, any>, M extends HttpMethod, Extra = ClientPassthroughOptions> = {
  // 非 JSON 路径:responseType 必填,返回 MappedType<R, ...>
  <
    Path extends PathsWithMethod<Paths, M>,
    R extends Exclude<ResponseType, 'json'>,
    Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, R, Extra> = TypedRequestOptions<
      OperationForPath<Paths[Path], M>,
      R,
      Extra
    >
  >(
    url: Path,
    init: Init & { responseType: R }
  ): Promise<MappedType<R, SuccessResponse<OperationForPath<Paths[Path], M>>>>;
  // JSON 路径(默认):responseType 可选或 'json',返回 SuccessResponse<...>
  <
    Path extends PathsWithMethod<Paths, M>,
    Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, 'json', Extra> = TypedRequestOptions<
      OperationForPath<Paths[Path], M>,
      'json',
      Extra
    >
  >(
    url: Path,
    ...init: RequiredKeysOf<Init> extends never ? [init?: Init] : [init: Init]
  ): Promise<SuccessResponse<OperationForPath<Paths[Path], M>>>;
};

/** 类型化的 OpenAPI 客户端接口 */
export type TypedClient<Paths extends Record<string, any>> = {
  [M in HttpMethod]: ClientMethod<Paths, M>;
};

// ============================================================================
// 扁平化客户端类型
// ============================================================================

/** 扁平化响应 — 不抛出异常,通过返回值判断成功/失败 */
export type TypedFlatResponse<T, R extends ResponseType = 'json'> =
  | { data: MappedType<R, SuccessResponse<T>>; error: null; status: number }
  | { data: null; error: ClientError; status: number };

/** 类型化的扁平化客户端方法 — 基于 responseType 重载推断返回类型 */
export type FlatClientMethod<
  Paths extends Record<string, any>,
  M extends HttpMethod,
  Extra = ClientPassthroughOptions
> = {
  // 非 JSON 路径:responseType 必填,返回 TypedFlatResponse<Op, R>
  <
    Path extends PathsWithMethod<Paths, M>,
    R extends Exclude<ResponseType, 'json'>,
    Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, R, Extra> = TypedRequestOptions<
      OperationForPath<Paths[Path], M>,
      R,
      Extra
    >
  >(
    url: Path,
    init: Init & { responseType: R }
  ): Promise<TypedFlatResponse<OperationForPath<Paths[Path], M>, R>>;
  // JSON 路径(默认):responseType 可选或 'json',返回 TypedFlatResponse<Op, 'json'>
  <
    Path extends PathsWithMethod<Paths, M>,
    Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, 'json', Extra> = TypedRequestOptions<
      OperationForPath<Paths[Path], M>,
      'json',
      Extra
    >
  >(
    url: Path,
    ...init: RequiredKeysOf<Init> extends never ? [init?: Init] : [init: Init]
  ): Promise<TypedFlatResponse<OperationForPath<Paths[Path], M>, 'json'>>;
};

/** 类型化的扁平化 OpenAPI 客户端接口 */
export type TypedFlatClient<Paths extends Record<string, any>> = {
  [M in HttpMethod]: FlatClientMethod<Paths, M>;
};

// ============================================================================
// 内部调度类型
// ============================================================================

/** callInternal 的选项(排除已被 typed wrapper 接管的字段) */
export type InternalPassthroughOptions = Omit<Parameters<typeof callInternal>[1] & {}, 'method' | 'body' | 'query'>;

/** 类型化的内部调度方法 */
export type TypedInternalCaller<Paths extends Record<string, any>> = <
  Path extends PathsWithMethod<Paths, M>,
  M extends HttpMethod,
  Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, 'json', InternalPassthroughOptions> =
    TypedRequestOptions<OperationForPath<Paths[Path], M>, 'json', InternalPassthroughOptions>
>(
  url: Path,
  method: M,
  ...init: RequiredKeysOf<Init> extends never ? [init?: Init] : [init: Init]
) => Promise<{ data: SuccessResponse<OperationForPath<Paths[Path], M>>; status: number }>;

/** 类型化的请求发送器(上下文感知) */
export type TypedRequestSender<Paths extends Record<string, any>> = <
  Path extends PathsWithMethod<Paths, M>,
  M extends HttpMethod,
  Init extends TypedRequestOptions<OperationForPath<Paths[Path], M>, 'json'> = TypedRequestOptions<
    OperationForPath<Paths[Path], M>,
    'json'
  >
>(
  url: Path,
  method: M,
  ...init: RequiredKeysOf<Init> extends never ? [init?: Init] : [init: Init]
) => Promise<{ data: SuccessResponse<OperationForPath<Paths[Path], M>>; status: number }>;

// ============================================================================
// 路径前缀处理
// ============================================================================

/** 从 Paths 的 key 中移除指定前缀 */
export type PathsRemovedPrefix<Paths extends Record<string, any>, Prefix extends string> = {
  [P in keyof Paths as P extends `${Prefix}${infer S}` ? S : never]: Paths[P];
};

// ============================================================================
// 运行时实现
// ============================================================================

/** 匹配路径参数,如 `{id}` */
const PATH_PARAM_RE = /\{([^}]+)\}/g;

/**
 * 将路径参数(如 `{id}`)替换为 `params.path` 中的实际值。
 */
function replacePathParams(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  // 重置 lastIndex(全局正则复用)
  PATH_PARAM_RE.lastIndex = 0;
  return path.replace(PATH_PARAM_RE, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`[typed-client] Missing required path parameter "${key}" in "${path}"`);
    }
    return String(value);
  });
}

/**
 * 从 Content-Disposition 头解析文件名。
 *
 * 支持 RFC 5987 编码格式(filename*=UTF-8''xxx)和常规格式(filename="xxx")。
 */
export function parseContentDisposition(contentDisposition?: string | null): string {
  if (!contentDisposition) return '';

  // RFC 5987 编码格式: filename*=UTF-8''example%20file.pdf
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  // 常规格式: filename="example file.pdf" 或 filename=example.pdf
  const regularMatch = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
  if (regularMatch) {
    return regularMatch[1];
  }

  return '';
}

/**
 * 判断是否需要非 JSON 解析路径。
 * responseType 不为 'json' 时即需要走非 JSON 路径(text/blob/arraybuffer/stream)。
 */
function isNonJsonResponse(responseType: ResponseType): responseType is FileResponseType | 'text' {
  return responseType !== 'json';
}

/**
 * 通过原生 fetch 发起非 JSON 请求,返回未消费 body 的标准 Response 对象。
 *
 * 用于绕过 ofetch 对 responseType 的不一致处理,保证 blob/arraybuffer/stream/text
 * 的行为一致。
 */
async function fetchRawResponse(
  client: ApiClient,
  method: string,
  url: string,
  clientOpts: Record<string, any>
): Promise<Response> {
  const baseURL = client.defaults?.baseURL || '';
  let fullUrl = url.startsWith('http') ? url : `${baseURL}${url.startsWith('/') ? '' : '/'}${url}`;

  const headers = new Headers(clientOpts.headers as Record<string, string> | undefined);
  const init: RequestInit = {
    method: method.toUpperCase(),
    headers
  };

  if (clientOpts.query) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(clientOpts.query)) {
      if (v !== undefined && v !== null) searchParams.set(k, String(v));
    }
    const qs = searchParams.toString();
    if (qs) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }
  }

  if (clientOpts.body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    init.body = typeof clientOpts.body === 'string' ? clientOpts.body : JSON.stringify(clientOpts.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  if (clientOpts.credentials) init.credentials = clientOpts.credentials;

  return fetch(fullUrl, init);
}

/**
 * 根据 responseType 解析原生 fetch Response,返回对应的 FileResponseData 或文本。
 * 仅在 responseType 为 blob/arraybuffer/stream/text 时调用。
 *
 * 用于 createTypedClient / createTypedFlatClient / createTypedInternalFetch(均使用原生 fetch,未预读 body)。
 */
async function parseNonJsonResponse(
  response: Response,
  responseType: FileResponseType | 'text',
  getFileName?: (response: Response) => string
): Promise<FileResponseData | string> {
  const filename = getFileName?.(response) ?? parseContentDisposition(response.headers.get('content-disposition'));
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  if (responseType === 'text') {
    return await response.text();
  }

  if (responseType === 'blob') {
    return { file: await response.blob(), filename, contentType };
  }

  if (responseType === 'arraybuffer') {
    return { file: await response.arrayBuffer(), filename, contentType };
  }

  // stream: 读取为 Uint8Array
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }
    const file = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      file.set(chunk, offset);
      offset += chunk.length;
    }
    return { file, filename, contentType };
  }

  // 兜底:无 body 时返回空
  return { file: new Uint8Array(0), filename, contentType };
}

// ============================================================================
// createTypedClient
// ============================================================================

/**
 * 从 options 中提取 responseType 与 getFileName,并返回剩余的 client 选项。
 * 如果 responseType 未指定或为 'json',则视为 JSON 模式。
 */
function extractResponseType(options: any): {
  responseType: ResponseType;
  getFileName?: (response: Response) => string;
  rest: Record<string, any>;
} {
  const { responseType, getFileName, ...rest } = options || {};
  return {
    responseType: (responseType || 'json') as ResponseType,
    getFileName,
    rest
  };
}

/**
 * 构建 client 调用所需的 options(排除 typed wrapper 接管的字段)。
 */
function buildClientOptions(
  rest: Record<string, any>,
  params: any,
  body: any,
  method: HttpMethod
): Record<string, any> {
  // 从 rest 中剥离 params 和 body,避免污染底层 client 选项
  const { params: _p, body: _b, ...cleanRest } = rest;
  const clientOpts: Record<string, any> = { ...cleanRest };
  if (params?.query) clientOpts.query = params.query;
  if (params?.header) clientOpts.headers = { ...cleanRest.headers, ...params.header };
  const hasBody = body !== undefined && ['post', 'put', 'patch'].includes(method);
  if (hasBody) clientOpts.body = body;
  return clientOpts;
}

/**
 * 基于生成的 `paths` 类型创建类型安全的 HTTP 客户端。
 *
 * 包装现有 `createClient()` 返回的客户端实例,提供类型化的 `get`/`post`/`put`/`delete`/`patch`/`options`/`head` 方法。
 * 路径、参数、请求体和返回值类型均从 OpenAPI spec 推断。
 *
 * 支持通过 `responseType` 配置不同的返回类型:
 * - `'json'` (默认): 返回解析后的 JSON 数据
 * - `'blob'`: 返回 `{ file: Blob; filename: string; contentType: string }`
 * - `'arraybuffer'`: 返回 `{ file: ArrayBuffer; filename: string; contentType: string }`
 * - `'stream'`: 返回 `{ file: Uint8Array; filename: string; contentType: string }`
 * - `'text'`: 返回 `string`
 *
 * 文件下载场景下,文件名从 Content-Disposition 头自动解析,也可通过 `getFileName` 自定义。
 *
 * @param client - 通过 `createClient()` 创建的客户端实例
 * @param prefix - 可选的路径前缀
 *
 * @example
 * ```typescript
 * import { createClient, createTypedClient } from 'ubean';
 * import type { paths } from './.ubean/openapi';
 *
 * const client = createClient({ baseURL: 'http://localhost:3000' });
 * const typed = createTypedClient<paths>(client);
 *
 * // 完全类型安全 — 路径、参数、请求体、响应均已推断
 * const user = await typed.get('/api/users/{id}', {
 *   params: { path: { id: 1 } }
 * });
 * // user.name, user.email 均有类型
 *
 * // 文件下载
 * const file = await typed.get('/api/export', { responseType: 'blob' });
 * // file: { file: Blob; filename: string; contentType: string }
 *
 * // 文本响应
 * const text = await typed.get('/api/readme', { responseType: 'text' });
 * // text: string
 * ```
 */
export function createTypedClient<Paths extends Record<string, any>, Prefix extends string = ''>(
  client: ApiClient,
  prefix: Prefix = '' as Prefix
): TypedClient<PathsRemovedPrefix<Paths, Prefix>> {
  const methods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

  const typedClient: Record<HttpMethod, (url: string, options?: unknown) => Promise<unknown>> = {} as Record<
    HttpMethod,
    (url: string, options?: unknown) => Promise<unknown>
  >;

  for (const method of methods) {
    typedClient[method] = async (url: string, options?: unknown) => {
      const { responseType, getFileName, rest } = extractResponseType(options);
      const { params, body } = rest;
      const resolvedUrl = replacePathParams(`${prefix}${url}`, params?.path);
      const clientOpts = buildClientOptions(rest, params, body, method);

      // 非 JSON 响应(blob/arraybuffer/stream/text): 用原生 fetch 获取未消费的 Response
      if (isNonJsonResponse(responseType)) {
        const response = await fetchRawResponse(client, method, resolvedUrl, clientOpts);
        if (!response.ok) {
          throw Object.assign(new Error(`[typed-client] ${method.toUpperCase()} ${url} failed: ${response.status}`), {
            status: response.status,
            response
          });
        }
        return parseNonJsonResponse(response, responseType as FileResponseType | 'text', getFileName);
      }

      // JSON 响应: 走原有路径
      switch (method) {
        case 'get':
          return client.get(resolvedUrl, clientOpts);
        case 'post':
          return client.post(resolvedUrl, body, clientOpts);
        case 'put':
          return client.put(resolvedUrl, body, clientOpts);
        case 'patch':
          return client.patch(resolvedUrl, body, clientOpts);
        case 'delete':
          return client.delete(resolvedUrl, clientOpts);
        case 'head':
          return client.head(resolvedUrl, clientOpts);
        case 'options':
          return client.options(resolvedUrl, clientOpts);
        default:
          throw new Error(`[typed-client] Unsupported method: ${method}`);
      }
    };
  }

  return typedClient as unknown as TypedClient<PathsRemovedPrefix<Paths, Prefix>>;
}

// ============================================================================
// createTypedFlatClient
// ============================================================================

/**
 * 基于生成的 `paths` 类型创建类型安全的扁平化 HTTP 客户端。
 *
 * 包装现有 `createClient()` 返回的客户端实例,提供类型化的 `get`/`post`/... 方法。
 * 不抛出异常 — 成功或失败通过返回值 `{ data, error, status }` 判断。
 *
 * 支持通过 `responseType` 配置不同的返回类型(与 `createTypedClient` 一致):
 * - `'json'` (默认): 返回解析后的 JSON 数据
 * - `'blob'` / `'arraybuffer'` / `'stream'`: 返回 `FileResponseData`
 * - `'text'`: 返回 `string`
 *
 * @param client - 通过 `createClient()` 创建的客户端实例
 * @param prefix - 可选的路径前缀
 *
 * @example
 * ```typescript
 * import { createClient, createTypedFlatClient } from 'ubean';
 * import type { paths } from './.ubean/openapi';
 *
 * const client = createClient({ baseURL: 'http://localhost:3000' });
 * const flat = createTypedFlatClient<paths>(client);
 *
 * const { data, error } = await flat.get('/api/users/{id}', {
 *   params: { path: { id: 1 } }
 * });
 *
 * if (error) {
 *   console.error('Request failed:', error.message);
 * } else {
 *   console.log('User:', data.name);
 * }
 *
 * // 文件下载
 * const { data, error } = await flat.get('/api/export', { responseType: 'blob' });
 * if (!error) {
 *   console.log('Filename:', data.filename);
 * }
 * ```
 */
export function createTypedFlatClient<Paths extends Record<string, any>, Prefix extends string = ''>(
  client: ApiClient,
  prefix: Prefix = '' as Prefix
): TypedFlatClient<PathsRemovedPrefix<Paths, Prefix>> {
  const methods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

  const typedClient: Record<HttpMethod, (url: string, options?: unknown) => Promise<unknown>> = {} as Record<
    HttpMethod,
    (url: string, options?: unknown) => Promise<unknown>
  >;

  for (const method of methods) {
    typedClient[method] = async (url: string, options?: unknown) => {
      const { responseType, getFileName, rest } = extractResponseType(options);
      const { params, body } = rest;
      const resolvedUrl = replacePathParams(`${prefix}${url}`, params?.path);
      const clientOpts = buildClientOptions(rest, params, body, method);

      // 非 JSON 响应: 用原生 fetch 获取 Response,失败时返回 error
      if (isNonJsonResponse(responseType)) {
        try {
          const response = await fetchRawResponse(client, method, resolvedUrl, clientOpts);
          if (!response.ok) {
            return {
              data: null,
              error: Object.assign(
                new Error(`[typed-flat-client] ${method.toUpperCase()} ${url} failed: ${response.status}`),
                { status: response.status, data: null }
              ) as ClientError,
              status: response.status
            };
          }
          const parsed = await parseNonJsonResponse(response, responseType as FileResponseType | 'text', getFileName);
          return { data: parsed, error: null, status: response.status };
        } catch (err) {
          // 网络错误或解析失败
          const fetchErr = err as IFetchError;
          const status = fetchErr?.status || 0;
          const wrappedError = Object.assign(new Error((err as Error)?.message || 'Request failed'), {
            status,
            data: null
          }) as ClientError;
          return { data: null, error: wrappedError, status };
        }
      }

      // JSON 响应: 走原有 flat 路径
      let result: FlatResponse<any>;
      switch (method) {
        case 'get':
          result = await client.$get(resolvedUrl, clientOpts);
          break;
        case 'post':
          result = await client.$post(resolvedUrl, body, clientOpts);
          break;
        case 'put':
          result = await client.$put(resolvedUrl, body, clientOpts);
          break;
        case 'patch':
          result = await client.$patch(resolvedUrl, body, clientOpts);
          break;
        case 'delete':
          result = await client.$delete(resolvedUrl, clientOpts);
          break;
        case 'head':
          // head 没有 flat 版本,用 raw + 手动包装
          {
            const rawRes: FetchResponse<unknown> = await client.raw('HEAD', resolvedUrl, clientOpts);
            result = {
              data: rawRes._data ?? null,
              error: null,
              status: rawRes.status ?? 200
            };
          }
          break;
        case 'options':
          // options 没有 flat 版本,用 raw + 手动包装
          {
            const rawRes: FetchResponse<unknown> = await client.raw('OPTIONS', resolvedUrl, clientOpts);
            result = {
              data: rawRes._data ?? null,
              error: null,
              status: rawRes.status ?? 200
            };
          }
          break;
        default:
          throw new Error(`[typed-client] Unsupported method: ${method}`);
      }
      return result;
    };
  }

  return typedClient as unknown as TypedFlatClient<PathsRemovedPrefix<Paths, Prefix>>;
}

// ============================================================================
// callTypedInternal
// ============================================================================

/**
 * 类型安全的内部调度函数。
 *
 * 包装 `callInternal`,在进程内调度路由处理器。
 * 路径、方法、参数、请求体和返回值类型均从 OpenAPI spec 推断。
 *
 * @example
 * ```typescript
 * import { callTypedInternal } from 'ubean';
 * import type { paths } from './.ubean/openapi';
 *
 * const result = await callTypedInternal<paths>('/api/users/{id}', 'get', {
 *   params: { path: { id: 1 } }
 * });
 * // result.data 有类型
 * ```
 */
export function callTypedInternal<Paths extends Record<string, any>>(): TypedInternalCaller<Paths> {
  const fn = async (url: string, method: string, options?: unknown) => {
    const { params, body, ...rest } = (options || {}) as {
      params?: { path?: Record<string, unknown>; query?: Record<string, unknown>; header?: Record<string, unknown> };
      body?: unknown;
      headers?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const resolvedUrl = replacePathParams(url, params?.path);

    const callOpts: Record<string, unknown> = {
      method: method.toUpperCase(),
      ...rest
    };
    if (params?.query) callOpts.query = params.query;
    if (params?.header) callOpts.headers = { ...rest.headers, ...params.header };
    if (body !== undefined) callOpts.body = body;

    const result = await callInternal(resolvedUrl, callOpts);
    return {
      data: result.data,
      status: result.status
    };
  };
  return fn as unknown as TypedInternalCaller<Paths>;
}

// ============================================================================
// createTypedRequestSender
// ============================================================================

/**
 * 创建类型安全的上下文感知请求发送器。
 *
 * 包装 `createRequestSender`,在请求处理器内部用于进程内调度。
 * 自动转发 cookie、authorization、requestId 等 header。
 *
 * @param context - Hono Context 对象
 *
 * @example
 * ```typescript
 * import { createTypedRequestSender } from 'ubean';
 * import type { paths } from './.ubean/openapi';
 *
 * export const GET = defineHandler(async (c) => {
 *   const sender = createTypedRequestSender<paths>(c);
 *   const result = await sender('/api/users/{id}', 'get', {
 *     params: { path: { id: 1 } }
 *   });
 *   return c.json(result.data);
 * });
 * ```
 */
export function createTypedRequestSender<Paths extends Record<string, any>>(
  context: Parameters<typeof createRequestSender>[0]
): TypedRequestSender<Paths> {
  const sender = createRequestSender(context);

  const fn = async (url: string, method: string, options?: unknown) => {
    const { params, body, ...rest } = (options || {}) as {
      params?: { path?: Record<string, unknown>; query?: Record<string, unknown>; header?: Record<string, unknown> };
      body?: unknown;
      headers?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const resolvedUrl = replacePathParams(url, params?.path);

    const callOpts: Record<string, unknown> = {
      method: method.toUpperCase(),
      ...rest
    };
    if (params?.query) callOpts.query = params.query;
    if (params?.header) callOpts.headers = { ...rest.headers, ...params.header };
    if (body !== undefined) callOpts.body = body;

    const result = await sender(resolvedUrl, callOpts);
    return {
      data: result.data,
      status: result.status
    };
  };
  return fn as unknown as TypedRequestSender<Paths>;
}

// ============================================================================
// createTypedInternalFetch
// ============================================================================

/**
 * 创建类型安全的内部 fetch 客户端。
 *
 * 包装 `createInternalFetch`,在请求处理器内部用于进程间/同站点的类型化请求。
 * 自动转发 cookie、authorization、requestId 等 header。
 * 与 `createTypedClient` 接口一致,但内部通过 `createInternalFetch` 发起请求(而非 ApiClient)。
 *
 * 每个方法返回已解析的响应数据(而非 Response),失败时抛出带 `status` 的错误。
 *
 * 支持通过 `responseType` 配置不同的返回类型(与 `createTypedClient` 一致):
 * - `'json'` (默认): 返回解析后的 JSON 数据
 * - `'blob'` / `'arraybuffer'` / `'stream'`: 返回 `FileResponseData`
 * - `'text'`: 返回 `string`
 *
 * @param context - Hono Context(或兼容的 `{ req: ... }` 对象)
 * @param options - `createInternalFetch` 的选项(baseURL/headers/forwardHeaders)。
 *                  若未显式传入 `baseURL`,会自动从 `context.req.url` 推断 origin 作为 baseURL,
 *                  使相对路径(如 `/api/hello`)能正确解析。
 *
 * @example
 * ```typescript
 * import { defineHandler, useData, createTypedInternalFetch } from 'ubean';
 * import type { paths } from './.ubean/openapi';
 *
 * export const GET = defineHandler(async (c) => {
 *   // baseURL 自动从 c.req.url 推断,无需手动设置
 *   const api = createTypedInternalFetch<paths>(c);
 *   const result = await useData({
 *     fetcher: async () => api.get('/api/users/{id}', { params: { path: { id: 1 } } })
 *   });
 *   return c.json(result.data);
 * });
 *
 * // 文件下载
 * const file = await api.get('/api/export', { responseType: 'blob' });
 * // file: { file: Blob; filename: string; contentType: string }
 * ```
 */
export function createTypedInternalFetch<Paths extends Record<string, any>>(
  context: Parameters<typeof createInternalFetch>[0],
  options?: InternalFetchOptions
): TypedClient<Paths> {
  // 自动从当前请求 URL 中推断 baseURL,使相对路径(如 /api/hello)能正确解析
  // 显式传入的 options.baseURL 优先
  const resolvedOptions = options?.baseURL
    ? options
    : (() => {
        const reqUrl = context.req?.url;
        const baseURL = reqUrl ? new URL(reqUrl).origin : undefined;
        return baseURL ? { ...options, baseURL } : options;
      })();

  const fetchFn = createInternalFetch(context, resolvedOptions);
  const methods: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

  const typedClient: Record<HttpMethod, (url: string, options?: unknown) => Promise<unknown>> = {} as Record<
    HttpMethod,
    (url: string, options?: unknown) => Promise<unknown>
  >;

  for (const method of methods) {
    typedClient[method] = async (url: string, opts?: unknown) => {
      const { responseType, getFileName, rest } = extractResponseType(opts);
      const { params, body } = rest;
      let resolvedUrl = replacePathParams(url, params?.path);

      // 构建 query string
      if (params?.query) {
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(params.query)) {
          if (v !== undefined && v !== null) searchParams.set(k, String(v));
        }
        const qs = searchParams.toString();
        if (qs) resolvedUrl += (resolvedUrl.includes('?') ? '&' : '?') + qs;
      }

      const init: RequestInit = { ...rest };
      // 从 init 中剥离不属于 fetch 的字段
      const cleanInit = init as Record<string, unknown>;
      delete cleanInit.params;
      delete cleanInit.body;
      delete cleanInit.responseType;
      delete cleanInit.getFileName;
      init.method = method.toUpperCase();

      const headers = new Headers((init.headers as Record<string, string> | undefined) ?? undefined);
      if (params?.header) {
        for (const [k, v] of Object.entries(params.header)) {
          if (v !== undefined) headers.set(k, String(v));
        }
      }
      if (body !== undefined && ['post', 'put', 'patch'].includes(method)) {
        init.body = JSON.stringify(body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      init.headers = headers;

      const response = await fetchFn(resolvedUrl, init);

      if (!response.ok) {
        throw Object.assign(
          new Error(`[typed-internal-fetch] ${method.toUpperCase()} ${url} failed: ${response.status}`),
          { status: response.status, response }
        );
      }

      // 非 JSON 响应(blob/arraybuffer/stream/text)
      if (isNonJsonResponse(responseType)) {
        return parseNonJsonResponse(response, responseType as FileResponseType | 'text', getFileName);
      }

      // JSON 响应(默认)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }
      return undefined;
    };
  }

  return typedClient as unknown as TypedClient<Paths>;
}

// 导出运行时辅助函数以便测试
export { replacePathParams };
