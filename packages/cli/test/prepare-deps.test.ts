/**
 * `prepare` 的项目依赖提醒（`ensurePackages` 式）端到端契约。
 *
 * 为什么必须有这层：`packages/config/test/project-deps.test.ts` 只证明**清单与判定**正确，
 * 证明不了「CLI 真的会把它打印出来」。而这条链上最容易断的一环恰好在这里 ——
 * `prepare.ts` 曾经有一套自己的 `ensureBuiltinModules`（只查内建模块包、漏 peer），
 * 换成共享实现时若忘了调用点，所有单测仍然全绿，用户却什么都看不到。
 *
 * 依据的实测事故（2026-10）：soybean-agent 的 `ui: true` 因为缺 `@vean/ui` 整块模块被
 * 静默跳过，而报错文本还指向 `@ubean/integrations`（已安装）—— 用户照着提示装也修不好。
 *
 * 断言三件事：
 * 1. 缺失的**必需 peer**（`@vean/ui`）出现在输出里；
 * 2. 输出逐条说明「谁要求它」（`required by \`ui\``）；
 * 3. 给出可直接复制执行的安装命令。
 *
 * **项目必须落在仓库外的临时目录**：探针用 `createRequire(cwd/package.json).resolve()`
 * 判断「项目里装没装」，而 Node 会向上逐级找 `node_modules` —— 放在 `packages/cli/test/fixtures/`
 * 下时，仓库根 `node_modules` 里的 vue / vue-router / @vean/ui 全部会被解析到，缺失列表恒为空，
 * 用例会「全绿但什么都没测到」。`prepare` 本身不依赖 cwd 下的构建产物，临时目录可用。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'ubean-prepare-deps-'));
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({
      name: 'prepare-deps-fixture',
      version: '0.0.0',
      type: 'module',
      dependencies: { ubean: '^0.6.2' }
    })
  );
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * 跑 `ubean prepare --no-install` 并收集输出。
 *
 * `--no-install` 是刻意的：用例断言的是**提醒**，不是安装。它同时把这条用例钉在
 * 「`--no-install` 只影响自动安装、不影响提醒」这个语义上（旧实现里 `--no-install`
 * 会连警告一起吞掉）。
 */
function runPrepare(configSource: string): Promise<{ code: number | null; output: string }> {
  writeFileSync(join(projectDir, 'ubean.config.ts'), configSource);
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cliEntry, 'prepare', '--no-install'], {
      cwd: projectDir,
      // CI 置位 → 交互判定必然为 false，用例不会挂在等待输入上
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += String(chunk)));
    child.stderr?.on('data', chunk => (output += String(chunk)));
    child.on('error', reject);
    child.on('close', code => resolveRun({ code, output }));
  });
}

describe('`ubean prepare` 项目依赖提醒', () => {
  it('启用了 ui 但缺 @vean/ui → 打印必需 peer 缺失、谁要求它、以及安装命令', async () => {
    const { code, output } = await runPrepare('export default { ui: true };\n');

    // 缺依赖是**提醒**，不是失败：prepare 必须照常完成（否则 CI 会因为一个可选 peer 红掉）
    expect(code, `prepare 应正常退出，实际输出:\n${output}`).toBe(0);

    expect(output, '缺失的必需 peer 必须出现在输出里').toContain('@vean/ui');
    expect(output, '必须说明谁要求它 —— 否则用户不知道这个包为什么被要求').toContain('required by `ui`');
    expect(output, '必须给出可直接执行的安装命令').toMatch(/install with: (pnpm|npm|yarn|bun) (add|install) /);
    expect(output, '核心依赖也应在同一份提醒里').toContain('vue-router');
  }, 120_000);

  it('未启用任何内建模块 → 只有核心依赖提醒，不误报模块包', async () => {
    const { code, output } = await runPrepare('export default {};\n');

    expect(code, `prepare 应正常退出，实际输出:\n${output}`).toBe(0);
    // 临时目录里没有 node_modules，核心依赖必然缺失 —— 提醒在，但**不该**点名任何内建模块包
    expect(output).toContain('vue-router');
    expect(output, '没开 ui 就不该要求 @vean/ui').not.toContain('@vean/ui');
    expect(output, '没开 pinia 就不该要求 pinia').not.toContain('  - pinia');
  }, 120_000);

  it('--no-install 只关闭自动安装，不关闭提醒', async () => {
    const { output } = await runPrepare('export default { ui: true };\n');

    expect(output, '--no-install 下提醒必须仍在').toContain('Missing required project dependencies');
  }, 120_000);
});
