import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `ubean prepare` 必须把 `env.schema` 写进 `.ubean/env.d.ts`。
 *
 * 回归的是一条**只在这条路径上发生**的断链：`generateTypes()` 的 `env` 选项是可选的，
 * Vite 插件那条路径（`packages/builder/src/vite.ts` 的 `runProjectCodegen`）传了它，
 * 而 CLI 的四处调用都没传 → `renderModuleTypes()` 拿到空数组，写出
 * 「`// env.schema is empty`」，于是 `ubean:env/*` 的每个具名导入都是 TS2305。
 *
 * 为什么这里必须跑真实 CLI 而不是单测 `generateTypes()`：断链在**调用点**，不在函数里。
 * 单测 `generateTypes({ env: … })` 无论调用点漏没漏传都会绿。
 */
const repoRoot = resolve(import.meta.dirname, '../../..');
// 与 `prepare-deps.test.ts` 用同一个入口：`dist/cli.js`，跑的是**构建后**的 CLI。
// 直接指 `src/` 会绕过产物，测到的是「源码里传没传 env」而不是「发布出去的 CLI 传没传」。
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'ubean-prepare-env-'));
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'prepare-env-fixture', version: '0.0.0', type: 'module' })
  );
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function runPrepare(configSource: string): Promise<{ code: number | null; output: string }> {
  writeFileSync(join(projectDir, 'ubean.config.ts'), configSource);
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cliEntry, 'prepare', '--no-install'], {
      cwd: projectDir,
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

describe('`ubean prepare` 生成 `.ubean/env.d.ts`', () => {
  /**
   * 用 legacy 三形态（`{ type: String, default }`）而不是 `envField.*()`：临时目录里没有
   * `node_modules`，配置无法 `import { envField } from 'ubean'`。`resolveEnvModules()`
   * 对两种形态都要处理，legacy 形态足以覆盖这条调用链。
   */
  it('声明的字段出现在两个模块的 declare block 里', async () => {
    const { code, output } = await runPrepare(
      'export default {\n' +
        '  env: {\n' +
        '    schema: {\n' +
        "      APP_TITLE: { type: String, default: 'fixture' },\n" +
        '      PORT: { type: Number, default: 9527 }\n' +
        '    }\n' +
        '  }\n' +
        '};\n'
    );

    expect(code, `prepare 应正常退出，实际输出:\n${output}`).toBe(0);

    const envDtsPath = join(projectDir, '.ubean/env.d.ts');
    expect(existsSync(envDtsPath), `prepare 应写出 .ubean/env.d.ts，实际输出:\n${output}`).toBe(true);

    const contents = readFileSync(envDtsPath, 'utf8');
    expect(contents, '声明的字段必须进 declare block').toContain('export const APP_TITLE: string;');
    expect(contents).toContain('export const PORT: number;');
    // 生成源码里 export 了 getSecret()，声明必须跟上，否则 import 它直接 TS2305。
    expect(contents).toContain('export function getSecret(key: string): string | undefined;');
    // 反过来锁住回归本身：声明了字段的 server 块不该退化成「空」占位注释。
    // （client 块为空是**对的** —— legacy 三形态没有维度信息，按最保守处理为
    // `server + secret`，所以 client 侧确实没有字段。）
    expect(contents).not.toContain("declare module 'ubean:env/server' {\n  // env.schema is empty");
  }, 120_000);
});
