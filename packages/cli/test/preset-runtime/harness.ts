/**
 * TS-12：preset 行为矩阵（对齐 Nitro `testNitro()` 模式）
 *
 * 为什么需要它：`build-contracts.test.ts` 只断言「产物存在」，`example-smoke.test.ts` 只跑 node
 * 一种预设。于是「产物存在 ≠ 可用」这一类缺陷没有任何一层守着 —— 本轮就踩到一次：产物齐全、构建
 * 退出 0，但**每个短路响应都变成 500**（见 `packages/app/test/middleware-short-circuit.test.ts`）。
 * 本矩阵把**同一套行为断言**喂给每个 preset 的**真实产物**，平台差异在断言内用 `ctx` 分支表达
 * （照 Nitro `test/tests.ts:750`），而不是整条 skip；确需跳过的用 `it.skipIf` 并写明原因。
 *
 * 执行形态（`ctx.transport`）：
 * - `in-process`：`import(server/entry.mjs)` → 调 handler。node/bun/deno 共用
 *   `getPresetBuildConfig()` 的 `entryType: 'node'` 分支（`packages/builder/src/production.ts`
 *   三个 case 逐字相同），standard/vercel/netlify/aws/azure 共用 `'fetch'` 分支。
 *   在 Node 里直接执行产物是**保真度妥协**：它验证同一份 handler 图与请求语义，不验证各平台运行时
 *   的模块可用性 —— 后者由 TS-04 的 `findUnsupportedNodeImports()` 报告（ADR-0013）。
 * - `workerd`：cloudflare 走 TS-04 的 `createCloudflarePreviewRunner()`，真正在 workerd 里跑。
 *
 * 为什么每个 preset 一个临时 outDir：`examples/ubean-test` 的既有教训是「共用产物目录 ⇒ 单跑绿、
 * 全量跑红」。这里每格构建到 fixture 内自己的 `.temp-build-<preset>`，跑完全部删除。
 *
 * 与 Nitro 的一处刻意差异：Nitro 把非 cloudflare 的产物放 `tmpdir()`，本仓**必须留在仓内**
 * —— 产物 external 了 `hono`/`vue`/`@ubean/*`，放进 `tmpdir()` 后 Node 解析不到这些裸 specifier
 * （祖先目录没有 `node_modules`），`import()` 直接 ERR_MODULE_NOT_FOUND。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* -------------------------------------------------------------------------- */
/* 矩阵定义                                                                    */
/* -------------------------------------------------------------------------- */

export type PresetName = 'node' | 'bun' | 'deno' | 'standard' | 'cloudflare' | 'vercel' | 'netlify' | 'aws' | 'azure';

/** 产物入口形态，取自 `getPresetBuildConfig()` 的 `entryType`。 */
export type PresetEntryType = 'node' | 'fetch' | 'worker';

export type PresetTransport = 'in-process' | 'workerd';

/**
 * 行为断言的上下文（对齐 Nitro `tests.ts:29-32` 的类型化 `ctx`）。
 *
 * `is*` 系列是平台能力标记，供断言内分支使用；`cacheBackend` / `inProcessCron` 是本仓特有的两条
 * 接线契约（TS-12 验收③）。
 */
export interface PresetContext {
  preset: PresetName;
  mode: 'fullstack';
  isDev: boolean;
  entryType: PresetEntryType;
  transport: PresetTransport;
  isWorker: boolean;
  isLambda: boolean;
  isIsolated: boolean;
  isServerless: boolean;
  isWindows: boolean;
  /** 相对 outDir 的包装产物（`server/server.mjs` / `server/handler.mjs` / `server/worker.mjs`） */
  wrapper: string;
  /** 期望的缓存后端：`fs` 落盘，`memory` 进程内存（`resolveProductionCacheStore()`） */
  cacheBackend: 'fs' | 'memory';
  /** 期望 server entry 里接线「进程内 cron 调度器」（`enableInProcessCron`） */
  inProcessCron: boolean;
}

const isWindows = process.platform === 'win32';

/** 平台标记的公共默认值：整套矩阵都跑 fullstack 生产产物。 */
const base = {
  mode: 'fullstack' as const,
  isDev: false,
  isWindows
};

/**
 * 9 个 preset 全量矩阵。
 *
 * `isServerless` / `cacheBackend` / `inProcessCron` 与
 * `packages/preset/src/cache-default.ts` 的 `EPHEMERAL_CACHE_PRESETS` 一一对应：
 * 只有 serverless/edge 落 `memory` 且不装进程内调度器。
 *
 * `standard` 是**刻意保留的例外**：它不在 `EPHEMERAL_CACHE_PRESETS` 里，于是拿到 `fs` 缓存与
 * 进程内调度器 —— 尽管它是 `entryType: 'fetch'`。这一格把该行为固定下来，避免它无声漂移。
 */
export const PRESET_MATRIX: PresetContext[] = [
  {
    ...base,
    preset: 'node',
    entryType: 'node',
    transport: 'in-process',
    isWorker: false,
    isLambda: false,
    isIsolated: false,
    isServerless: false,
    wrapper: 'server/server.mjs',
    cacheBackend: 'fs',
    inProcessCron: true
  },
  {
    ...base,
    preset: 'bun',
    entryType: 'node',
    transport: 'in-process',
    isWorker: false,
    isLambda: false,
    isIsolated: false,
    isServerless: false,
    wrapper: 'server/server.mjs',
    cacheBackend: 'fs',
    inProcessCron: true
  },
  {
    ...base,
    preset: 'deno',
    entryType: 'node',
    transport: 'in-process',
    isWorker: false,
    isLambda: false,
    isIsolated: false,
    isServerless: false,
    wrapper: 'server/server.mjs',
    cacheBackend: 'fs',
    inProcessCron: true
  },
  {
    ...base,
    preset: 'standard',
    entryType: 'fetch',
    transport: 'in-process',
    isWorker: false,
    isLambda: false,
    isIsolated: false,
    isServerless: false,
    wrapper: 'server/handler.mjs',
    cacheBackend: 'fs',
    inProcessCron: true
  },
  {
    ...base,
    preset: 'cloudflare',
    entryType: 'worker',
    transport: 'workerd',
    isWorker: true,
    isLambda: false,
    isIsolated: true,
    isServerless: true,
    wrapper: 'server/worker.mjs',
    cacheBackend: 'memory',
    inProcessCron: false
  },
  {
    ...base,
    preset: 'vercel',
    entryType: 'fetch',
    transport: 'in-process',
    isWorker: false,
    isLambda: true,
    isIsolated: true,
    isServerless: true,
    wrapper: 'server/handler.mjs',
    cacheBackend: 'memory',
    inProcessCron: false
  },
  {
    ...base,
    preset: 'netlify',
    entryType: 'fetch',
    transport: 'in-process',
    isWorker: false,
    isLambda: true,
    isIsolated: true,
    isServerless: true,
    wrapper: 'server/handler.mjs',
    cacheBackend: 'memory',
    inProcessCron: false
  },
  {
    ...base,
    preset: 'aws',
    entryType: 'fetch',
    transport: 'in-process',
    isWorker: false,
    isLambda: true,
    isIsolated: true,
    isServerless: true,
    wrapper: 'server/handler.mjs',
    cacheBackend: 'memory',
    inProcessCron: false
  },
  {
    ...base,
    preset: 'azure',
    entryType: 'fetch',
    transport: 'in-process',
    isWorker: false,
    isLambda: true,
    isIsolated: true,
    isServerless: true,
    wrapper: 'server/handler.mjs',
    cacheBackend: 'memory',
    inProcessCron: false
  }
];

/* -------------------------------------------------------------------------- */
/* 路径与构建                                                                  */
/* -------------------------------------------------------------------------- */

// 本文件在 packages/cli/test/preset-runtime/，比 build-contracts.test.ts 多一层目录。
export const repoRoot = resolve(import.meta.dirname, '../../../..');
export const fixtureDir = join(repoRoot, 'packages/cli/test/fixtures/preset-runtime-app');
export const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/**
 * fixture 声明的缓存目录。fs 后端的 preset 会把条目写在这里（相对**测试进程 cwd**，即
 * `packages/cli`），serverless/edge 用内存则完全不落盘 —— 这正是验收③的可观测通道。
 */
export const cacheDir = join(repoRoot, 'packages/cli', '.ubean/preset-runtime-cache');

export const outDirFor = (ctx: PresetContext): string => join(fixtureDir, `.temp-build-${ctx.preset}`);
export const entryPathFor = (ctx: PresetContext): string => join(outDirFor(ctx), 'server/entry.mjs');
export const wrapperPathFor = (ctx: PresetContext): string => join(outDirFor(ctx), ctx.wrapper);

/** 递归统计缓存目录下的文件数（目录本身存在但为空也算 0）。 */
export function countCacheFiles(): number {
  if (!existsSync(cacheDir)) return 0;
  let n = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else n += 1;
    }
  };
  walk(cacheDir);
  return n;
}

/** 用一个 preset 把 fixture 构建到它自己的临时 outDir。 */
export async function buildPreset(ctx: PresetContext, timeoutMs = 300_000): Promise<void> {
  rmSync(outDirFor(ctx), { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [cliEntry, 'build', '--preset', ctx.preset, '--outDir', `.temp-build-${ctx.preset}`],
      { cwd: fixtureDir, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`build(${ctx.preset}) timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`build(${ctx.preset}) exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

export function cleanupPreset(ctx: PresetContext): void {
  rmSync(outDirFor(ctx), { recursive: true, force: true });
}

/* -------------------------------------------------------------------------- */
/* handler 加载                                                                */
/* -------------------------------------------------------------------------- */

export interface PresetHandler {
  fetch: (request: Request) => Promise<Response>;
  dispose: () => Promise<void>;
}

export type GetPresetHandler = (ctx: PresetContext) => Promise<PresetHandler>;

/**
 * 把产物加载成可直接调用的 fetch。
 *
 * 三种 `entryType` 的默认导出**形状不同**（`packages/builder/src/production.ts`）：
 * - `node`  → `export default createFetchHandler`：工厂，调用后得到 fetch
 * - `fetch` → `export default async function fetch(req, ctx)`：它**就是** fetch
 * - `worker`→ `export default { fetch }`：由 workerd 装载
 */
export async function getPresetHandler(ctx: PresetContext): Promise<PresetHandler> {
  if (ctx.transport === 'workerd') {
    const { createCloudflarePreviewRunner } = await import('@ubean/build/vite');
    const result = await createCloudflarePreviewRunner({ workerPath: wrapperPathFor(ctx) });
    if (!result.ok) {
      throw new Error(`cloudflare runner failed [${result.reason}]: ${result.message}`);
    }
    return { fetch: request => result.runner.fetch(request), dispose: () => result.runner.dispose() };
  }

  if (ctx.entryType === 'fetch') {
    // 直接加载**平台包装** `handler.mjs`（`export default async function fetch(req, ctx)`），
    // 验证真实的 edge 入口形状，而不是绕过它去调 entry.mjs 的工厂。
    const wrapper = (await import(pathToFileURL(wrapperPathFor(ctx)).href)) as {
      default: (request: Request, serverContext?: unknown) => Promise<Response>;
    };
    // 同一份 `entry.mjs` 模块实例（包装文件的 `./entry.mjs` 与本路径解析到同一 file URL）：
    // 取它的 `close()` 停掉 `standard` 这类 fetch 形态但**仍装进程内调度器**的 preset 的 interval。
    const entry = (await import(pathToFileURL(entryPathFor(ctx)).href)) as { close?: () => Promise<void> };
    return {
      fetch: request => wrapper.default(request, {}),
      dispose: async () => {
        await entry.close?.();
      }
    };
  }

  // `entryType: 'node'`：entry.mjs 的 default 是 createFetchHandler 工厂。
  // 刻意**不**加载 `server.mjs` —— 那是真的会 `createServer()` 起 HTTP 服务的包装。
  const mod = (await import(pathToFileURL(entryPathFor(ctx)).href)) as {
    default: () => Promise<(request: Request) => Promise<Response>>;
    close?: () => Promise<void>;
  };
  const call = await mod.default();

  return {
    fetch: request => call(request),
    dispose: async () => {
      await mod.close?.();
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 共享断言族                                                                  */
/* -------------------------------------------------------------------------- */

const ORIGIN = 'http://localhost';

/**
 * 13 步全序（与 TS-07 同一张表）。⑦ cacheStore 只在真的装了 store 时登记 —— 也就是只有
 * `cacheBackend === 'fs'` 的 preset 有它。这条差异**在断言内分支**，不整条 skip（照 Nitro
 * `tests.ts:750`）。
 */
const FULL_CHAIN = [
  'handle',
  'requestId',
  'actionContext',
  'securityHeaders',
  'csrf',
  'dataCache',
  'cacheStore',
  'i18n',
  'routeRules',
  'routeCache',
  'websocket',
  'lifecycle',
  'healthEndpoint'
];

export type AdditionalTests = (ctx: PresetContext, getHandler: () => PresetHandler) => void;

/**
 * 把一个 preset 的产物挂上**同一套**行为断言族。
 *
 * `getHandler` 由调用方注入（本仓是 `getPresetHandler`），`additionalTests` 用于平台特有的补充
 * 断言 —— 对齐 Nitro `testNitro(ctx, getHandler, additionalTests?)`。
 */
export function testPreset(
  ctx: PresetContext,
  buildHandler: GetPresetHandler,
  additionalTests?: AdditionalTests
): void {
  describe(`TS-12 preset 行为矩阵 · ${ctx.preset} (${ctx.transport})`, () => {
    let handler: PresetHandler;

    beforeAll(async () => {
      await buildPreset(ctx);
      handler = await buildHandler(ctx);
    }, 360_000);

    afterAll(async () => {
      await handler?.dispose?.();
      cleanupPreset(ctx);
      rmSync(cacheDir, { recursive: true, force: true });
    });

    const get = (): PresetHandler => handler;
    const send = (path: string, init?: RequestInit): Promise<Response> =>
      handler.fetch(new Request(ORIGIN + path, init ?? {}));

    it('① /_health → 200 JSON，且 13 步链按 preset 分支完整就位', async () => {
      const res = await send('/_health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; mwOrder: string[] };

      expect(body.status).toBe('ok');
      // 差异分支：serverless/edge 落 memory，于是根本没有 fs store 可初始化，⑦ 整段缺席。
      const expected = ctx.cacheBackend === 'fs' ? FULL_CHAIN : FULL_CHAIN.filter(step => step !== 'cacheStore');
      expect(body.mwOrder).toEqual(expected);
    });

    it('② GET /api/hello → 200 JSON（API 层可用）', async () => {
      const res = await send('/api/hello');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ ok: true, route: 'hello' });
    });

    it('③ GET / → 200 HTML 且渲染出 fixture 内容（SSR 层可用）', async () => {
      const res = await send('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(await res.text()).toContain('preset runtime fixture');
    });

    it('④ 404 分支：导航请求给 HTML 并选中 NotFound 页，API 路径给 JSON', async () => {
      const nav = await send('/nope-not-here', { headers: { accept: 'text/html' } });
      expect(nav.status).toBe(404);
      expect(nav.headers.get('content-type')).toContain('text/html');
      // 框架的 404 页走**客户端兜底**：SSR 只出外壳 + `__UBEAN_PAGE_DATA__`
      // （`{"component":"NotFound","layout":false}`），正文由浏览器水合后渲染。
      // 所以这里断言「选中的是 NotFound 页」，不断言服务端正文（那会是假断言）。
      const navHtml = await nav.text();
      expect(navHtml).toContain('__UBEAN_PAGE_DATA__');
      expect(navHtml).toContain('NotFound');

      const api = await send('/api/not-here');
      expect(api.status).toBe(404);
      expect(api.headers.get('content-type')).toContain('application/json');
      expect(await api.json()).toMatchObject({ error: 'Not Found', method: 'GET' });
    });

    it('⑤ 安全头：所有响应带 nosniff + CSP', async () => {
      const res = await send('/api/hello');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    });

    it('⑥ routeRules 生效：响应头注入 + 307 重定向 + 缓存命中（X-Cache: HIT）', async () => {
      // 响应头注入
      const hello = await send('/api/hello');
      expect(hello.headers.get('x-ubean-route-rule')).toBe('applied');

      // redirect：实测状态码是 307（不是 302）
      const redirected = await send('/redirect-me', { redirect: 'manual' });
      expect(redirected.status).toBe(307);
      expect(redirected.headers.get('location')).toContain('/api/hello');

      // cache：第一次 MISS（处理器执行）→ 第二次 HIT（处理器不再执行）
      const first = await send('/cached');
      expect(first.status).toBe(200);
      expect(first.headers.get('x-cache')).toBeNull();
      expect(await first.json()).toEqual({ ok: true, route: 'cached', hits: 1 });

      const second = await send('/cached');
      expect(second.status).toBe(200);
      expect(second.headers.get('x-cache')).toBe('HIT');
      expect(await second.json()).toEqual({ ok: true, route: 'cached', hits: 1 });
    });

    it.skipIf(ctx.transport === 'workerd')(
      '⑦ 缓存后端接线（验收③）：fs preset 真落盘，serverless/edge 完全不落盘',
      async () => {
        // 承接 ⑥：⑥ 已经跑过一次 MISS → SET，这里只观测副作用。
        //
        // workerd 单元格跳过：workerd 有自己隔离的虚拟文件系统，宿主进程的缓存目录无论如何都
        // 是 0 个文件 —— 这条断言在 workerd 上**永真**，也就是假绿（实测：把 isEphemeralCachePreset
        // 变异成恒 false 后，cloudflare 这一格仍然通过）。cloudflare 的 serverless 归属改由 ①
        // 的「⑦ cacheStore 步骤缺席」守着，那条断言在同一变异下实测转红。
        if (ctx.cacheBackend === 'fs') expect(countCacheFiles()).toBeGreaterThan(0);
        else expect(countCacheFiles()).toBe(0);
      }
    );

    it('⑧ CSRF：GET 种下 cookie；POST 缺 token 403，带 token 200', async () => {
      const seed = await send('/api/hello');
      const setCookie = seed.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('ubean_csrf=');
      const cookie = setCookie.split(';')[0];
      const token = cookie.slice(cookie.indexOf('=') + 1);

      const rejected = await send('/api/echo', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}'
      });
      expect(rejected.status).toBe(403);

      const accepted = await send('/api/echo', {
        method: 'POST',
        headers: { cookie, 'x-csrf-token': token, 'content-type': 'application/json' },
        body: '{}'
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual({ ok: true, route: 'echo' });
    });

    it('⑨ i18n：前缀路由可达；根路径按 Accept-Language 302 重定向', async () => {
      const zh = await send('/zh/');
      expect(zh.status).toBe(200);
      expect(zh.headers.get('content-language')).toBe('zh');

      // `redirect: 'manual'` 是必需的：workerd 的 `dispatchFetch` 默认跟随 302，会把这一层
      // 断言吃成 200（TS-12 实测踩到，已在 `cloudflare-preview.ts` 转发 request.redirect）。
      const redirect = await send('/', {
        headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
        redirect: 'manual'
      });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('location')).toContain('/zh');
    });

    additionalTests?.(ctx, get);
  });
}
