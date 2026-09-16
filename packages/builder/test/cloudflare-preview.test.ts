/**
 * Cloudflare 预览 runner（RM-V26）。
 *
 * 两层证据，**故意分开**：
 *
 * 1. **接线层**（永远跑）：注入假 miniflare，断言「worker 缺失 / 依赖缺失 / 成功」三种结果、
 *    以及请求如何被派发进去（实测这个版本的 `dispatchFetch` 不接受 `Request` 实例，必须拆成
 *    url + init，POST 体要 `arrayBuffer()` 带过去）—— 这层不依赖任何可选依赖。
 * 2. **真机层**（miniflare 在场时才跑）：`miniflare` 是可选 peer，CI 里通常不在；装了才跑，
 *    没装则跳过并说明原因。不假装验证过。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCloudflarePreviewRunner,
  defaultLoadMiniflare,
  findUnsupportedNodeImports,
  readCompatibilityDate
} from '../src/vite/cloudflare-preview';
import type { MiniflareConstructorLike, MiniflareInstanceLike } from '../src/vite/cloudflare-preview';

let root: string;
let workerPath: string;

/** 记录构造参数与派发内容的假 miniflare。 */
function createFakeMiniflare() {
  const calls: { options: Record<string, unknown>; dispatches: unknown[]; disposed: number } = {
    options: {},
    dispatches: [],
    disposed: 0
  };
  class FakeMiniflare implements MiniflareInstanceLike {
    ready = Promise.resolve();
    constructor(options: Record<string, unknown>) {
      calls.options = options;
    }
    async dispatchFetch(input: string, init?: { method?: string; body?: BodyInit }): Promise<Response> {
      calls.dispatches.push({ input, init });
      // runner 用 `arrayBuffer()` 带体（实测 url+init 形态能保留 POST 体），这里按字节解回字符串
      const raw = init?.body;
      const body =
        typeof raw === 'string'
          ? raw
          : raw instanceof ArrayBuffer
            ? new TextDecoder().decode(raw)
            : raw instanceof Uint8Array
              ? new TextDecoder().decode(raw)
              : '(none)';
      return new Response(`worker:${init?.method ?? 'GET'}:${body}`, { headers: { 'content-type': 'text/plain' } });
    }
    async dispose(): Promise<void> {
      calls.disposed += 1;
    }
  }
  return { ctor: FakeMiniflare as unknown as MiniflareConstructorLike, calls };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ubean-cf-preview-'));
  workerPath = join(root, 'dist', 'server', 'worker.mjs');
  mkdirSync(join(root, 'dist', 'server'), { recursive: true });
  writeFileSync(
    workerPath,
    'export default { async fetch(req) { return new Response("cf:" + new URL(req.url).pathname); } };\n'
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createCloudflarePreviewRunner（接线层）', () => {
  it('worker 产物缺失 → worker-missing，且不尝试加载依赖', async () => {
    let loaderCalled = false;
    const result = await createCloudflarePreviewRunner({
      workerPath: join(root, 'nope', 'worker.mjs'),
      loadMiniflare: async () => {
        loaderCalled = true;
        return null;
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('worker-missing');
    expect(loaderCalled, '产物缺失时不该去加载 miniflare').toBe(false);
  });

  it('依赖缺失 → miniflare-not-installed，提示里含可执行步骤', async () => {
    const result = await createCloudflarePreviewRunner({ workerPath, loadMiniflare: async () => null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('miniflare-not-installed');
      expect(result.message).toContain('pnpm add -D miniflare');
      expect(result.message).toContain('wrangler dev');
    }
  });

  it('成功时把 worker 作为 ESModule 挂载，并按 url + init 派发请求（POST 体保留）', async () => {
    const { ctor, calls } = createFakeMiniflare();
    const result = await createCloudflarePreviewRunner({
      workerPath,
      compatibilityDate: '2025-01-01',
      loadMiniflare: async () => ctor
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const modules = calls.options.modules as Array<{ type: string; path: string }>;
    expect(modules[0]?.type).toBe('ESModule');
    // 路径是 cwd 相对形态（miniflare 的 readFileSync 按 cwd 读，见 cloudflare-preview.ts 的注释）
    expect(resolve(process.cwd(), modules[0]!.path)).toBe(workerPath);
    expect(calls.options.compatibilityDate).toBe('2025-01-01');

    const getRes = await result.runner.fetch(new Request('http://localhost/hello'));
    expect(await getRes.text()).toBe('worker:GET:(none)');

    const postRes = await result.runner.fetch(
      new Request('http://localhost/api/echo', { method: 'POST', body: 'payload' })
    );
    expect(await postRes.text()).toBe('worker:POST:payload');
    // 这个版本的 `dispatchFetch` 不吃 Request 实例（实测报 Failed to parse URL），必须是 url 字符串
    expect(calls.dispatches.map(d => (d as { input: string }).input)).toEqual([
      'http://localhost/hello',
      'http://localhost/api/echo'
    ]);

    await result.runner.dispose();
    expect(calls.disposed).toBe(1);
  });
});

describe('readCompatibilityDate', () => {
  it('从 wrangler.toml 取兼容性日期，缺失或损坏时返回 undefined', () => {
    const tomlPath = join(root, 'wrangler.toml');
    writeFileSync(tomlPath, 'name = "ubean-app"\ncompatibility_date = "2024-01-01"\n');
    expect(readCompatibilityDate(tomlPath)).toBe('2024-01-01');
    expect(readCompatibilityDate(join(root, 'missing.toml'))).toBeUndefined();

    writeFileSync(tomlPath, 'not a toml = = =');
    expect(readCompatibilityDate(tomlPath)).toBeUndefined();
  });
});

describe('findUnsupportedNodeImports（构建期审计）', () => {
  it('三种导入形态都会被点名，且去重、排序', () => {
    const dir = join(root, 'audit');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(
      join(dir, 'a.mjs'),
      [
        "import { readFileSync } from 'node:fs';",
        "export { x } from 'node:fs/promises';",
        "const path = await import('node:path');",
        'const ok = 1;'
      ].join('\n')
    );
    writeFileSync(join(dir, 'nested', 'b.mjs'), "import os from 'node:os';");

    // node:path 不在 workerd 的不可用清单里（nodejs_compat 支持），因此只应当出现 fs 系列 + os
    expect(findUnsupportedNodeImports(dir)).toEqual(['node:fs', 'node:fs/promises', 'node:os']);
  });

  it('干净产物返回空数组（不误报）', () => {
    const dir = join(root, 'clean');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'entry.mjs'), "import { Hono } from 'hono';\nexport default new Hono();\n");
    expect(findUnsupportedNodeImports(dir)).toEqual([]);
  });

  it('目录不存在时返回空数组（不抛错）', () => {
    expect(findUnsupportedNodeImports(join(root, 'nope'))).toEqual([]);
  });
});

describe('真实 miniflare（依赖在场时才跑）', () => {
  it('worker 产物在 miniflare 里真实响应', async ctx => {
    const loadMiniflare = await defaultLoadMiniflare();
    if (!loadMiniflare) {
      ctx.skip(`miniflare 未安装：pnpm add -D miniflare 后本条才会执行（${root}）`);
      return;
    }

    const result = await createCloudflarePreviewRunner({ workerPath, loadMiniflare: async () => loadMiniflare });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      const res = await result.runner.fetch(new Request('http://localhost/from-miniflare'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('cf:/from-miniflare');
    } finally {
      await result.runner.dispose();
    }
  }, 120_000);
});
