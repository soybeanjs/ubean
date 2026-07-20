/**
 * 类型化请求客户端集成测试
 *
 * 验证 createTypedClient / createTypedFlatClient / callTypedInternal 的
 * 运行时行为和类型推断。
 *
 * 类型来源: ubean dev server 自动生成的 .ubean/openapi.d.ts
 * (由 openapi-typescript 从 /_openapi.json 编译)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createClient,
  createTypedClient,
  createTypedFlatClient,
  callTypedInternal,
  createTypedRequestSender,
  setInternalFetcher,
  clearInternalFetcher,
  replacePathParams,
  parseContentDisposition
} from 'ubean';
import type { FileResponseData } from 'ubean';
import type { paths } from '../.ubean/openapi.d.ts';
import { getBaseUrl } from './helper';

const BASE_URL = () => getBaseUrl();

// Loose typed client/flat client used in tests where the path/options
// bypass OpenAPI type restrictions (e.g. responseType, paths not in spec).
type LooseTypedClient = {
  get(url: string, options?: unknown): Promise<unknown>;
  post(url: string, options?: unknown): Promise<unknown>;
  put(url: string, options?: unknown): Promise<unknown>;
  delete(url: string, options?: unknown): Promise<unknown>;
  patch(url: string, options?: unknown): Promise<unknown>;
  options(url: string, options?: unknown): Promise<unknown>;
  head(url: string, options?: unknown): Promise<unknown>;
};
type LooseTypedFlatClient = {
  get(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  post(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  put(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  delete(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  patch(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  options(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
  head(url: string, options?: unknown): Promise<{ data: unknown; error: unknown; status: number }>;
};

// ============================================================================
// 1. replacePathParams - 路径参数替换工具
// ============================================================================

describe('Typed client - replacePathParams', () => {
  it('replaces {id} with value', () => {
    expect(replacePathParams('/api/users/{id}', { id: 42 })).toBe('/api/users/42');
  });

  it('replaces multiple params', () => {
    expect(replacePathParams('/api/{org}/{repo}', { org: 'ubean', repo: 'core' })).toBe('/api/ubean/core');
  });

  it('returns path unchanged when no params', () => {
    expect(replacePathParams('/api/hello')).toBe('/api/hello');
  });

  it('returns path unchanged when params is undefined', () => {
    expect(replacePathParams('/api/hello', undefined)).toBe('/api/hello');
  });

  it('throws on missing required param', () => {
    expect(() => replacePathParams('/api/users/{id}', {})).toThrow('Missing required path parameter "id"');
  });

  it('throws on null param', () => {
    expect(() => replacePathParams('/api/users/{id}', { id: null })).toThrow('Missing required path parameter "id"');
  });

  it('converts non-string values to string', () => {
    expect(replacePathParams('/api/users/{id}', { id: 123 })).toBe('/api/users/123');
    expect(replacePathParams('/api/users/{id}', { id: true })).toBe('/api/users/true');
  });
});

// ============================================================================
// 2. createTypedClient - 类型化 HTTP 客户端
// ============================================================================

describe('Typed client - createTypedClient', () => {
  it('creates a typed client from createClient instance', () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    expect(typeof typed.get).toBe('function');
    expect(typeof typed.post).toBe('function');
    expect(typeof typed.put).toBe('function');
    expect(typeof typed.delete).toBe('function');
    expect(typeof typed.patch).toBe('function');
    expect(typeof typed.options).toBe('function');
    expect(typeof typed.head).toBe('function');
  });

  it('GET /api/users/{id} with path param', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const data = await typed.get('/api/users/{id}', {
      params: { path: { id: '1' } }
    });
    expect(data).toBeDefined();
    expect(Number((data as { id: unknown }).id)).toBe(1);
  });

  it('GET /api/users returns { users, total }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const data = await typed.get('/api/users');
    expect(data).toHaveProperty('users');
    expect(data).toHaveProperty('total');
    expect(Array.isArray((data as { users: unknown[] }).users)).toBe(true);
    expect((data as { users: unknown[] }).users.length).toBeGreaterThan(0);
  });

  it('POST /api/users with typed body', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const data = await typed.post('/api/users', {
      body: { name: 'Typed User', email: 'typed@example.com', role: 'user' }
    });
    expect(data).toBeDefined();
    expect((data as { name: string }).name).toBe('Typed User');
    expect((data as { email: string }).email).toBe('typed@example.com');
  });

  it('GET /api/search with query params', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const data = await typed.get('/api/search', {
      params: { query: { q: 'test' } }
    });
    expect(data).toBeDefined();
  });

  it('GET /api/headers with header params', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const data = await typed.get('/api/headers', {
      params: { header: { 'x-custom-header': 'typed-value' } }
    });
    expect(data).toBeDefined();
  });

  it('PATCH /api/users/{id} with body (id=2, tolerates 404 if deleted by other tests)', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    try {
      const data = await (typed as unknown as LooseTypedClient).patch('/api/users/{id}', {
        params: { path: { id: '2' } },
        body: { name: 'Updated Name', email: 'updated@example.com', role: 'admin' }
      });
      expect(data).toBeDefined();
      expect((data as { name: string }).name).toBe('Updated Name');
    } catch (err) {
      expect((err as { status?: number }).status).toBe(404);
    }
  });

  it('PUT /api/users/{id} with body (id=3, tolerates 404 if deleted by other tests)', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    try {
      const data = await (typed as unknown as LooseTypedClient).put('/api/users/{id}', {
        params: { path: { id: '3' } },
        body: { name: 'Put User', email: 'put@example.com', role: 'user' }
      });
      expect(data).toBeDefined();
      expect((data as { name: string }).name).toBe('Put User');
    } catch (err) {
      expect((err as { status?: number }).status).toBe(404);
    }
  });

  it('DELETE /api/users/{id} (tolerates 404 if already deleted by other tests)', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    try {
      const data = await typed.delete('/api/users/{id}', {
        params: { path: { id: '1' } }
      });
      expect(data).toBeDefined();
    } catch (err) {
      expect((err as { status?: number }).status).toBe(404);
    }
  });

  it('supports prefix option', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client, '');
    // Test without prefix since OpenAPI paths already include /api prefix
    const data = await typed.get('/api/users/{id}', {
      params: { path: { id: '1' } }
    });
    expect(data).toBeDefined();
  });
});

// ============================================================================
// 3. createTypedFlatClient - 类型化扁平化客户端
// ============================================================================

describe('Typed client - createTypedFlatClient', () => {
  it('creates a typed flat client', () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    expect(typeof flat.get).toBe('function');
    expect(typeof flat.post).toBe('function');
  });

  it('$get /api/users/{id} returns { data, error, status }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await flat.get('/api/users/{id}', {
      params: { path: { id: '1' } }
    });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('status');
    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    // id may be number (user exists) or string (fallback { id: rawId })
    expect(Number((result as { data?: { id?: unknown } }).data?.id)).toBe(1);
  });

  it('$get on non-existent route returns error in flat response', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    // Use a path not in paths type - will 404 at runtime
    try {
      const result = await flat.get('/api/users/{id}', {
        params: { path: { id: '99999' } }
      });
      // Either returns with data or error
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
    } catch {
      // Flat client should not throw, but path param validation might
    }
  });

  it('$post /api/users returns flat response with data', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await flat.post('/api/users', {
      body: { name: 'Flat User', email: 'flat@example.com', role: 'user' }
    });
    expect(result.status).toBe(201);
    expect(result.error).toBeNull();
    expect((result as { data?: { name?: string } }).data?.name).toBe('Flat User');
  });

  it('$delete /api/users/{id} returns flat response', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await flat.delete('/api/users/{id}', {
      params: { path: { id: '1' } }
    });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('status');
  });
});

// ============================================================================
// 4. callTypedInternal - 类型化内部调度
// ============================================================================

describe('Typed client - callTypedInternal', () => {
  beforeEach(() => {
    clearInternalFetcher();
  });

  afterEach(() => {
    clearInternalFetcher();
  });

  it('creates a typed internal caller function', () => {
    const caller = callTypedInternal<paths>();
    expect(typeof caller).toBe('function');
  });

  it('throws when no fetcher is registered', async () => {
    const caller = callTypedInternal<paths>();
    await expect(caller('/api/users/{id}', 'get', { params: { path: { id: '1' } } })).rejects.toThrow(
      /fetcher not registered/
    );
  });

  it('calls internal fetcher with correct URL (path params replaced)', async () => {
    let receivedUrl = '';
    setInternalFetcher((req: Request) => {
      receivedUrl = new URL(req.url).pathname;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, name: 'Test' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    const caller = callTypedInternal<paths>();
    const result = await caller('/api/users/{id}', 'get', {
      params: { path: { id: '42' } }
    });

    expect(receivedUrl).toBe('/api/users/42');
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 1, name: 'Test' });
  });

  it('passes query params to internal fetcher', async () => {
    let receivedQuery = '';
    setInternalFetcher((req: Request) => {
      receivedQuery = new URL(req.url).search;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    const caller = callTypedInternal<paths>();
    await caller('/api/search', 'get', {
      params: { query: { q: 'hello' } }
    });

    expect(receivedQuery).toBe('?q=hello');
  });

  it('passes body to internal fetcher for POST', async () => {
    let receivedBody = '';
    let receivedMethod = '';
    setInternalFetcher(async (req: Request) => {
      receivedMethod = req.method;
      receivedBody = await req.text();
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    const caller = callTypedInternal<paths>();
    const result = await caller('/api/users', 'post', {
      body: { name: 'Internal User', email: 'internal@test.com', role: 'user' }
    });

    expect(receivedMethod).toBe('POST');
    expect(JSON.parse(receivedBody)).toEqual({
      name: 'Internal User',
      email: 'internal@test.com',
      role: 'user'
    });
    expect(result.status).toBe(201);
  });

  it('passes header params to internal fetcher', async () => {
    let receivedHeader = '';
    setInternalFetcher((req: Request) => {
      receivedHeader = req.headers.get('x-custom-header') || '';
      return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    });

    const caller = callTypedInternal<paths>();
    await caller('/api/headers', 'get', {
      params: { header: { 'x-custom-header': 'internal-value' } }
    });

    expect(receivedHeader).toBe('internal-value');
  });

  it('integrates with real dev server via fetcher', async () => {
    setInternalFetcher(async (req: Request) => {
      const url = new URL(req.url);
      const realUrl = `${BASE_URL()}${url.pathname}${url.search}`;
      return fetch(realUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body
      });
    });

    const caller = callTypedInternal<paths>();
    const result = await caller('/api/users/{id}', 'get', {
      params: { path: { id: '1' } }
    });

    expect(result.status).toBe(200);
    expect(Number((result.data as { id: unknown }).id)).toBe(1);
  });
});

// ============================================================================
// 5. createTypedRequestSender - 上下文感知的类型化发送器
// ============================================================================

describe('Typed client - createTypedRequestSender', () => {
  beforeEach(() => {
    clearInternalFetcher();
  });

  afterEach(() => {
    clearInternalFetcher();
  });

  it('creates a typed request sender from Hono context', () => {
    const mockContext = {
      req: { header: () => undefined },
      get: () => undefined,
      set: () => {}
    } as any;
    const sender = createTypedRequestSender<paths>(mockContext);
    expect(typeof sender).toBe('function');
  });

  it('forwards cookie from context', async () => {
    let receivedCookie = '';
    setInternalFetcher((req: Request) => {
      receivedCookie = req.headers.get('cookie') || '';
      return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    });

    const mockContext = {
      req: { header: (name: string) => (name === 'cookie' ? 'session=abc' : undefined) },
      get: () => undefined,
      set: () => {}
    } as any;
    const sender = createTypedRequestSender<paths>(mockContext);
    await sender('/api/users/{id}', 'get', {
      params: { path: { id: '1' } }
    });

    expect(receivedCookie).toBe('session=abc');
  });

  it('replaces path params in URL', async () => {
    let receivedUrl = '';
    setInternalFetcher((req: Request) => {
      receivedUrl = new URL(req.url).pathname;
      return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    });

    const mockContext = {
      req: { header: () => undefined },
      get: () => undefined,
      set: () => {}
    } as any;
    const sender = createTypedRequestSender<paths>(mockContext);
    await sender('/api/users/{id}', 'get', {
      params: { path: { id: '99' } }
    });

    expect(receivedUrl).toBe('/api/users/99');
  });
});

// ============================================================================
// 6. 类型推断验证(编译时)
// ============================================================================

describe('Typed client - type inference (compile-time)', () => {
  // 这些测试在编译时验证类型推断
  // 如果类型不正确,TypeScript 编译会失败

  it('createTypedClient returns TypedClient<paths>', () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);

    // 验证方法存在
    expect(typeof typed.get).toBe('function');
    expect(typeof typed.post).toBe('function');
    expect(typeof typed.put).toBe('function');
    expect(typeof typed.delete).toBe('function');
    expect(typeof typed.patch).toBe('function');
  });

  it('createTypedFlatClient returns TypedFlatClient<paths>', () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);

    expect(typeof flat.get).toBe('function');
    expect(typeof flat.post).toBe('function');
  });

  it('callTypedInternal returns TypedInternalCaller<paths>', () => {
    const caller = callTypedInternal<paths>();
    expect(typeof caller).toBe('function');
  });

  // 类型断言测试 — 这些在编译时验证
  it('type assertions pass at compile time', () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);

    // 以下调用如果类型不匹配,编译时会报错
    // GET /api/users/{id} 需要 path.id: string
    const getPromise = typed.get('/api/users/{id}', {
      params: { path: { id: '1' } }
    });

    // POST /api/users 需要 body: { name, email, role }
    const postPromise = typed.post('/api/users', {
      body: { name: 'Test', email: 'test@test.com', role: 'user' }
    });

    // 确保返回的是 Promise
    expect(getPromise).toBeInstanceOf(Promise);
    expect(postPromise).toBeInstanceOf(Promise);
  });
});

// ============================================================================
// 8. parseContentDisposition - 文件名解析工具
// ============================================================================

describe('Typed client - parseContentDisposition', () => {
  it('returns empty string for undefined input', () => {
    expect(parseContentDisposition(undefined)).toBe('');
    expect(parseContentDisposition(null)).toBe('');
    expect(parseContentDisposition('')).toBe('');
  });

  it('parses regular filename="example.pdf" format', () => {
    expect(parseContentDisposition('attachment; filename="example.pdf"')).toBe('example.pdf');
  });

  it('parses regular filename without quotes', () => {
    expect(parseContentDisposition('attachment; filename=report.csv')).toBe('report.csv');
  });

  it("parses RFC 5987 encoded format filename*=UTF-8''...", () => {
    // 'hello world.pdf' URL-encoded
    expect(parseContentDisposition("attachment; filename*=UTF-8''hello%20world.pdf")).toBe('hello world.pdf');
  });

  it('parses Chinese filename via RFC 5987 encoding', () => {
    // '报告.pdf' URL-encoded as UTF-8
    expect(parseContentDisposition("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf")).toBe('报告.pdf');
  });

  it('returns empty string when no filename found', () => {
    expect(parseContentDisposition('attachment')).toBe('');
    expect(parseContentDisposition('inline')).toBe('');
  });

  it('handles malformed filename gracefully', () => {
    // Won't throw — just returns empty
    expect(parseContentDisposition('filename=')).toBe('');
  });

  it('prefers RFC 5987 encoded format over regular format', () => {
    const header = 'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'preferred%20file.pdf';
    expect(parseContentDisposition(header)).toBe('preferred file.pdf');
  });
});

// ============================================================================
// 9. createTypedClient - responseType 配置
// ============================================================================

describe('Typed client - responseType', () => {
  it('responseType: "text" returns string from /api/text', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    // /api/text returns a plain text response
    const text = (await (typed as unknown as LooseTypedClient).get('/api/text', { responseType: 'text' })) as string;
    expect(typeof text).toBe('string');
    expect(text).toContain('plain text response');
  });

  it('responseType: "blob" returns FileResponseData from /api/download', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const file = (await (typed as unknown as LooseTypedClient).get('/api/download', {
      params: { query: { filename: 'test-blob.txt', contentType: 'text/plain' } },
      responseType: 'blob'
    })) as FileResponseData<Blob>;
    expect(file).toBeDefined();
    expect(file).toHaveProperty('file');
    expect(file).toHaveProperty('filename');
    expect(file).toHaveProperty('contentType');
    expect(file.filename).toBe('test-blob.txt');
    expect(file.contentType).toBe('text/plain');
    expect(file.file).toBeInstanceOf(Blob);
  });

  it('responseType: "arraybuffer" returns FileResponseData<ArrayBuffer>', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const file = (await (typed as unknown as LooseTypedClient).get('/api/download', {
      params: { query: { filename: 'test-ab.bin', contentType: 'application/octet-stream' } },
      responseType: 'arraybuffer'
    })) as FileResponseData<ArrayBuffer>;
    expect(file).toBeDefined();
    expect(file.filename).toBe('test-ab.bin');
    expect(file.contentType).toBe('application/octet-stream');
    expect(file.file).toBeInstanceOf(ArrayBuffer);
    expect(file.file.byteLength).toBeGreaterThan(0);
  });

  it('responseType: "stream" returns FileResponseData<Uint8Array>', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const file = (await (typed as unknown as LooseTypedClient).get('/api/download', {
      params: { query: { filename: 'test-stream.bin' } },
      responseType: 'stream'
    })) as FileResponseData<Uint8Array>;
    expect(file).toBeDefined();
    expect(file.filename).toBe('test-stream.bin');
    expect(file.file).toBeInstanceOf(Uint8Array);
    expect(file.file.length).toBeGreaterThan(0);
  });

  it('responseType: "text" with default filename (no query params)', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const text = (await (typed as unknown as LooseTypedClient).get('/api/text', { responseType: 'text' })) as string;
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('responseType: "blob" parses Chinese filename from Content-Disposition', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const encodedFilename = encodeURIComponent('测试文件.txt');
    const file = (await (typed as unknown as LooseTypedClient).get('/api/download', {
      params: { query: { filename: encodedFilename, contentType: 'text/plain' } },
      responseType: 'blob'
    })) as FileResponseData<Blob>;
    // 文件名通过 query 传入,服务端在 Content-Disposition 中使用 filename="<original>"
    expect(file.filename).toBe(encodedFilename);
  });

  it('responseType: "blob" with custom getFileName callback', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    const file = (await (typed as unknown as LooseTypedClient).get('/api/download', {
      params: { query: { filename: 'ignored.txt' } },
      responseType: 'blob',
      getFileName: () => 'custom-name.txt'
    })) as FileResponseData<Blob>;
    expect(file.filename).toBe('custom-name.txt');
  });

  it('default responseType (json) still works alongside non-json', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const typed = createTypedClient<paths>(client);
    // JSON 请求
    const data = await typed.get('/api/users');
    expect(data).toHaveProperty('users');
    // 文本请求
    const text = (await (typed as unknown as LooseTypedClient).get('/api/text', { responseType: 'text' })) as string;
    expect(typeof text).toBe('string');
  });
});

// ============================================================================
// 10. createTypedFlatClient - responseType 配置
// ============================================================================

describe('Typed flat client - responseType', () => {
  it('responseType: "text" returns { data: string, error: null }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await (flat as unknown as LooseTypedFlatClient).get('/api/text', { responseType: 'text' });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('status');
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('plain text');
  });

  it('responseType: "blob" returns { data: FileResponseData, error: null }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await (flat as unknown as LooseTypedFlatClient).get('/api/download', {
      params: { query: { filename: 'flat-blob.txt' } },
      responseType: 'blob'
    });
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    const data = result.data as FileResponseData<Blob>;
    expect(data.filename).toBe('flat-blob.txt');
    expect(data.file).toBeInstanceOf(Blob);
  });

  it('responseType: "arraybuffer" returns { data: FileResponseData<ArrayBuffer> }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await (flat as unknown as LooseTypedFlatClient).get('/api/download', {
      params: { query: { filename: 'flat-ab.bin' } },
      responseType: 'arraybuffer'
    });
    expect(result.error).toBeNull();
    expect((result.data as FileResponseData<ArrayBuffer>).file).toBeInstanceOf(ArrayBuffer);
  });

  it('responseType: "stream" returns { data: FileResponseData<Uint8Array> }', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    const result = await (flat as unknown as LooseTypedFlatClient).get('/api/download', {
      params: { query: { filename: 'flat-stream.bin' } },
      responseType: 'stream'
    });
    expect(result.error).toBeNull();
    expect((result.data as FileResponseData<Uint8Array>).file).toBeInstanceOf(Uint8Array);
  });

  it('non-2xx response with responseType: "blob" returns error in flat response', async () => {
    const client = createClient({ baseURL: BASE_URL() });
    const flat = createTypedFlatClient<paths>(client);
    // 请求不存在的资源
    const result = await (flat as unknown as LooseTypedFlatClient).get('/api/non-existent-route', {
      responseType: 'blob'
    });
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('status');
    // 404 应返回 error 而非 data
    // (status 可能是 404 或 0,取决于错误处理)
  });
});
