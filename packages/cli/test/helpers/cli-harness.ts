/**
 * `packages/cli` 集成测试共用的进程 / 端口 / 就绪探测工具。
 *
 * ## 与 L3（`test/browser/`）的职责边界（TS-37）
 *
 * 本仓有**两套**真实浏览器 harness，分工是刻意保留的，不是待清理的重复：
 *
 * | | `packages/cli/test/*.test.ts`（本目录） | `test/browser/**`（L3） |
 * | --- | --- | --- |
 * | 驱动方式 | **裸 Playwright**（`chromium.launch()`） | vitest browser mode（`@vitest/browser` + Playwright provider） |
 * | 服务来源 | 测试**自己 spawn** `ubean dev` / `preview`（可控端口、可读子进程输出、可断言退出码） | `global-setup.ts` 起一个长驻 dev server（`:3998`），全部 spec 复用 |
 * | 独有语义 | **改写示例源码并还原**（`dev-dx` 的 HMR vs 整页重载、`dev-reload` 的变更生效）、**子进程生命周期**（提前退出 / `strictPort` / 端口占用）、**构建产物契约**（`build-contracts`） | 页面结构、水合结果、SEO/i18n 的 DOM 事实、POM 化的多页导航 |
 * | 为什么不能互换 | vitest browser mode 下 spec 文件运行在浏览器 iframe 里，**无法安全改写宿主仓库源码再重启 dev server**；反过来，把 21 个 POM 塞进裸 Playwright 就要重写整层导航辅助 | 浏览器模式提供 `expect.poll`、workspace 级 `retries`/`reporters`、trace 归档与 flaky 门禁（`scripts/flaky.mjs`），裸 Playwright 没有这些 |
 *
 * 判据（新增用例该放哪）：
 *
 * - 需要**改源码 / 重启服务器 / 看子进程输出 / 断言产物文件** ⇒ 放这里（裸 Playwright）。
 * - 只是**打开页面看 DOM / 点击 / 读 meta** ⇒ 放 L3，复用 POM。
 *
 * 唯一的已知重叠是「页内切换语言」与「`/_devtools` 可达」两处（`docs/test-e2e-migration.md` §3b
 * 已登记）。它们**刻意保留双份**：`dev-dx` 那份守的是「真 CLI 进程 + 真端口 + 无整页刷新」，
 * L3 那份守的是「POM 化的页面行为」—— 撤掉任一份都会丢掉对应侧的信号。
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

/** 默认取样区间：与 `dev-topology` 的 `port + 1000` 约定兼容（越界会被 `continue` 掉）。 */
const DEFAULT_PORT_BASE = 10_000;
const DEFAULT_PORT_SPAN = 20_000;
const DEFAULT_ATTEMPTS = 40;

/** 单个端口是否可绑定（`127.0.0.1` 上试听一次即关）。 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolveFree => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolveFree(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)));
  });
}

export interface FindFreePortOptions {
  /** 取样区间起点，默认 `10_000`。 */
  base?: number;
  /** 取样区间宽度，默认 `20_000`。 */
  span?: number;
  /**
   * 除返回端口外还必须空闲的**偏移量**。
   *
   * `ubean dev` 会额外占用 `port + 1000`（HMR 独立端口），不预留就可能撞上别的进程，
   * 或在接近 `65_535` 时触发 `ERR_SOCKET_BAD_PORT`。`dev` 类用例传 `[1000]`。
   */
  reservedOffsets?: number[];
}

/** 取一个可用端口；连试 `attempts` 次仍失败则抛错（不是静默返回 0）。 */
export async function findFreePort(options: FindFreePortOptions = {}): Promise<number> {
  const base = options.base ?? DEFAULT_PORT_BASE;
  const span = options.span ?? DEFAULT_PORT_SPAN;
  const offsets = options.reservedOffsets ?? [];
  for (let attempt = 0; attempt < DEFAULT_ATTEMPTS; attempt += 1) {
    const port = base + Math.floor(Math.random() * span);
    const candidates = [port, ...offsets.map(offset => port + offset)];
    if (candidates.some(candidate => candidate > 65_535)) continue;
    const free = await Promise.all(candidates.map(isPortFree));
    if (free.every(Boolean)) return port;
  }
  throw new Error('找不到可用端口');
}

export interface ResolveBaseUrlOptions {
  /** 探测路径，默认 `/`。 */
  path?: string;
  timeoutMs?: number;
  /** 传入则每轮先检查进程是否已退出 —— **失败快速**：否则要白等满 `timeoutMs`。 */
  child?: ChildProcess;
  /** 与 `child` 搭配：进程提前退出时把它的输出贴进错误里。 */
  output?: () => string;
}

/**
 * 轮询 `port` 直到 HTTP 可达，返回**第一个**能应答的 base URL。
 *
 * `ubean dev` / `preview` 默认只绑 IPv6 `[::1]`（`dev.host: 'localhost'`），拿
 * `127.0.0.1` 去连会直接 `000`。因此必须先试 `::1` 再退回 `127.0.0.1` —— 后者是给
 * 未来监听形态留的兼容位，不是当前真实路径。
 */
export async function resolveBaseUrl(port: number, options: ResolveBaseUrlOptions = {}): Promise<string> {
  const path = options.path ?? '/';
  const timeoutMs = options.timeoutMs ?? 120_000;
  const { child, output } = options;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}${path}`, { signal: AbortSignal.timeout(2_000) });
        if (res.status > 0) return candidate;
      } catch {
        /* 换下一个候选 */
      }
    }
    if (child && child.exitCode != null) {
      throw new Error(`服务器提前退出（exit ${child.exitCode}）\n${output?.() ?? ''}`);
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`服务器在 ${timeoutMs}ms 内不可达（port ${port}）\n${output?.() ?? ''}`);
}

/**
 * 先 `SIGTERM` 再超时 `SIGKILL`，等进程真的退出。
 *
 * 不用 `child.kill()` 就返回：被杀的进程可能仍占着端口，下一个用例会以「端口被占」的形式
 * 随机失败（`--strictPort` 下 dev server 会直接退出），归因成本很高。
 */
export async function stopChild(child: ChildProcess | undefined, timeoutMs = 5_000): Promise<void> {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await new Promise<void>(resolveExit => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveExit();
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

export interface SpawnCliOptions {
  /** 已构建的 CLI 入口（通常是 `<repo>/packages/cli/dist/cli.js`）。 */
  cliEntry: string;
  /** 参数数组，如 `['dev', '--port', '1234', '--strictPort']`。 */
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/** spawn 已构建的 CLI；stdout / stderr 合并成 `output()` 便于失败时贴日志。 */
export function spawnCli(options: SpawnCliOptions): { child: ChildProcess; output: () => string } {
  const child = spawn(process.execPath, [options.cliEntry, ...options.args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const collect = (chunk: unknown) => (output += String(chunk));
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  return { child, output: () => output };
}

/**
 * 启动 Chromium 并打开一个默认超时的页面。
 *
 * 只给 `dev-dx`（改源码 / HMR 语义）用 —— 普通的页面断言走 `test/browser/` 的 POM，
 * 不要在这里再长出一套页面辅助（那正是 TS-37 要消除的重复）。
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}

/**
 * Playwright 的**水合完成**探针：Vue 已挂载到 `#app`。
 *
 * **必须是函数，不能是字符串。** `page.waitForFunction()` 传函数时会把函数 `toString()`
 * 后再送进页面（TS 类型已在编译期剥离，所以 `as never as` 转写不会露出来）；传字符串则
 * **原样**在页面里 eval —— 本项目实测会直接报 `SyntaxError: Unexpected identifier 'as'`。
 */
export const HYDRATION_PROBE = () =>
  Boolean((document.querySelector('#app') as never as Record<string, unknown>)?.__vue_app__);

/**
 * 等页面水合完成再交互。
 *
 * 不等就点按钮会被丢掉（SSR 首屏还没有事件监听器）；`settleMs` 是给 dev server 首轮依赖
 * 预构建触发的整页重载留的安静窗口，否则 `page.evaluate` 会在随机时刻被
 * `Execution context was destroyed` 打断。需要在重载计数之后取基线的用例传 `settleMs: 0`。
 */
export async function waitForApp(page: Page, options: { timeoutMs?: number; settleMs?: number } = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const settleMs = options.settleMs ?? 1_500;
  await page.waitForFunction(HYDRATION_PROBE, undefined, { timeout: timeoutMs });
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}
