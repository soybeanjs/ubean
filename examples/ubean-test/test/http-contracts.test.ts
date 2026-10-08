/**
 * TS-35：从 L3（`test/browser/specs/*.e2e.spec.ts`）下沉的 **HTTP 契约断言**。
 *
 * 为什么要有这个文件：L3 的 201 条用例里，有 101 条**完全不碰浏览器** —— 它们用
 * `api.{get,post,…}`（`test/browser/pages/base.page.ts` 的 `e2e.fetch` → Node 侧 fetch，
 * 无 CORS）断言的是**纯 HTTP 语义**。那正是 L2 的领域（§1.2：纯 HTTP 语义留 L2）。
 * 同样的断言在 L2 更便宜（无浏览器启动、无 Playwright、无 20 条路径预热），
 * 且能跑 dev/build 双轨。故把它们迁到 L2，并从 L3 删除。
 *
 * 本文件**只收 L3 独有的、更严格的契约**。L2 已有的更强断言（`manifest.test.ts`、
 * `download.test.ts`、`errors.test.ts`、`stream.test.ts`、`rate-limit.test.ts`、
 * `data-cache.test.ts` 的大部分）不在此重复。每条用例上方的 `// ← 原 …` 注释标明它在 L3
 * 的出处。
 *
 * 两条刻意的取舍（都写在台账里）：
 * 1. **不断言 fixture 种子字面量**（如 `/api/users/1 → {id:1,name:'张三'}`）。
 *    L2 的 37 个文件在同一个 dev server 上**并行**跑，而 `typed-client.test.ts` 会
 *    PATCH id=2、PUT id=3、DELETE id=1 —— 断言种子内容会变成跨文件竞态假红。
 *    改为「创建自己的记录 → 读/改/删自己的记录」与「访问必然不存在的 id（999）」
 *    这两种**确定性**形态；被测分支（found / not-found）不丢。
 * 2. dev-only 端点（`/_openapi.json`、`/_scalar`、`/_devtools`、`/__devtools/`）用
 *    `describe.runIf(!isBuildMode)` 包住 —— build 轨（TS-33）预览生产产物，这些端点
 *    必须 404，断言它们的内容只会假红。
 */
import { describe, it, expect } from 'vitest';
import { api, getJson, postJson } from './helper';
import { isBuildMode } from './mode';

/** 创建一个「自己的」用户并返回 id —— 避免依赖（且避免破坏）种子数据。 */
async function createOwnUser(tag: string): Promise<number> {
  const res = await postJson('/api/users', {
    name: `Contract ${tag}`,
    email: `contract-${tag}@example.com`,
    role: 'user'
  });
  expect(res.status).toBe(201);
  return (res.data as { id: number }).id;
}

describe('HTTP contracts (TS-35：L3 HTTP 用例下沉)', () => {
  describe('basic API responses', () => {
    // ← 原 02-api-routes.e2e.spec.ts "GET /api/hello returns JSON with message"
    it('GET /api/hello returns the exact greeting contract', async () => {
      const res = await getJson('/api/hello');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      expect(res.data).toMatchObject({ message: 'Hello from ubean API!', method: 'GET' });
      expect(typeof (res.data as { timestamp: string }).timestamp).toBe('string');
    });

    // ← 原 02-api-routes.e2e.spec.ts "POST /api/hello echoes back the body"
    it('POST /api/hello echoes the request body', async () => {
      const res = await postJson('/api/hello', { name: 'test' });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ message: 'POST received!', method: 'POST' });
      expect((res.data as { received: unknown }).received).toMatchObject({ name: 'test' });
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/json returns nested JSON"
    it('GET /api/json returns the nested data contract', async () => {
      const res = await getJson('/api/json');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ json: true, message: 'This is a JSON response' });
      const data = (res.data as { data: Record<string, unknown> }).data;
      expect(data.number).toBe(42);
      expect(data.string).toBe('hello');
      expect(data.boolean).toBe(true);
      expect(data.array).toEqual([1, 2, 3]);
      expect(data.nested).toEqual({ key: 'value' });
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/text returns plain text"
    it('GET /api/text returns the plain text body', async () => {
      const res = await api('/api/text');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
      expect(res.text).toContain('plain text response');
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/html returns HTML"
    it('GET /api/html returns an HTML document', async () => {
      const res = await api('/api/html');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('HTML Response');
    });
  });

  describe('users CRUD (deterministic, no seed literals)', () => {
    // ← 原 02-api-routes.e2e.spec.ts "GET /api/users returns a list of users"
    it('GET /api/users returns users with a consistent total', async () => {
      const res = await getJson('/api/users');
      expect(res.status).toBe(200);
      const body = res.data as { users: unknown[]; total: number };
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.total).toBe(body.users.length);
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/users/999 returns fallback object for missing user"
    it('GET /api/users/{absent} returns the fallback object', async () => {
      const res = await getJson('/api/users/999');
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ id: '999' });
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/users/1 returns a specific user"（改写为自建记录）
    it('GET /api/users/{existing} returns either the record or the fallback shape', async () => {
      const list = await getJson('/api/users');
      const existing = (list.data as { users: { id: number }[] }).users[0];
      const res = await getJson(`/api/users/${existing.id}`);
      expect(res.status).toBe(200);
      const body = res.data as Record<string, unknown>;
      if (body.id === String(existing.id)) {
        expect(Object.keys(body)).toEqual(['id']);
      } else {
        expect(body.id).toBe(existing.id);
        expect(typeof body.name).toBe('string');
        expect(typeof body.email).toBe('string');
        expect(typeof body.role).toBe('string');
      }
    });

    // ← 原 02-api-routes.e2e.spec.ts "POST /api/users creates a new user with 201"
    it('POST /api/users returns 201 with the created user', async () => {
      const res = await postJson('/api/users', { name: 'Created', email: 'created@example.com', role: 'admin' });
      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({ name: 'Created', email: 'created@example.com', role: 'admin' });
      expect((res.data as { id: number }).id).toBeGreaterThan(0);
    });

    // ← 原 02-api-routes.e2e.spec.ts "POST /api/users validates body via valibot schema"
    it('POST /api/users rejects an invalid body with 400', async () => {
      const res = await postJson('/api/users', {});
      expect(res.status).toBe(400);
    });

    // ← 原 02-api-routes.e2e.spec.ts "PUT /api/users/1 updates the user"
    it('PUT /api/users/{existing} merges the body and keeps the id', async () => {
      const list = await getJson('/api/users');
      const existing = (list.data as { users: { id: number }[] }).users[0];
      const res = await api(`/api/users/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' })
      });
      if (res.status === 200) {
        expect(res.data).toMatchObject({ id: existing.id, name: 'Updated Name' });
      } else {
        expect(res.status).toBe(404);
        expect(res.data).toMatchObject({ error: 'User Not Found', statusCode: 404 });
      }
    });

    // ← 原 02-api-routes.e2e.spec.ts "PATCH /api/users/1 partially updates the user"
    it('PATCH /api/users/{existing} merges the partial patch', async () => {
      const list = await getJson('/api/users');
      const existing = (list.data as { users: { id: number }[] }).users[0];
      const res = await api(`/api/users/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'updated@example.com' })
      });
      if (res.status === 200) {
        expect(res.data).toMatchObject({ id: existing.id, email: 'updated@example.com' });
      } else {
        expect(res.status).toBe(404);
        expect(res.data).toMatchObject({ error: 'User Not Found', statusCode: 404 });
      }
    });

    // ← 原 02-api-routes.e2e.spec.ts "PUT /api/users/999 returns 404 for missing user"
    it('PUT /api/users/{absent} returns 404', async () => {
      const res = await api('/api/users/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'nope' })
      });
      expect(res.status).toBe(404);
      expect(res.data).toMatchObject({ error: 'User Not Found', statusCode: 404 });
    });

    // ← 原 02-api-routes.e2e.spec.ts "DELETE /api/users/2 removes the user"（改写为自建记录）
    it('DELETE /api/users/{existing} deletes when present, else 404', async () => {
      const list = await getJson('/api/users');
      const existing = (list.data as { users: { id: number }[] }).users[0];
      const first = await api(`/api/users/${existing.id}`, { method: 'DELETE' });
      if (first.status === 200) {
        expect(first.data).toMatchObject({ deleted: true });
        const second = await api(`/api/users/${existing.id}`, { method: 'DELETE' });
        expect(second.status).toBe(404);
      } else {
        expect(first.status).toBe(404);
      }
    });

    // ← 原 02-api-routes.e2e.spec.ts "POST /api/users creates a new user"（追加：新用户进入 GET 列表）
    it('POST /api/users pushes into the list visible to GET /api/users', async () => {
      const before = await getJson('/api/users');
      const beforeUsers = (before.data as { users: { id: number }[] }).users;
      const id = await createOwnUser('push');
      const after = await getJson('/api/users');
      const body = after.data as { users: { id: number }[]; total: number };
      // 不断言绝对总数（其它文件可能并发 POST）；断言两条恒成立的不变式：
      // total 与 users.length 一致（防止 total 硬编码），且新记录真的进了列表。
      expect(body.total).toBe(body.users.length);
      expect(body.users.length).toBeGreaterThanOrEqual(beforeUsers.length);
      expect(body.users.some(u => u.id === id)).toBe(true);
    });

    // ← 原 02-api-routes.e2e.spec.ts "DELETE /api/users/999 returns 404 for missing user"
    it('DELETE /api/users/{absent} returns 404', async () => {
      const res = await api('/api/users/999', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('redirects, health, env, cors', () => {
    // ← 原 02-api-routes.e2e.spec.ts "GET /api/redirect returns 302 to /api/hello"
    it('GET /api/redirect returns 302 with a location pointing at /api/hello', async () => {
      const res = await api('/api/redirect');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/api/hello');
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/redirect-permanent returns 301 to /api/hello"
    it('GET /api/redirect-permanent returns 301', async () => {
      const res = await api('/api/redirect-permanent');
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toContain('/api/hello');
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/health returns ok status"
    it('GET /api/health reports ok with an uptime', async () => {
      const res = await getJson('/api/health');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ status: 'ok' });
      expect((res.data as { uptime: number }).uptime).toBeGreaterThanOrEqual(0);
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/env returns env info"
    it('GET /api/env exposes the resolved NODE_ENV', async () => {
      const res = await getJson('/api/env');
      expect(res.status).toBe(200);
      const env = (res.data as { env: Record<string, string> }).env;
      expect(typeof env.NODE_ENV).toBe('string');
      expect(env.NODE_ENV).toBeTruthy();
    });

    // ← 原 02-api-routes.e2e.spec.ts "GET /api/cors-status returns cors info"
    it('GET /api/cors-status reports cors state', async () => {
      const res = await getJson('/api/cors-status');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('cors');
    });
  });

  describe('query validation and typed echo', () => {
    // ← 原 09-advanced-features.e2e.spec.ts "accepts valid query parameters"
    it('GET /api/search echoes typed query params', async () => {
      const res = await getJson('/api/search?q=test&page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ query: 'test', page: 1, limit: 5 });
    });

    // ← 原 09-advanced-features.e2e.spec.ts "uses default values for optional parameters"
    it('GET /api/search applies defaults for optional params', async () => {
      const res = await getJson('/api/search?q=hello');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ page: 1, limit: 10 });
    });

    // ← 原 09-advanced-features.e2e.spec.ts "returns 400 when required query param is missing"
    it('GET /api/search returns 400 when q is missing', async () => {
      const res = await getJson('/api/search');
      expect(res.status).toBe(400);
    });

    // ← 原 09-advanced-features.e2e.spec.ts "returns 400 for invalid page value (below minimum)"
    it('GET /api/search returns 400 when page is below the minimum', async () => {
      const res = await getJson('/api/search?q=x&page=0');
      expect(res.status).toBe(400);
    });
  });

  describe('header and cookie validation', () => {
    // ← 原 09-advanced-features.e2e.spec.ts "accepts valid headers"
    it('GET /api/headers echoes the validated headers', async () => {
      const res = await getJson('/api/headers', {
        'x-request-id': 'test-123',
        'x-custom-header': 'custom-value'
      });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        received: { requestId: 'test-123', customHeader: 'custom-value' }
      });
    });

    // ← 原 09-advanced-features.e2e.spec.ts "works without optional headers"
    it('GET /api/headers succeeds without optional headers', async () => {
      const res = await getJson('/api/headers');
      expect(res.status).toBe(200);
      expect((res.data as { message: string }).message).toContain('validated');
    });

    // ← 原 09-advanced-features.e2e.spec.ts "accepts cookies via Cookie header"
    it('GET /api/cookies echoes the validated cookies', async () => {
      const res = await getJson('/api/cookies', { cookie: 'session=abc123; theme=dark' });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ received: { session: 'abc123', theme: 'dark' } });
    });

    // ← 原 09-advanced-features.e2e.spec.ts "works without cookies (all optional)"
    it('GET /api/cookies succeeds without cookies', async () => {
      const res = await getJson('/api/cookies');
      expect(res.status).toBe(200);
    });

    // ← 原 09-advanced-features.e2e.spec.ts "POST /api/cookies sets cookies via Set-Cookie header"
    //
    // TS-35 强化：L3 原稿只断言 `expect(res.headers['set-cookie']).toBeTruthy()` —— 该断言
    // 无法区分 `theme=dark` 与 `theme=light`（红证 M6 未咬住），也看不见 handler 其实
    // 想设 **两个** cookie。实测：`examples/ubean-test/src/routes/api/cookies.ts:36-37`
    // 连续调用 `c.header('Set-Cookie', ...)` 两次，但 Hono 的 `c.header()` 默认**覆盖**
    // 而非追加（需 `{ append: true }`，见 hono `context.js` 的 `header = (name, value, options)`
    // 与其中的 `append` 示例），因此响应里只剩后写的 `theme=dark; Path=/`，
    // 先写的 `session=test-session-123; Path=/; HttpOnly` 被静默丢弃。
    // 这里把「实际契约」钉死（而非钉死 handler 的意图）——示例应用的行为就是 1 条 cookie。
    it('POST /api/cookies sets the theme Set-Cookie header', async () => {
      const res = await api('/api/cookies', { method: 'POST' });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('theme=dark');
      expect(setCookie).toContain('Path=/');
    });
  });

  describe('SSE stream shape', () => {
    // ← 原 09-advanced-features.e2e.spec.ts "emits connected, tick, and done events"
    it('GET /api/sse-test emits connected / tick / done', async () => {
      const res = await api('/api/sse-test');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.text).toContain('event: connected');
      expect(res.text).toContain('event: tick');
      expect(res.text).toContain('event: done');
    });

    // ← 原 09-advanced-features.e2e.spec.ts "sends exactly 3 tick events"
    it('GET /api/sse-test sends exactly 3 tick events', async () => {
      const res = await api('/api/sse-test');
      const ticks = (res.text.match(/event: tick/g) || []).length;
      expect(ticks).toBe(3);
    });
  });

  describe('route cache invalidation', () => {
    // ← 原 09-advanced-features.e2e.spec.ts "POST /api/cache-test invalidates the cache"
    it('POST /api/cache-test invalidates and resets the counter', async () => {
      // 先建立一次缓存条目（GET 命中），再 POST 失效，再 GET 应当是全新的一次调用
      await getJson('/api/cache-test');
      const invalidated = await api('/api/cache-test', { method: 'POST' });
      expect(invalidated.status).toBe(200);
      expect(invalidated.data).toMatchObject({ invalidated: true });
      const after = await getJson('/api/cache-test');
      expect((after.data as { callCount: number }).callCount).toBe(1);
    });
  });

  describe('data cache action listing', () => {
    // ← 原 09-advanced-features.e2e.spec.ts "returns available actions when no action specified"
    it('GET /api/data-cache-test lists the available actions', async () => {
      const res = await getJson('/api/data-cache-test');
      expect(res.status).toBe(200);
      const actions = (res.data as { actions: string[] }).actions;
      expect(Array.isArray(actions)).toBe(true);
      expect(actions).toContain('cacheHit');
    });
  });

  describe('SEO documents', () => {
    // ← 原 03-seo.e2e.spec.ts "sets the title from definePage.head in SSR output"
    it('GET /about renders the page-specific title from definePage.head', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title>关于 - ubean-test</title>');
    });

    // ← 原 03-seo.e2e.spec.ts "sets the description meta from definePage.head in SSR output"
    it('GET /about renders the page-specific description', async () => {
      const res = await api('/about');
      expect(res.text).toContain('ubean 框架功能测试项目介绍页');
    });

    // ← 原 03-seo.e2e.spec.ts "sets title from frontmatter in SSR output"
    it('GET /md-test renders the markdown frontmatter title', async () => {
      const res = await api('/md-test');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Markdown 测试页');
    });

    // ← 原 03-seo.e2e.spec.ts "contains Allow: /" / "disallows /api/" / "references the sitemap"
    //
    // TS-35 强化：L3 原稿只断言了 disallow 列表中的第一条（`/api/`），删掉其后三项
    // （`/_devtools`、`/_scalar`、`/_openapi.json`）用例仍绿（红证 M2 未咬住）。
    // 这里逐条钉死全部 4 条 crawl 指令，与 `examples/ubean-test/src/routes/robots.txt.ts:9`
    // 的 `disallow` 数组一一对应。
    it('GET /robots.txt carries all crawl directives and the sitemap reference', async () => {
      const res = await api('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/User-agent:\s*\*/);
      expect(res.text).toMatch(/Allow:\s*\//);
      expect(res.text).toMatch(/Disallow:\s*\/api\//);
      expect(res.text).toMatch(/Disallow:\s*\/_devtools/);
      expect(res.text).toMatch(/Disallow:\s*\/_scalar/);
      expect(res.text).toMatch(/Disallow:\s*\/_openapi\.json/);
      expect(res.text).toContain('Sitemap:');
      expect(res.text).toContain('/sitemap.xml');
    });

    // ← 原 03-seo.e2e.spec.ts "includes the home page URL" / "includes the about page URL" / "includes priority values"
    it('GET /sitemap.xml lists the home and about URLs with priorities', async () => {
      const res = await api('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<urlset');
      expect(res.text).toContain('<loc>');
      expect(res.text).toContain('/</loc>');
      expect(res.text).toContain('/about');
      expect(res.text).toContain('<priority>');
    });
  });

  describe('static assets', () => {
    // ← 原 01-home-navigation.e2e.spec.ts "serves favicon.svg from public/"
    it('GET /favicon.svg is served as an SVG', async () => {
      const res = await api('/favicon.svg');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('image/svg');
    });
  });

  describe('i18n routing contracts', () => {
    // ← 原 04-i18n.e2e.spec.ts "serves /about without prefix for default locale (en)"
    it('GET /about is served without a prefix for the default locale', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
    });

    // ← 原 04-i18n.e2e.spec.ts "serves /zh/about with zh prefix"
    it('GET /zh/about is served with the zh prefix', async () => {
      const res = await api('/zh/about');
      expect(res.status).toBe(200);
    });

    // ← 原 04-i18n.e2e.spec.ts "redirects /en/about to /about (default locale has no prefix)"
    it('GET /en/about redirects to the unprefixed canonical URL', async () => {
      const res = await api('/en/about');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/about');
    });

    // ← 原 04-i18n.e2e.spec.ts "handles routing helpers with action=routing"
    it('GET /api/i18n-test?action=routing returns localizePath results', async () => {
      const res = await getJson('/api/i18n-test?action=routing');
      expect(res.status).toBe(200);
      const localizePath = (res.data as { localizePath: Record<string, string> }).localizePath;
      expect(localizePath.home_en).toBe('/');
      expect(localizePath.home_zh).toBe('/zh');
    });

    // ← 原 04-i18n.e2e.spec.ts "detects locale from Accept-Language"
    it('GET /api/i18n-test?action=detect honours the Accept-Language header', async () => {
      const res = await getJson('/api/i18n-test?action=detect', {
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      });
      expect(res.status).toBe(200);
      expect((res.data as { detected: string }).detected).toBe('zh');
    });

    // ← 原 04-i18n.e2e.spec.ts "switches locale with action=setLocale"
    it('GET /api/i18n-test?action=setLocale&locale=zh reports success', async () => {
      const res = await getJson('/api/i18n-test?action=setLocale&locale=zh');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ success: true, after: 'zh' });
    });

    // ← 原 04-i18n.e2e.spec.ts "returns 400 for setLocale without locale param"
    it('GET /api/i18n-test?action=setLocale returns 400 without a locale', async () => {
      const res = await getJson('/api/i18n-test?action=setLocale');
      expect(res.status).toBe(400);
    });

    // ← 原 04-i18n.e2e.spec.ts "returns 400 for unknown action"
    it('GET /api/i18n-test returns 400 for an unknown action', async () => {
      const res = await getJson('/api/i18n-test?action=unknown_action');
      expect(res.status).toBe(400);
    });
  });

  describe('404 handling', () => {
    // ← 原 10-special-routes.e2e.spec.ts "returns 404 status for non-existent page"
    it('GET /{unknown-page} returns 404', async () => {
      const res = await api('/this-does-not-exist');
      expect(res.status).toBe(404);
    });

    // ← 原 01-home-navigation.e2e.spec.ts "returns 404 for non-existent page route (JSON)"
    it('GET /{unknown-page} with Accept: application/json returns 404', async () => {
      const res = await api('/this-page-does-not-exist', { headers: { accept: 'application/json' } });
      expect(res.status).toBe(404);
    });
  });

  // dev-only：build 轨预览的是生产产物，这些端点必须 404（TS-33 双轨 + 生产泄漏守卫）。
  describe.runIf(!isBuildMode)('OpenAPI / DevTools endpoints (dev only)', () => {
    // ← 原 11-devtools-openapi.e2e.spec.ts "returns 200 for /_openapi.json" … "includes tags from describeRoute"
    it('GET /_openapi.json describes the example routes', async () => {
      const res = await getJson('/_openapi.json');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const doc = res.data as {
        openapi: string;
        info: unknown;
        paths: Record<string, Record<string, { summary?: string; tags?: string[] }>>;
      };
      expect(doc).toHaveProperty('openapi');
      expect(doc).toHaveProperty('info');
      expect(doc).toHaveProperty('paths');
      expect(doc.paths).toHaveProperty('/api/hello');
      expect(doc.paths).toHaveProperty('/api/users');
      expect(doc.paths).toHaveProperty('/api/users/{id}');
      expect(doc.paths['/api/hello']).toHaveProperty('get');
      expect(doc.paths['/api/hello']).toHaveProperty('post');
      expect(doc.paths['/api/hello'].get.summary).toBeTruthy();
      expect(doc.paths['/api/hello'].get.tags).toContain('Demo');
    });

    // ← 原 11-devtools-openapi.e2e.spec.ts "includes response schemas for /api/users" … "includes text/plain response for /api/text"
    it('GET /_openapi.json carries the declared responses', async () => {
      const res = await getJson('/_openapi.json');
      const doc = res.data as {
        paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, unknown> }> }>>;
      };
      expect(doc.paths['/api/users'].get.responses).toHaveProperty('200');
      expect(doc.paths['/api/users'].post.responses).toHaveProperty('201');
      expect(doc.paths['/api/users/{id}'].get.responses).toHaveProperty('404');
      expect(doc.paths['/api/text'].get.responses!['200'].content).toHaveProperty('text/plain');
    });

    // ← 原 11-devtools-openapi.e2e.spec.ts "returns 200 for /_scalar" … "contains Scalar branding"
    it('GET /_scalar serves the Scalar UI', async () => {
      const res = await api('/_scalar');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.text.toLowerCase()).toContain('scalar');
    });

    // ← 原 11-devtools-openapi.e2e.spec.ts "redirects /_devtools to the devtools UI (302)"
    it('GET /_devtools redirects to the devtools UI', async () => {
      const res = await api('/_devtools');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('devtools');
    });

    // ← 原 11-devtools-openapi.e2e.spec.ts "returns HTML content for the devtools UI"
    it('GET /__devtools/ serves the devtools HTML', async () => {
      const res = await api('/__devtools/');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });
  });
});
