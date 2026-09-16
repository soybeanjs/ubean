/**
 * 构建路径一致性（RM-V23 的核心断言）。
 *
 * Phase 2 的每一次回归 —— 岛屿组件整类消失、预渲染在换路径时被漏接、内容集合页缺失 ——
 * 都是靠**手工把两条路径的产物清单拿来 diff** 才发现的：没有测试、也没有体积门禁能拦住它们
 * （体积门禁只守增长，产物变小反而算通过，这正是 RM-P23 补「缺 chunk」判据的由来）。
 *
 * 这里把那个动作固化成断言：同一项目分别用**默认路径**（两次独立 `viteBuild`）与
 * **builder 路径**（开关打开）构建，规范化输出目录名与内容哈希后比对文件清单，必须逐项一致。
 *
 * 两条硬性要求（上一轮踩过）：
 * 1. **构建到各自的临时目录**（`--outDir`），不覆盖 `dist` —— 否则会把开关产物留给
 *    `analyze:check`，门禁变红（这正是上一版测试被撤下的原因）；
 * 2. **不依赖 `UBEAN_VITE_BUILDER` 的继承**：每次 spawn 显式设置或删除该变量。
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureDir = join(repoRoot, 'examples/ubean-test');
const cliEntry = join(repoRoot, 'packages/cli/dist/cli.js');
/** 两条路径各自的产物目录（都在 fixture 内、跑完删除）。 */
const OUT_BUILDER = '.temp-build-builder';
const OUT_LEGACY = '.temp-build-legacy';

function cleanup(): void {
  const dirs = [
    OUT_BUILDER,
    OUT_LEGACY,
    ...MODES.flatMap(mode => [`${OUT_BUILDER}-${mode}`, `${OUT_LEGACY}-${mode}`]),
    ...PRESET_CONTRACTS.flatMap(({ preset }) => [`${OUT_BUILDER}-preset-${preset}`, `${OUT_LEGACY}-preset-${preset}`])
  ];
  for (const dir of dirs) {
    rmSync(join(fixtureDir, dir), { recursive: true, force: true });
  }
}

/** 递归列出产物文件（相对路径），并把内容哈希规范化 —— 哈希在两次构建间不稳定。 */
function listArtifacts(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listArtifacts(full, rel));
    else out.push(rel.replace(/-[A-Za-z0-9_-]{8}\./g, '.<hash>.'));
  }
  return out;
}

/** 跑一次构建并等它退出（构建挂住会在这里超时，本身就是回归）。 */
function build(outDir: string, viteBuilder: boolean, extraArgs: string[] = [], timeoutMs = 300_000): Promise<void> {
  const env = { ...process.env };
  if (viteBuilder) env.UBEAN_VITE_BUILDER = '1';
  else delete env.UBEAN_VITE_BUILDER;

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliEntry, 'build', '--outDir', outDir, ...extraArgs], {
      cwd: fixtureDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`构建未在 ${timeoutMs}ms 内退出（构建挂住即为回归）\n${output.slice(-2000)}`));
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else rejectRun(new Error(`构建失败（exit ${code}）\n${output.slice(-2000)}`));
    });
  });
}

afterAll(cleanup);

/**
 * 矩阵的核心一格：**同一 mode 下**两条路径的产物清单一致。
 *
 * preset 维度（node / cloudflare / vercel / netlify / bun / deno）与「无用户 vite.config」维度
 * 仍待补 —— 它们需要为每个 preset 断言包装文件（`server.mjs` / `worker.mjs` / `handler.mjs` /
 * `wrangler.toml` 等）与各自的 fixture 支持，属于矩阵的下一批格子。
 */
const MODES = ['fullstack', 'spa', 'backend', 'ssg'] as const;

/**
 * preset 轴（三种包装形态）。
 *
 * 只比「两条路径清单一致」不够 —— 两个都错得一样也会通过。因此每个 preset 同时断言**它自己的
 * 产物契约**：node 出 `server/server.mjs`、standard 出 `server/handler.mjs`、cloudflare 出
 * `server/worker.mjs` 并在 dist 根写 `wrangler.toml`。其余 preset（vercel / netlify / bun /
 * deno / aws / azure）待补：它们各自还有平台配置文件（`vercel.json` / `netlify.toml` /
 * `deno.json` …），需要逐一定义契约。
 */
const PRESET_CONTRACTS = [
  { preset: 'node', wrapper: 'server/server.mjs', rootFile: '' },
  { preset: 'cloudflare', wrapper: 'server/worker.mjs', rootFile: 'wrangler.toml' },
  // `standard`（`entryType: 'fetch'` → `server/handler.mjs`）曾因 server bundle 是否内联而分叉
  // （175 vs 60），修法见 build-configs.ts 的 serverOutputNames：非 node 目标一律内联。
  { preset: 'standard', wrapper: 'server/handler.mjs', rootFile: '' }
] as const;

describe('构建路径一致性（RM-V23）', () => {
  it('默认路径与 builder 路径（开关打开）产物逐项一致', async () => {
    if (!existsSync(cliEntry)) {
      throw new Error(`${cliEntry} 不存在：请先构建（pnpm build）再跑 CLI 集成测试`);
    }
    cleanup();

    await build(OUT_LEGACY, false);
    const viaLegacy = listArtifacts(join(fixtureDir, OUT_LEGACY));

    await build(OUT_BUILDER, true);
    const viaBuilder = listArtifacts(join(fixtureDir, OUT_BUILDER));

    expect(viaLegacy.length, '默认路径应当产出产物').toBeGreaterThan(0);
    // 逐项一致性：少了岛屿 chunk / 预渲染页 / 内容集合页都会在这里显形
    expect(viaBuilder).toEqual(viaLegacy);
  }, 600_000);

  it.each(PRESET_CONTRACTS)(
    'preset $preset：两条路径产物逐项一致，且包装文件符合该 preset 契约',
    async ({ preset, wrapper, rootFile }) => {
      const legacyDir = `${OUT_LEGACY}-preset-${preset}`;
      const builderDir = `${OUT_BUILDER}-preset-${preset}`;
      rmSync(join(fixtureDir, legacyDir), { recursive: true, force: true });
      rmSync(join(fixtureDir, builderDir), { recursive: true, force: true });

      await build(legacyDir, false, ['--preset', preset]);
      const viaLegacy = listArtifacts(join(fixtureDir, legacyDir));

      await build(builderDir, true, ['--preset', preset]);
      const viaBuilder = listArtifacts(join(fixtureDir, builderDir));

      // 产物契约：包装文件必须存在（否则「两条路径一致」可能只是同时缺了它）
      expect(viaBuilder).toContain(wrapper);
      if (rootFile) expect(viaBuilder).toContain(rootFile);
      expect(viaBuilder).toEqual(viaLegacy);
    },
    600_000
  );

  it.each(MODES)(
    '%s：两条路径产物逐项一致',
    async mode => {
      const legacyDir = `${OUT_LEGACY}-${mode}`;
      const builderDir = `${OUT_BUILDER}-${mode}`;
      rmSync(join(fixtureDir, legacyDir), { recursive: true, force: true });
      rmSync(join(fixtureDir, builderDir), { recursive: true, force: true });

      await build(legacyDir, false, ['--mode', mode]);
      const viaLegacy = listArtifacts(join(fixtureDir, legacyDir));

      await build(builderDir, true, ['--mode', mode]);
      const viaBuilder = listArtifacts(join(fixtureDir, builderDir));

      expect(viaLegacy.length, `${mode} 路径应当产出产物`).toBeGreaterThan(0);
      expect(viaBuilder).toEqual(viaLegacy);
    },
    600_000
  );
});
