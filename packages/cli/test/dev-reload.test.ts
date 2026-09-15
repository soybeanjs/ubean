/**
 * dev 热重载的端到端回归（RM-V13）。
 *
 * 这个测试存在的理由是一个**只在真实项目里才暴露**的缺陷：RM-V13 把三套监听合并进 dev-scan
 * 协调器后，协调器先挂在模块级 `WeakMap` 上，而真实项目的 `vite.config.ts` 由 Vite 自己打包
 * 加载 —— 其中的插件实例与 CLI 从 node_modules 直接 import 的那份是**两个模块实例**，
 * 于是 CLI 注册的「扫描后重建 app」回调落进了另一个注册表，永远收不到通知：服务端改动
 * **完全不生效且没有任何报错**。所有用 `configFile: false` + 进程内 import 插件的测试都照常通过
 * （它们共享同一个模块实例），只有「起真 dev server + 改文件 + 看响应」能发现。
 *
 * 因此这里必须走公共入口：子进程 `ubean dev`（会加载项目的 vite.config.ts）+ 纯 HTTP。
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 探针路由：改一个字面量后必须能从响应里看到（与 RM-P05 的基准探针同一文件）。 */
const probeFile = join(fixtureDir, 'src/routes/api/perf-probe.ts');
const probeInitial = "const probeTag = 'initial';";

let child: ChildProcess | undefined;
let baseUrl: string;
let stderrOutput = '';

async function findFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 10_000 + Math.floor(Math.random() * 20_000);
    const free = await new Promise<boolean>(resolveFree => {
      const server = createServer();
      server.unref();
      server.once('error', () => resolveFree(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolveFree(true)));
    });
    if (free) return port;
  }
  throw new Error('找不到可用端口');
}

async function resolveBaseUrl(port: number, timeoutMs = 120_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const host of ['::1', '127.0.0.1']) {
      const candidate = host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`;
      try {
        const res = await fetch(`${candidate}/_health`, { signal: AbortSignal.timeout(1_000) });
        if (res.status > 0) return candidate;
      } catch {
        /* 换下一个候选 */
      }
    }
    if (child?.exitCode != null) throw new Error(`dev server 提前退出（exit ${child.exitCode}）\n${stderrOutput}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`dev server 在 ${timeoutMs}ms 内不可达\n${stderrOutput}`);
}

/** 轮询直到响应里出现/消失某个标记。 */
async function pollProbe(marker: string, timeoutMs: number): Promise<{ ok: boolean; elapsedMs: number; body: string }> {
  const started = Date.now();
  let body = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/perf-probe`);
      body = await res.text();
      const hit = body.includes(marker);
      if (hit) return { ok: true, elapsedMs: Date.now() - started, body };
    } catch {
      /* dev server 重扫期间可能短暂不可用 */
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  return { ok: false, elapsedMs: Date.now() - started, body };
}

beforeAll(async () => {
  if (!existsSync(cliEntry)) {
    throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
  }
  const original = readFileSync(probeFile, 'utf8');
  if (!original.includes(probeInitial)) {
    throw new Error(`${probeFile} 不再包含 ${probeInitial}；请同步更新热重载回归探针`);
  }
  const port = await findFreePort();
  child = spawn(process.execPath, [cliEntry, 'dev', '--port', String(port), '--strictPort'], {
    cwd: fixtureDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr?.on('data', chunk => (stderrOutput += chunk));
  baseUrl = await resolveBaseUrl(port);
}, 180_000);

afterAll(async () => {
  if (child && child.exitCode == null) {
    child.kill('SIGTERM');
    await new Promise<void>(resolveExit => {
      const timer = setTimeout(() => {
        child?.kill('SIGKILL');
        resolveExit();
      }, 5_000);
      child?.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  // 探针文件必须还原：本测试会改写示例项目的源码
  restoreProbe();
});

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

describe('dev 热重载（RM-V13 协调器）', () => {
  it('改服务端路由文件后，响应反映新内容（扫描 → 重建 app 的链路真的通）', async () => {
    const marker = `reload-${Date.now()}`;

    // 首次探测：确认当前响应里没有本轮的标记
    const before = await fetch(`${baseUrl}/api/perf-probe`).then(res => res.text());
    expect(before).not.toContain(marker);

    writeProbe(marker);
    const result = await pollProbe(marker, 15_000);

    expect(result.ok, `15s 内未观察到新内容；最后响应：${result.body.slice(0, 200)}`).toBe(true);
    // 延迟基线：RM-P05 冻结的 p50 是 219ms，这里给足余量（CI 上更慢），只防「完全不生效」
    expect(result.elapsedMs).toBeLessThan(15_000);

    restoreProbe();
  }, 60_000);
});
