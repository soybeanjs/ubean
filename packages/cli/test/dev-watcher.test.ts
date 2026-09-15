import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDevWatcher } from '../src/dev-server/watcher';
import type { DevWatcher, WatchEvent } from '../src/dev-server/watcher';

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for watcher event');
}

describe('createDevWatcher', () => {
  let cwd: string;
  let watcher: DevWatcher | undefined;

  afterEach(() => {
    watcher?.stop();
    watcher = undefined;
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  /** 建一个最小项目骨架：`src/routes` 下已有 `hello.ts`（改写它比新建文件事件更稳定）。 */
  function createHarness(): { routes: string; hello: string } {
    cwd = mkdtempSync(join(tmpdir(), 'ubean-dev-watcher-'));
    const routes = join(cwd, 'src/routes');
    mkdirSync(routes, { recursive: true });
    const hello = join(routes, 'hello.ts');
    writeFileSync(hello, 'export const GET = () => 1;\n');
    return { routes, hello };
  }

  function start(dirs: string[]): { events: WatchEvent[]; errors: string[] } {
    const events: WatchEvent[] = [];
    const errors: string[] = [];
    watcher = createDevWatcher({
      cwd,
      dirs,
      debounceMs: 10,
      onError: (_error, target) => errors.push(target),
      onChange: batch => events.push(...batch)
    });
    watcher.start();
    return { events, errors };
  }

  // 回归：`ResolvedConfig.srcDir` 是绝对路径，`dev.ts` 因此传入绝对目标。
  // 修复前 `join(cwd, absoluteTarget)` 会拼成 `<cwd><cwd>/src/routes`，每个 fs.watch
  // 都以 ENOENT 失败并被空 catch 吞掉 —— 0 个 watcher，服务端热重载整体失效。
  //
  // 注意 macOS 递归 fs.watch 会先发一个 filename = 被监听目录名（此处 `routes`）的杂散
  // 事件，所以按「事件集合包含目标文件」断言，而不是取第一个事件。
  it('watches an absolute target without re-joining cwd', async () => {
    const { routes, hello } = createHarness();
    const { events } = start([routes]);

    expect(watcher?.count()).toBe(1);

    writeFileSync(hello, 'export const GET = () => 2;\n');
    await waitFor(() => events.some(event => event.relativePath === 'src/routes/hello.ts'));
    expect(events.map(event => event.relativePath)).toContain('src/routes/hello.ts');
  });

  it('still resolves relative targets against cwd', async () => {
    const { hello } = createHarness();
    const { events } = start(['src/routes']);

    expect(watcher?.count()).toBe(1);

    writeFileSync(hello, 'export const GET = () => 3;\n');
    await waitFor(() => events.some(event => event.relativePath === 'src/routes/hello.ts'));
    expect(events.map(event => event.relativePath)).toContain('src/routes/hello.ts');
  });

  // 调用方负责预过滤不存在的可选目录（src/plugins 等）；到这里仍失败就是真异常，
  // 必须上报而不是静默吞掉，否则这类问题会再次变得不可见。
  it('reports a failing target instead of swallowing it', () => {
    createHarness();
    const missing = join(cwd, 'src/missing');
    const { errors } = start([missing]);

    expect(watcher?.count()).toBe(0);
    expect(errors).toEqual([missing]);
  });
});
