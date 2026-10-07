/**
 * Test helper for integration tests.
 * Provides utilities for making HTTP requests to the dev server
 * and importing ubean functions directly for function-level testing.
 */

/**
 * 解析 dev server 地址。
 *
 * 这里**不设兜底端口**：真实端口由 `test/global-setup.ts` 决定（当前 `:3999`），
 * 写死一个猜测值只会让 IDE 单跑时连到错误的端口、然后以 ECONNREFUSED 失败——
 * 那是最难排查的一类噪声。缺 env 时直接抛错，让失败原因在第一行就可见。
 *
 * @throws 当 `UBEAN_TEST_BASE_URL` 未设置时
 */
export function getBaseUrl(): string {
  const baseUrl = process.env.UBEAN_TEST_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      'UBEAN_TEST_BASE_URL 未设置：本测试文件需要真实运行的 dev server。\n' +
        '  · 正常方式：在 examples/ubean-test 下跑 `pnpm test`，\n' +
        '    test/global-setup.ts 会自动在 :3999 启动 dev server 并设置该变量；\n' +
        '  · 手动方式：先启动 dev server，再设 UBEAN_TEST_BASE_URL=http://localhost:3999。\n' +
        '（此文件不再静默 skip——绿灯的含义必须是「真的验证过」。）'
    );
  }
  return baseUrl;
}

/**
 * 文件级前置断言：声明「本文件依赖真实 dev server」。
 *
 * 在 `beforeAll` 里调用。缺 env 时立刻以**统一的明确错误**失败，让全部依赖
 * dev server 的文件语义一致。
 *
 * 刻意不使用 `describe.skipIf` / `ctx.skip()`：静默跳过会让
 * 「global-setup 因故没跑」伪装成绿灯，腐化的恰好是那几个文件。
 */
export function requireDevServer(): void {
  getBaseUrl();
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
export async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
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
export async function postForm(
  path: string,
  formData: Record<string, string>,
  headers?: Record<string, string>
): Promise<ApiResult> {
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
