/**
 * dev 热重载与「`vite dev` ≡ `ubean dev`」的端到端回归（RM-V13 / RM-V14）。
 *
 * 两个用例都走**公共入口**（子进程 + 纯 HTTP），因为这类缺陷只在真实项目里出现：
 *
 * 1. **协调器订阅必须真的送达**。RM-V13 首版把 dev-scan 协调器的注册表放在模块级 `WeakMap`，
 *    而真实项目的 `vite.config.ts` 由 Vite 自己打包加载 —— 其中的插件实例与 CLI 从
 *    node_modules import 的那份是**两个模块实例**，CLI 注册的「扫描后重建 app」回调静默落进
 *    另一个注册表：服务端改动完全不生效且没有任何报错。所有 `configFile: false` + 进程内
 *    import 插件的测试都照常通过（它们共享同一个模块实例）。
 * 2. **裸 `vite dev` 与 CLI 等价**（RM-V14 / RM-V31）。请求路由与宿主 app 归插件后，`vp dev`
 *    应当单独就能服务页面 SSR / API / 内置 `_` 路由 / 404，且改文件同样生效 —— 这条路径此前连
 *    .vue 都编译不了（`ubeanPlugin()` 当时不含 `@vitejs/plugin-vue`，那一步由 CLI 代劳）。
 *
 * 两个 server 在同一个测试文件里**顺序**启动：它们会改写同一个探针字面量，并行跑必然互相干扰
 * （vitest 默认按文件并行，因此这里不能拆成两个文件）。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// TS-37：端口 / 进程 / 就绪探测收敛到共用 harness（与 L3 的职责边界见该文件头注释）
import { findFreePort, resolveBaseUrl, stopChild } from './helpers/cli-harness';
import { resolveVpEntry } from './helpers/vp';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
// 跨平台真实 vp 入口（.bin/vp 是 POSIX-only 的 sh shim，Windows spawn 会 ENOENT）
const vpEntry = resolveVpEntry(repoRoot);
const probeFile = join(fixtureDir, 'src/routes/api/perf-probe.ts');
const probeInitial = "const probeTag = 'initial';";

interface Running {
  child: ChildProcess;
  baseUrl: string;
  output: () => string;
}

/** 起一个 dev server 并等到可服务（探测路径有响应即算就绪）。 */
async function startServer(options: {
  command: string;
  args: string[];
  env?: Record<string, string>;
  readyPath?: string;
  /** 额外 CLI 参数（插在 `--port` 之前），如 `--verbose`。 */
  extraArgs?: string[];
}): Promise<Running> {
  const port = await findFreePort();
  const child = spawn(
    options.command,
    [...options.args, ...(options.extraArgs ?? []), '--port', String(port), '--strictPort'],
    {
      cwd: fixtureDir,
      env: { ...process.env, ...options.env, UBEAN_DEBUG_WATCH: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let output = '';
  const collect = (chunk: unknown) => (output += String(chunk));
  child.stderr?.on('data', collect);
  child.stdout?.on('data', collect);

  try {
    const baseUrl = await resolveBaseUrl(port, {
      path: options.readyPath ?? '/_health',
      timeoutMs: 180_000,
      child,
      output: () => output
    });
    return { child, baseUrl, output: () => output };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function stopServer(running: Running | null): Promise<void> {
  await stopChild(running?.child);
}
function writeProbe(marker: string): void {
  const current = readFileSync(probeFile, 'utf8');
  if (!current.includes(probeInitial)) {
    throw new Error(`${probeFile} 的探针字面量已被改写：${probeInitial}`);
  }
  writeFileSync(probeFile, current.replace(probeInitial, `const probeTag = '${marker}';`));
}

function restoreProbe(): void {
  const current = readFileSync(probeFile, 'utf8');
  if (current.includes(probeInitial)) return;
  writeFileSync(probeFile, current.replace(/const probeTag = '[^']*';/, probeInitial));
}

/** 轮询直到响应出现标记；带上最后一次响应体，失败时能直接看出服务端返回了什么。 */
async function pollMarker(baseUrl: string, marker: string, timeoutMs = 20_000) {
  const started = Date.now();
  let body = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/perf-probe`);
      body = await res.text();
      if (body.includes(marker)) return { ok: true, elapsedMs: Date.now() - started, body };
    } catch {
      /* 重扫期间可能短暂不可用 */
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  return { ok: false, elapsedMs: Date.now() - started, body };
}

async function probe(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
}

let running: Running | null = null;

afterEach(async () => {
  await stopServer(running);
  running = null;
  // 必须还原：本测试会改写示例项目的源码
  restoreProbe();
});

describe('ubean dev 热重载', () => {
  /**
   * 启动 codegen 的时机：必须晚于 Vite server 建好。
   *
   * 历史上 CLI 在扫描完就生成，而那时 `import.meta.env` 快照还不存在 —— 写出的
   * `.ubean/env.d.ts` 把 `ImportMetaEnv` 退化成索引签名，比 `vite dev`（插件的
   * `runProjectCodegen` 传了 `importMetaEnv`）弱一档，用户看不出区别但 `import.meta.env.X`
   * 全变成 `any`。
   *
   * 索引签名已经不再产出（它会反向削弱 `vite/client` 的 `Record<string, any>`），所以这里改
   * 断言「没有那份 `VITE_*` 清单就说明快照没传到」：夹具项目没有 `.env`，唯一的 `VITE_*` 来源
   * 就是 Vite 自己注入的 `VITE_*`（当前没有）—— 因此判据改成整块缺失 + `env.schema` 字段在位。
   *
   * 这里只跑**一个** server（CLI 路径），因为断言对象是「CLI 写出的那份产物」。
   */
  it('`.ubean/env.d.ts` 带 Vite 解析出的 ImportMetaEnv（与 vite dev 同档）', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    const envDts = join(fixtureDir, '.ubean', 'env.d.ts');
    // 先删掉：`.ubean/` 会被同套件里其他用例写过，只断言「存在」会被别人的产物蒙对。
    rmSync(envDts, { force: true });

    running = await startServer({ command: process.execPath, args: [cliEntry, 'dev'] });

    for (let i = 0; i < 40 && !existsSync(envDts); i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    expect(existsSync(envDts), `CLI 未生成 ${envDts}`).toBe(true);

    const contents = readFileSync(envDts, 'utf8');
    // Vite 内建（MODE / DEV / PROD / BASE_URL / SSR）由 `vite/client` 声明，我们不再重复声明 ——
    // 重复声明会撞 TS2687（Vite 那边没有 `readonly`）。这条锁住「不要退回去」。
    expect(contents, 'Vite 内建不该被重复声明：会与 vite/client 撞 TS2687').not.toContain('readonly MODE: string;');
    expect(contents, 'Vite 内建不该被重复声明：会与 vite/client 撞 TS2687').not.toContain('readonly DEV: boolean;');
    expect(contents, '兜底索引签名会削弱 vite/client 的类型面').not.toContain(
      '[key: string]: string | boolean | undefined'
    );
    // env.schema 的字段（走 `env: config.env`）也在同一份产物里 —— 缺了就说明整个
    // codegen 调用没带上 Vite 侧上下文。
    expect(contents).toContain('export const EXAMPLE_APP_TITLE: string;');
  }, 240_000);

  /**
   * 依赖预构建不能整段跳过（实测 soybean-admin-v3，v0.6.9）。
   *
   * 客户端环境的 `build.rollupOptions.input` 指向 `.ubean/virtual/client-entry.mjs` —— 那是
   * **构建产物**，dev 从不写它。Vite 的依赖扫描优先读顶层 `input`（能过 `resolveId`），退到
   * `rollupOptions.input` 时只能按磁盘路径解析，于是抛
   * `failed to resolve rolldownOptions.input value: "…/.ubean/virtual/client-entry.mjs"`。
   *
   * 危害不是「报错难看」：扫描失败会让**整个**依赖预构建被跳过（首屏请求瀑布 + 慢），而
   * dev server 照常起、页面照常渲染，所以只有盯着启动日志才看得到。
   *
   * `--verbose` 打开 diagnostics 闸门 —— 默认日志里这条错误不会出现。
   */
  it('启动日志里没有依赖扫描失败（`--verbose` 下断言）', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    // **必须删掉两处缓存**，否则用例永远绿：
    // - `.ubean/virtual/` 是构建产物，本套件其他用例（或之前的 `ubean build`）会留在磁盘上，
    //   于是 `rollupOptions.input` 的绝对路径能解析成功，缺陷被掩盖；
    // - `node_modules/.vite/deps/_metadata.json` 命中时 Vite 直接复用旧预构建结果，
    //   **整段扫描不会跑**。用户遇到这个报错的前提正是「新项目 / 清过缓存」。
    rmSync(join(fixtureDir, '.ubean/virtual'), { recursive: true, force: true });
    rmSync(join(fixtureDir, 'node_modules/.vite'), { recursive: true, force: true });

    running = await startServer({
      command: process.execPath,
      args: [cliEntry, 'dev'],
      extraArgs: ['--verbose']
    });

    // 预构建在 `listen()` 之后异步跑，等一会儿再断言（失败日志出现在这个窗口内）
    await new Promise(r => setTimeout(r, 4000));
    const output = running.output();
    expect(output, `启动日志里出现依赖扫描失败：\n${output.slice(-3000)}`).not.toContain(
      'Failed to run dependency scan'
    );
    expect(output).not.toContain('client-entry.mjs');
  }, 240_000);

  // 历史事故 #7（RM-V13）：dev-scan 协调器的注册表曾放在模块级 `WeakMap`，而真实项目的
  // `vite.config.ts` 由 Vite 自己打包加载 → 插件实例与 CLI import 的那份是**两个模块实例**，
  // CLI 注册的回调静默落进另一个注册表：服务端改动完全不生效且无任何报错。
  // 所以这条断言必须跑真 dev server（`configFile: false` + 进程内 import 插件会共享模块实例，永远绿）。
  it('改服务端路由文件后响应反映新内容（扫描 → 重建 app 的链路真的通）', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    running = await startServer({ command: process.execPath, args: [cliEntry, 'dev'] });

    const marker = `reload-${Date.now()}`;
    expect(await fetch(`${running.baseUrl}/api/perf-probe`).then(res => res.text())).not.toContain(marker);

    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);

    expect(
      result.ok,
      `未观察到新内容；最后响应：${result.body.slice(0, 200)}\n服务器输出尾部：\n${running.output().slice(-3000)}`
    ).toBe(true);
  }, 240_000);
});

describe('ubean dev（插件接管的请求路由）', () => {
  /**
   * 用户 `vite.config.ts` 存在时 app 归插件所有，CLI 不能再注册一个带 handler 的请求插件 ——
   * 否则两个 pre 中间件都会认领应用请求，先注册的（用户 config 里的那份）胜出，CLI 的 handler
   * 变成永远不执行的影子，两侧还会各建一份 app。这条用例守的就是这个组合。
   */
  it('页面/API 正常服务，且改文件仍生效（插件自举的 app 被重建）', async () => {
    running = await startServer({
      command: process.execPath,
      args: [cliEntry, 'dev'],
      env: {}
    });

    const home = await probe(running.baseUrl, '/');
    expect(home.status, home.body.slice(0, 200)).toBe(200);
    expect(home.contentType).toContain('text/html');
    expect(home.body).toContain('class="home"');

    const api = await probe(running.baseUrl, '/api/hello');
    expect(api.status).toBe(200);
    expect(api.contentType).toContain('application/json');

    const marker = `cli-switch-${Date.now()}`;
    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);
    expect(
      result.ok,
      `未观察到新内容；最后响应：${result.body.slice(0, 200)}\n服务器输出尾部：\n${running.output().slice(-3000)}`
    ).toBe(true);
  }, 240_000);
});

describe('vite dev 等价性（无 CLI 的裸命令）', () => {
  const startViteDev = (): Promise<Running> => {
    if (!existsSync(vpEntry)) throw new Error(`${vpEntry} 不存在：仓库根未安装依赖`);
    // `.bin/vp` 是 sh shim；真入口是纯 JS，用 process.execPath 直跑，POSIX/Windows 通吃
    return startServer({ command: process.execPath, args: [vpEntry, 'dev'], env: {} });
  };

  it('页面 SSR / API / 内置 `_` 路由 / 404 四类请求都由插件服务', async () => {
    running = await startViteDev();

    const home = await probe(running.baseUrl, '/');
    expect(home.status, home.body.slice(0, 200)).toBe(200);
    expect(home.contentType).toContain('text/html');
    expect(home.body).toContain('class="home"');
    // 过了 transformIndexHtml 才会出现客户端入口
    expect(home.body).toContain('/@vite/client');

    const api = await probe(running.baseUrl, '/api/hello');
    expect(api.status).toBe(200);
    expect(api.contentType).toContain('application/json');

    const health = await probe(running.baseUrl, '/_health');
    expect(health.status).toBe(200);

    const missingPage = await probe(running.baseUrl, '/definitely-missing');
    expect(missingPage.status).toBe(404);
    expect(missingPage.contentType).toContain('text/html');

    const missingApi = await probe(running.baseUrl, '/api/definitely-missing');
    expect(missingApi.status).toBe(404);
    expect(missingApi.contentType).toContain('application/json');
  }, 240_000);

  /**
   * 配置敏感信号：`vite dev`（插件自举路径）下语言前缀路由可用。
   *
   * 这条**不是** `loadUbeanConfigSync()` 那个缺陷的守卫 —— 我把它写成守卫后做过证伪：把修复从
   * 构建产物里撤掉，本用例仍然通过。原因是 dev 侧 app 由 `bootstrapDevApp()` 经**异步**加载器
   * （`loadUbeanConfig`）拿配置，同步加载器的缺陷不经过这条路；它的影响面是**构建路径**
   * （config 直接喂给 `prepareBuild` 与 env 配置），已在 `build-contracts` 与手工对照里量到。
   *
   * 保留它的价值在于：插件自举的 dev 路径确实按用户配置工作（示例是 `prefix_except_default`
   * + locales en/zh），且前缀路径上的未知页面仍走 404 页面兜底而不是 JSON。
   */
  it('配置真的被读到：语言前缀路由可用（i18n 未启用时 /zh/about 会 404）', async () => {
    running = await startViteDev();

    const prefixed = await probe(running.baseUrl, '/zh/about');
    expect(prefixed.status, prefixed.body.slice(0, 200)).toBe(200);
    expect(prefixed.body).toContain('class="about"');

    const defaultLocale = await probe(running.baseUrl, '/about');
    expect(defaultLocale.status).toBe(200);

    // 前缀路径上的未知页面仍走 404 页面兜底（而不是落到 JSON）
    const missing = await probe(running.baseUrl, '/zh/definitely-missing');
    expect(missing.status).toBe(404);
    expect(missing.contentType).toContain('text/html');
  }, 240_000);

  /**
   * 裸 `vite dev` 也要产出 OpenAPI 类型。
   *
   * 类型只能从 app 的 `/_openapi.json` 现算，而此前只有 CLI 会去取（在 `listening` 里拉自己那份）——
   * 于是裸 Vite 用户手里永远没有 `.ubean/openapi.d.ts`，`pnpm type-check` 会报一片
   * `Cannot find module '.ubean/openapi'`。现在插件在 dev server 起服务后触发一次 app 自举 +
   * 进程内请求，本用例守这条接线。
   *
   * 断言前先删掉文件：`.ubean` 会被同套件里其他用例写过，只断言「存在」会被别人的产物蒙对。
   */
  it('生成 OpenAPI 类型（.ubean/openapi.d.ts）', async () => {
    const dtsPath = join(fixtureDir, '.ubean', 'openapi.d.ts');
    rmSync(dtsPath, { force: true });
    expect(existsSync(dtsPath)).toBe(false);

    running = await startViteDev();

    // 生成发生在 listening 之后的一次自举里，给它一点时间（不是首个请求触发）
    for (let i = 0; i < 40 && !existsSync(dtsPath); i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    expect(existsSync(dtsPath), '裸 vite dev 未生成 .ubean/openapi.d.ts').toBe(true);
    expect(readFileSync(dtsPath, 'utf-8')).toContain('export interface paths');
  }, 240_000);

  it('改服务端文件后同样生效（插件自举的 app 会被重建）', async () => {
    running = await startViteDev();

    const marker = `vp-${Date.now()}`;
    writeProbe(marker);
    const result = await pollMarker(running.baseUrl, marker);

    expect(
      result.ok,
      `未观察到新内容；最后响应：${result.body.slice(0, 200)}\n服务器输出尾部：\n${running.output().slice(-3000)}`
    ).toBe(true);
  }, 240_000);
});
