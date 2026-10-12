/**
 * Vite 插件的 `config` 钩子必须触发项目依赖提醒（ADR-0012：裸 `vite dev` / `vite build`
 * 与 CLI 两条路径必须等价）。
 *
 * 这层为什么必须存在：`packages/config/test/project-deps.test.ts` 只证明清单与判定正确；
 * `packages/cli/test/prepare-deps.test.ts` 只证明 `ubean prepare` 会打印。而**裸 `vite dev`
 * 不经 `prepare`** —— 用户 `vite.config.ts` 里只有 `ubeanPlugin()`。插件那一段若被删掉或
 * 环境变量守卫写反，前两层测试全绿，`vite dev` 却静默什么都不说（正是要修的那类问题）。
 *
 * 项目放在仓库外的临时目录：探针会向上逐级找 `node_modules`，放在仓库内会解析到根目录的
 * vue / vue-router，缺失列表恒为空，用例「全绿但什么都没测到」。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadUbeanConfig, resetProjectDependencyCheckCache } from '@ubean/config';
import { logger as ubeanLogger } from '@ubean/shared/logger';
import { ubeanPlugin } from '../src/vite';

let roots: string[] = [];

beforeEach(() => {
  resetProjectDependencyCheckCache();
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
  resetProjectDependencyCheckCache();
  delete process.env.UBEAN_SKIP_DEP_CHECK;
});

function createProject(): { root: string } {
  const root = mkdtempSync(join(tmpdir(), 'ubean-dep-check-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dep-check-fixture', type: 'module' }));
  writeFileSync(join(root, 'index.html'), '<div id="app"></div>');
  writeFileSync(join(root, 'ubean.config.ts'), 'export default { ui: true };\n');
  return { root };
}

/** 取插件的 `config` 钩子（可能是对象形态 `{ handler }`）。 */
function configHookOf(plugin: ReturnType<typeof ubeanPlugin>): (env: unknown) => Promise<unknown> {
  const hook = plugin.config;
  return (typeof hook === 'function' ? hook : hook?.handler) as (env: unknown) => Promise<unknown>;
}

/**
 * 捕获检查期间打印的日志文本。
 *
 * **必须拦 `console`，不是 `process.stdout`** —— tslog v5 的 pretty 输出走
 * `getPrettyLogMethod()` → `nativeConsoleMethod('log')`（`tslog/esm/env/shared.js:556`），
 * 即**所有级别最终都调 `console.log`**，只有 json 模式才直写 fd 1。
 *
 * 踩过的坑（两次都表现为「断言收到空串」，看起来像检查根本没跑）：
 * 1. 只拦 `console.warn` —— 实际落在 `console.log` 上；
 * 2. 只拦 `process.stdout.write` —— pretty 模式下压根不经过它。
 */
async function captureOutput(run: () => Promise<unknown>): Promise<string> {
  const captured: string[] = [];
  const original = {
    log: console.log,
    warn: console.warn,
    info: console.info,
    error: console.error
  };
  const collect =
    (name: string) =>
    (...args: unknown[]): void => {
      captured.push(`${name}:${args.join(' ')}`);
    };
  console.log = collect('log');
  console.warn = collect('warn');
  console.info = collect('info');
  console.error = collect('error');
  try {
    await run();
    // tslog 先攒缓冲、再于微任务里刷出；不等一轮宏任务就只能捕到空串。
    await (ubeanLogger as unknown as { flush?: () => Promise<void> }).flush?.();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.info = original.info;
    console.error = original.error;
  }
  return captured.join('\n');
}

describe('Vite 插件的项目依赖提醒', () => {
  it('裸 vite 路径（无 prepare）：config 钩子打印缺失依赖与安装命令', async () => {
    const { root } = createProject();
    const config = await loadUbeanConfig(root);
    const plugin = ubeanPlugin({ config });

    const captured = await captureOutput(() =>
      configHookOf(plugin).call({}, { command: 'serve', mode: 'development' })
    );

    expect(captured, `config 钩子必须触发依赖检查。实际捕获:\n${captured}`).toContain('@vean/ui');
    expect(captured).toContain('required by `ui`');
    expect(captured, '必须给出可直接执行的安装命令').toMatch(/install with: (pnpm|npm|yarn|bun) (add|install) /);
  }, 60_000);

  it('UBEAN_SKIP_DEP_CHECK=1 → 完全不检查（供嵌套/程序化构建关掉提醒）', async () => {
    const { root } = createProject();
    const config = await loadUbeanConfig(root);
    const plugin = ubeanPlugin({ config });

    process.env.UBEAN_SKIP_DEP_CHECK = '1';
    const captured = await captureOutput(() => configHookOf(plugin).call({}, { command: 'build', mode: 'production' }));

    expect(captured).not.toContain('@vean/ui');
  }, 60_000);
});
