/**
 * `UbeanDevEnvironment`（RM-V08）契约测试。
 *
 * 用真实 env-runner `node-worker` + 真实 vite-plus dev server 验证 ADR-0012 §3 的两件事：
 * 1. 请求经 `dispatchFetch()` 进入 **worker 内**的 Hono app 并拿到响应（进程隔离）；
 * 2. worker 内的 `ModuleRunner` 能经 IPC 向宿主取模块 —— 即 invoke bridge 闭合（这是
 *    RM-V04 spike 里唯一没打通的一环）。
 *
 * 不 mock：bridge 写错就会在这里 60s 超时失败，正是要信号化的失败方式。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { UbeanDevEnvironment, createUbeanDevEnvironmentFactory } from '@ubean/build/vite';
import { NodeWorkerEnvRunner } from 'env-runner/runners/node-worker';

const WORKER_ENTRY = resolve(import.meta.dirname, 'fixtures/dev-worker-entry.mjs');

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  cleanup = [];
});

async function startDevEnvironment() {
  const root = mkdtempSync(join(tmpdir(), 'ubean-dev-env-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dev-env-fixture', type: 'module' }));
  writeFileSync(join(root, 'index.html'), '<div id="app"></div>');
  // worker 通过 ModuleRunner 向宿主取这个模块（/src/answer.ts）——
  // 与 ubean 项目的 srcDir 约定一致，模块请求走 `/src/...` 路径
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/answer.ts'), 'export const answer: number = 42;\n');

  const runner = new NodeWorkerEnvRunner({ name: 'ubean', data: { entry: WORKER_ENTRY } });
  cleanup.push(() => runner.close());
  await runner.waitForReady(30_000);

  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0 },
    environments: {
      ubean: {
        consumer: 'server',
        dev: { createEnvironment: createUbeanDevEnvironmentFactory(runner) }
      }
    }
  });
  cleanup.push(() => server.close());
  await server.listen();

  const environment = server.environments.ubean as UbeanDevEnvironment;
  cleanup.push(async () => rmSync(root, { recursive: true, force: true }));
  return { environment, runner, server };
}

describe('UbeanDevEnvironment（RM-V08）', () => {
  it('dev 环境是继承自 DevEnvironment 的自定义环境', async () => {
    const { environment } = await startDevEnvironment();
    expect(environment).toBeInstanceOf(UbeanDevEnvironment);
    expect(environment.name).toBe('ubean');
    expect(environment.mode).toBe('dev');
  }, 90_000);

  it('dispatchFetch 把请求交给 worker 内的 Hono app 并返回响应', async () => {
    const { environment } = await startDevEnvironment();
    const response = await environment.dispatchFetch(new Request('http://localhost/api/ping'));

    const text = await response.text();
    expect(response.status, `worker 响应：${text}`).toBe(200);
    const body = JSON.parse(text) as { from: string; threadId: number; pid: number };
    expect(body.from).toBe('worker');
    // 隔离证据：响应来自 worker 线程（主线程 threadId 为 0），而非宿主事件循环
    expect(body.threadId).not.toBe(0);
  }, 90_000);

  it('worker 内的 ModuleRunner 能经 invoke bridge 向宿主取模块', async () => {
    const { environment } = await startDevEnvironment();
    const response = await environment.dispatchFetch(new Request('http://localhost/api/module'));

    const text = await response.text();
    expect(response.status, `worker 响应：${text}`).toBe(200);
    const body = JSON.parse(text) as { evaluated: number; threadId: number };
    // 值来自宿主侧转换并求值的 `/src/answer.ts`，却运行在 worker 线程里
    expect(body.evaluated).toBe(42);
    expect(body.threadId).not.toBe(0);
  }, 90_000);
});
