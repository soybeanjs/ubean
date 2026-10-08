/**
 * TS-14：配置组合矩阵的**构建层**两格。
 *
 * 为什么这两格不能放进 `packages/app/test/config-matrix.test.ts`（进程内那层）：它们断言的是
 * **构建产物**，也就是 `mode` 与 codegen 三关相互作用的结果，进程内观察不到。
 *
 * 1. `mode: 'spa'` + `ssr: true` —— 钉住「`mode` 优先于 `ssr`」这条语义。
 *    实现见 `packages/builder/src/vite/build-app.ts:117` /
 *    `packages/builder/src/production.ts:98`：`ssrEnabled = (mode === 'fullstack' && ssr.enabled) || mode === 'ssg'`
 *    —— 即 `mode` 不是 `fullstack` 时，`ssr: true` 被**静默忽略**。该语义此前只在代码里；本用例把它固定在
 *    测试里，并把口径写进 `docs/glossary.md`。
 * 2. `autoImports × components × i18n` 三关同开 —— 三套 codegen 同时产出生成物、互不覆盖。
 *    单维断言证明不了「一起开会不会互相踩」。
 *
 * 复用 TS-12 的 fixture（已含 i18n + 页面 + API 路由，且显式打开 autoImports/components），
 * 每格构建到自己的临时目录。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'packages/cli/test/fixtures/preset-runtime-app');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');

const SPA_OUT = '.temp-spa-ssr';
const CODEGEN_OUT = '.temp-codegen';

const outDirOf = out => join(fixtureDir, out);

function build(args: string[], timeoutMs = 300_000): Promise<void> {
  return new Promise((resolveBuild, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: fixtureDir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`build(${args.join(' ')}) 超时 ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolveBuild();
      else reject(new Error(`build(${args.join(' ')}) 退出 ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

afterAll(() => {
  rmSync(outDirOf(SPA_OUT), { recursive: true, force: true });
  rmSync(outDirOf(CODEGEN_OUT), { recursive: true, force: true });
});

describe('TS-14 · mode 优先于 ssr（spa + ssr:true）', () => {
  it('mode=spa 时 ssr:true 被忽略：只产出静态外壳，不产出服务端入口', async () => {
    await build(['build', '--mode', 'spa', '--outDir', SPA_OUT]);

    const out = outDirOf(SPA_OUT);
    // spa 的本质是「预先把客户端外壳算出来，运行期不需要服务端渲染」
    expect(existsSync(join(out, 'public/index.html')), 'spa 应产出 public/index.html').toBe(true);
    // 这条是判据的核心：`ssr: true` 没有把服务端入口带进来 —— 证明 mode 赢了
    expect(existsSync(join(out, 'server/entry.mjs')), 'mode=spa 不应产出 server/entry.mjs').toBe(false);

    // 外壳里应当带着 spa 的客户端入口脚本引用（不是空产物）
    const html = await import('node:fs').then(m => m.readFileSync(join(out, 'public/index.html'), 'utf8'));
    expect(html).toContain('<div id="app"');
  }, 360_000);
});

describe('TS-14 · autoImports × components × i18n 三关同开', () => {
  it('三关同开：三套 codegen 生成物齐备，且 i18n 策略确实穿到生产产物', async () => {
    await build(['build', '--outDir', CODEGEN_OUT]);

    // 三套 codegen 各写各的文件到同一个 `.ubean/` 目录 —— 「同开」要证明的是它们**都在**
    // 且没有互相挤掉（少任何一个都说明其中一路被另一路覆盖了）。
    const ubeanDir = join(fixtureDir, '.ubean');
    for (const file of [
      'routes.d.ts',
      'pages.d.ts',
      'auto-imports.d.ts',
      'components.d.ts',
      'virtual-components.d.ts',
      'codegen.manifest.json'
    ]) {
      expect(existsSync(join(ubeanDir, file)), `.ubean/${file} 应存在`).toBe(true);
    }

    // i18n 这一关的**效果**落在生产产物里：路由策略必须穿到 server entry。
    // （不拿 `.ubean/i18n.d.ts` 当判据：它是 `required: false` 的 codegen
    //  `packages/builder/src/codegen/index.ts:59`，需要项目里能解析到 `vue-i18n`，
    //  本 fixture 没有 `node_modules`，它缺席是正确行为而不是缺口。）
    const entryPath = join(outDirOf(CODEGEN_OUT), 'server/entry.mjs');
    expect(existsSync(entryPath), '三关同开不应打断 server 入口的产出').toBe(true);
    const entry = readFileSync(entryPath, 'utf8');
    expect(entry, 'i18n 策略应出现在生产产物里').toContain('prefix_except_default');
  }, 360_000);
});
