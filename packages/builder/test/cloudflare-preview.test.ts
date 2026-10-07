/**
 * Cloudflare 预览 runner（RM-V26）。
 *
 * 两层证据，**故意分开**：
 *
 * 1. **接线层**（永远跑）：注入假 miniflare，断言「worker 缺失 / 依赖缺失 / 成功」三种结果、
 *    以及请求如何被派发进去（实测这个版本的 `dispatchFetch` 不接受 `Request` 实例，必须拆成
 *    url + init，POST 体要 `arrayBuffer()` 带过去）—— 这层不依赖任何可选依赖。
 * 2. **真机层**（默认**真实执行**）：`miniflare` 自 TS-04 起已在根 devDependencies 里，CI 安装后
 *    这两条用例真的在 workerd 里起产物、真的 fetch。只有显式 `UBEAN_SKIP_MINIFLARE=1` 才跳过，
 *    且跳过时会打印可见警告——不允许「依赖缺失就静默绿」。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCloudflarePreviewRunner,
  defaultLoadMiniflare,
  findUnsupportedNodeImports,
  MINIFLARE_INSTALL_HINT,
  readCompatibilityDate
} from '../src/vite/cloudflare-preview';
import type { MiniflareConstructorLike, MiniflareInstanceLike } from '../src/vite/cloudflare-preview';

let root: string;
let workerPath: string;

/**
 * 显式 opt-out 的可见警告。
 *
 * TS-04 之前这两条用例是「依赖不在场就静默跳过」——那让「真机从未被验证过」看起来像绿灯。
 * 现在只有 `UBEAN_SKIP_MINIFLARE=1` 才能跳过，且必须把这件事喊出来。
 */
function warnMiniflareSkipped(testName: string): void {
  console.warn(
    `\n[cloudflare-preview] ⚠️  跳过真机验收：「${testName}」\n` +
      '    原因：显式设置了 UBEAN_SKIP_MINIFLARE=1。\n' +
      '    该跳过是人为的，不代表产物已验证——CI 不设置此变量，因此 CI 中这两条真实执行。\n'
  );
}

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

/**
 * 真机验收：**构建出来的 cloudflare 产物**能在 workerd 里启动并服务请求（缺陷 D 的回归判据）。
 *
 * `miniflare` 已在根 devDependencies 里（TS-04），CI 安装后这两条**真实执行**。
 * 唯一允许跳过的方式是显式设置 `UBEAN_SKIP_MINIFLARE=1`——跳过时会打印可见警告，
 * 不允许「依赖缺失就静默绿」。
 */
describe('真实 miniflare：cloudflare 产物', () => {
  it('产物在 workerd 里启动，SSR / API / 404 都正常', async ctx => {
    if (process.env.UBEAN_SKIP_MINIFLARE === '1') {
      warnMiniflareSkipped('cloudflare 产物在 workerd 里启动');
      ctx.skip('UBEAN_SKIP_MINIFLARE=1：显式跳过真机验收');
      return;
    }

    const loadMiniflare = await defaultLoadMiniflare();
    // 走到这里说明没有显式 opt-out，依赖缺失就是**真失败**：让安装问题暴露出来
    expect(loadMiniflare, `miniflare 应已在根 devDependencies 中。${MINIFLARE_INSTALL_HINT}`).not.toBeNull();
    if (!loadMiniflare) return;

    const { spawnSync } = await import('node:child_process');
    const repoRoot = resolve(import.meta.dirname, '../../..');
    // 用 builder 的最小 fixture 而不是示例项目：示例里有一条测试路由 import `ubean/build`，
    // 会把整条构建工具链（@vue/compiler-sfc → 可选依赖 velocityjs）拉进 worker 产物 —— 那是
    // 示例自身的用法问题，会淹没这里要验证的东西（产物能否在 workerd 里跑起来）。
    const fixture = join(repoRoot, 'packages/builder/test/fixtures/build-project');
    const outDir = '.temp-cf-preview';
    const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
    if (!existsSync(cliEntry)) {
      throw new Error(`CLI 未构建：${cliEntry} 不存在。测试依赖已构建的 dist，请先跑 pnpm build。`);
    }

    const build = spawnSync(process.execPath, [cliEntry, 'build', '--preset', 'cloudflare', '--outDir', outDir], {
      cwd: fixture,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe'
    });
    expect(build.status, String(build.stderr).slice(-800)).toBe(0);

    const builtWorker = join(fixture, outDir, 'server', 'worker.mjs');
    const result = await createCloudflarePreviewRunner({
      workerPath: builtWorker,
      loadMiniflare: async () => loadMiniflare
    });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;

    try {
      const health = await result.runner.fetch(new Request('http://localhost/_health'));
      expect(health.status).toBe(200);

      // SSR 渲染（这条最要紧：它证明 Vue SSR + i18n 的 ALS 在 worker 里可用）
      const home = await result.runner.fetch(new Request('http://localhost/'));
      expect(home.status).toBe(200);
      expect(home.headers.get('content-type')).toContain('text/html');
      expect(await home.text()).toContain('<div id="app"');

      const api = await result.runner.fetch(new Request('http://localhost/hello'));
      expect(api.status).toBe(200);
      expect(api.headers.get('content-type')).toContain('application/json');
    } finally {
      rmSync(join(fixture, outDir), { recursive: true, force: true });
    }
  }, 300_000);
});

describe('真实 miniflare', () => {
  it('worker 产物在 miniflare 里真实响应', async ctx => {
    if (process.env.UBEAN_SKIP_MINIFLARE === '1') {
      warnMiniflareSkipped('worker 产物在 miniflare 里真实响应');
      ctx.skip('UBEAN_SKIP_MINIFLARE=1：显式跳过真机验收');
      return;
    }

    const loadMiniflare = await defaultLoadMiniflare();
    expect(loadMiniflare, `miniflare 应已在根 devDependencies 中。${MINIFLARE_INSTALL_HINT}`).not.toBeNull();
    if (!loadMiniflare) return;

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
