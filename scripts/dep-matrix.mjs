#!/usr/bin/env node
/**
 * TS-18：依赖版本兼容矩阵的执行器。
 *
 * 用法：
 *   node scripts/dep-matrix.mjs --dep vue --version 3.4.38            # 跑一轮 L2
 *   node scripts/dep-matrix.mjs --dep vue --version 3.4.38 --skip-restore
 *   node scripts/dep-matrix.mjs --list                                 # 列出支持的依赖轴
 *
 * 做法（照 Waku 的 `react_version` override 先例）：改 `pnpm-workspace.yaml` 的 `overrides`
 * → 重新 `pnpm install` → 跑同一套 L2 → **逐字节还原**两份被改的文件。
 *
 * 为什么要还原：`pnpm-workspace.yaml` 与 `pnpm-lock.yaml` 都是入库文件，`overrides` 一旦留下，
 * 后续所有 install / commit 都会带着被覆盖的版本 —— 兼容矩阵必须是「跑完不留痕」的，否则它自己
 * 就成了依赖漂移的来源。
 *
 * 不进 PR 门禁：安装一遍 `node_modules` 很慢，且兼容矩阵的价值在**揭示**而非**阻断**；
 * 由 `.github/workflows/compat.yml` 在 nightly / 手动触发。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = process.cwd();
const workspaceFile = join(repo, 'pnpm-workspace.yaml');
const lockFile = join(repo, 'pnpm-lock.yaml');

/** 已支持的覆盖轴。加轴 = 在这里登记 + 在 compat.yml 的 matrix 里加一格。 */
const AXES = {
  vue: {
    /** 当前 minor（各 package.json 的 `^3.5.43`）与前一 minor */
    versions: ['3.5.43', '3.4.38'],
    description: 'Vue 3.x minor 矩阵（当前 3.5 / 前一 3.4）'
  }
};

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes('--list')) {
  for (const [dep, axis] of Object.entries(AXES)) {
    console.log(`${dep}: ${axis.description}`);
    for (const v of axis.versions) console.log(`  - ${v}`);
  }
  process.exit(0);
}

const dep = arg('dep');
const version = arg('version');
const skipRestore = args.includes('--skip-restore');

if (!dep || !version) {
  console.error('用法: node scripts/dep-matrix.mjs --dep <dep> --version <version> [--skip-restore]');
  console.error(`支持轴: ${Object.keys(AXES).join(', ')}（--list 查看详情）`);
  process.exit(2);
}

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const before = { workspace: sha(workspaceFile), lock: sha(lockFile) };
const stamp = `${dep}-${version}`.replace(/[^a-z0-9.-]/gi, '-');
const backupDir = join(tmpdir(), `ubean-dep-matrix-${stamp}`);
mkdirSync(backupDir, { recursive: true });
copyFileSync(workspaceFile, join(backupDir, 'pnpm-workspace.yaml'));
copyFileSync(lockFile, join(backupDir, 'pnpm-lock.yaml'));

/**
 * 往 `overrides:` 块里插入/替换 `<dep>: '<version>'`。
 *
 * 刻意做**文本级**插入而不是 YAML parse → stringify：`pnpm-workspace.yaml` 里有大段
 * 解释性注释（vite 的钉住理由、allowBuilds 的逐条原因），parse→write 会把它们全部抹掉。
 */
function applyOverride(text, name, value) {
  const lines = text.split('\n');
  const overrideIdx = lines.findIndex(l => l === 'overrides:');
  if (overrideIdx < 0) throw new Error('pnpm-workspace.yaml 里找不到 `overrides:` 块');

  const existing = lines.findIndex((l, i) => i > overrideIdx && l.startsWith(`  ${name}:`));
  const line = `  ${name}: '${value}'`;
  if (existing >= 0) lines[existing] = line;
  else lines.splice(overrideIdx + 1, 0, line);
  return lines.join('\n');
}

function run(label, cmd, args2, timeoutMs) {
  console.log(`\n$ ${label}`);
  const res = spawnSync(cmd, args2, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs
  });
  const out = String(res.stdout ?? '') + String(res.stderr ?? '');
  const tail = out.split('\n').filter(Boolean).slice(-12).join('\n');
  if (res.status !== 0) console.log(tail);
  return { code: res.status ?? 1, out };
}

/**
 * 还原并**验证**。这一步是本脚本最不能出错的地方：兼容矩阵自己绝不能变成依赖漂移的来源。
 *
 * `verify` 检查的是文件**结构**（`packages:` / `catalog:` / `overrides:` 三块都在），而不只是
 * 字节哈希 —— 字节一致当然最好，但结构完整才是「仓库可用」的下界；本轮实测曾出现「文件整个
 * 消失」的事故，正是结构检查才能兜住（哈希比对对不存在的文件直接抛异常，反而掩盖了问题）。
 */
function restore() {
  for (const file of ['pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    const src = join(backupDir, file);
    const dest = join(repo, file);
    if (!existsSync(src)) {
      console.error(`!! 备份缺失：${src}`);
      console.error(`!! 手动恢复：git checkout -- ${file} && pnpm install`);
      process.exit(3);
    }
    copyFileSync(src, dest);
  }

  const workspace = readFileSync(workspaceFile, 'utf8');
  const structureOk = ['packages:', 'catalog:', 'overrides:'].every(marker => workspace.includes(marker));
  const hashesOk = sha(workspaceFile) === before.workspace && sha(lockFile) === before.lock;

  if (!structureOk) {
    console.error('!! 还原后结构校验失败（packages:/catalog:/overrides: 缺一块）');
    console.error(
      `!! 请从 ${backupDir} 手动拷回，或 git checkout -- pnpm-workspace.yaml pnpm-lock.yaml && pnpm install`
    );
    process.exit(3);
  }
  console.log(`已还原并校验：结构完整；字节${hashesOk ? '一致' : '不一致(与进入本脚本时相比)'}。`);
}

console.log(`== TS-18 依赖兼容矩阵：${dep}@${version} ==`);
writeFileSync(workspaceFile, applyOverride(readFileSync(workspaceFile, 'utf8'), dep, version), 'utf8');
console.log(`已写入 overrides.${dep} = '${version}'`);

const install = run('pnpm install --no-frozen-lockfile', 'pnpm', ['install', '--no-frozen-lockfile'], 900_000);
if (install.code !== 0) {
  console.error('install 失败 —— 还原后退出');
  restore();
  process.exit(1);
}

const installedVersion = run(
  '读取实际安装版本',
  process.execPath,
  ['-e', `console.log(require('${dep}/package.json').version)`],
  60_000
);
console.log(`实际安装 ${dep}: ${installedVersion.out.trim()}`);

// L2 的 globalSetup 跑的是 `node node_modules/ubean/bin/ubean.mjs dev`（examples/ubean-test/test/
// global-setup.ts），而 `packages/ubean` 在 workspace 里是指向源码的**符号链接**，入口又直接
// `import '@ubean/cli/cli'` —— 那要 `packages/cli/dist/cli.js` 存在。
// `dist` 在 .gitignore:12，CI 也不会提交它：兼容矩阵原本没跑任何 build，于是 dev 进程一启动就
// `ERR_MODULE_NOT_FOUND` 退出，globalSetup 却只能轮询到 180s 超时才抛一句「服务不可达」
// （2026-10-07 实测：L2 恰好烧了 181s，栈里只有 `initializeGlobalSetup`，看不到子进程的报错）。
// 装完 override 先构建一次，dist 与被覆盖的依赖版本无关（构建只读源码），还原后无需重建。
const build = run('构建 packages（为 L2 提供 dist）', 'pnpm', ['-F', './packages/*', '--parallel', 'build'], 900_000);
if (build.code !== 0) {
  console.error('构建失败 —— 还原后退出');
  restore();
  process.exit(1);
}

const l2 = run('pnpm --filter ubean-test test  (L2)', 'pnpm', ['--filter', 'ubean-test', 'test'], 900_000);
console.log(`\n== L2 结果: EXIT=${l2.code} ==`);

if (!skipRestore) {
  restore();
  console.log('重新安装以恢复 node_modules 到官方钉住版本 ...');
  run('pnpm install --no-frozen-lockfile (restore)', 'pnpm', ['install', '--no-frozen-lockfile'], 900_000);
}

process.exit(l2.code);
