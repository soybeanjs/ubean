/**
 * TS-13：CI OS × Node 矩阵的**结构断言**。
 *
 * 为什么要在测试里钉住 workflow 的结构，而不是「看一眼 CI 绿了就算」：
 *
 * 1. 「矩阵存在」是个**结构性事实**，不是行为事实 —— 没有断言时，把 `windows-latest` 从 os 轴里
 *    删掉会让矩阵静默退化成 2 格，而 CI 依然全绿（少跑的东西不会报错）。这正是 `docs/test.md`
 *    §1.3 纪律①「跳过必须可见」的同一类问题。
 * 2. TS-05 的聚合门禁（`ci-ok`）依赖「每个 job 都挂在 `needs` 里」。矩阵化（TS-13）之后如果新增
 *    一个 job 却忘了挂 `needs`，那个 job 就变成**不阻断 merge 的装饰**。这条不变量必须自动化。
 * 3. 平台/成本专属的步骤必须显式 `if: runner.os == 'ubuntu-latest'` 门控。漏掉一处，Windows 格
 *    就会去跑只有 ubuntu 能跑的步骤，矩阵当场变红，而根因（漏门控）藏在 workflow 文本里。
 *
 * 刻意不引入 YAML 依赖到 `packages/cli`：用 `createRequire` 指向**仓库根** `package.json` 解析
 * `yaml`（根 `node_modules` 可解析，本仓既有约定）。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const rootRequire = createRequire(join(repoRoot, 'package.json'));
const YAML = rootRequire('yaml') as typeof import('yaml');

type Step = { name?: string; if?: string; run?: string; uses?: string };
type Job = {
  name?: string;
  'runs-on'?: string;
  needs?: string | string[];
  if?: string;
  strategy?: { 'fail-fast'?: boolean; matrix?: { os?: string[]; node?: unknown[]; exclude?: unknown[] } };
  steps?: Step[];
};
type Workflow = { jobs: Record<string, Job> };

const workflow = YAML.parse(readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8')) as Workflow;

/** 「只有 ubuntu 能/才该跑」的步骤 —— 必须显式门控。 */
const UBUNTU_ONLY_STEPS = [
  'Browser E2E (Playwright)',
  'Client JS budget',
  'Type check the example project',
  'Build the docs site',
  'Verify package tree & extension contract',
  'Check docs i18n'
];

describe('TS-13 CI OS × Node 矩阵', () => {
  it('ci 是矩阵 job，且 fail-fast: false（一格失败不取消其余格）', () => {
    const ci = workflow.jobs.ci;
    expect(ci, 'jobs.ci 必须存在').toBeDefined();
    expect(ci.strategy?.['fail-fast'], 'fail-fast 必须显式关闭').toBe(false);
  });

  it('runs-on 走 matrix.os（否则矩阵只是装饰）', () => {
    expect(workflow.jobs.ci['runs-on']).toBe('${{ matrix.os }}');
  });

  it('os × node 展开后 ≥4 格，且同时覆盖 ubuntu 与 windows', () => {
    const matrix = workflow.jobs.ci.strategy?.matrix;
    expect(matrix, 'matrix 必须存在').toBeDefined();

    const os = matrix?.os ?? [];
    const nodes = matrix?.node ?? [];
    const excluded = matrix?.exclude?.length ?? 0;
    const cells = os.length * nodes.length - excluded;

    // 验收①：≥4 格矩阵
    expect(cells, `矩阵只有 ${cells} 格（os=${os.join('|')} × node=${nodes.join('|')}）`).toBeGreaterThanOrEqual(4);
    expect(os, '必须包含 ubuntu-latest').toContain('ubuntu-latest');
    // 本任务要消灭的正是「Windows 路径/CRLF/fs.watch 不可见」，所以 Windows 格是硬要求
    expect(os, '必须包含 windows-latest').toContain('windows-latest');
    expect(nodes.length, 'Node 轴至少 2 个版本').toBeGreaterThanOrEqual(2);
  });

  it('没有用 exclude 把 Windows 格裁掉（平台专属步骤靠 if 门控，不靠缩矩阵）', () => {
    const matrix = workflow.jobs.ci.strategy?.matrix;
    const os = matrix?.os ?? [];
    const nodes = (matrix?.node ?? []).map(String);
    const excluded = (matrix?.exclude ?? []) as Array<{ os?: string }>;

    // 如果将来真的加了 exclude，必须**显式**保留至少一个 Windows 格 —— 否则这条断言会红，
    // 提醒你「Windows 覆盖没了」而不是让它静默消失。
    const remainingOs = new Set(os);
    for (const ex of excluded) {
      if (ex.os && !os.some(o => o === ex.os && !excluded.some(e => e.os === o))) remainingOs.delete(ex.os);
    }
    expect(remainingOs, 'exclude 之后必须仍然覆盖 windows').toContain('windows-latest');
    expect(nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('平台/成本专属步骤全部显式门控到 ubuntu（Windows 格不会误跑）', () => {
    const steps = workflow.jobs.ci.steps ?? [];
    const byName = new Map(steps.map(s => [s.name, s]));

    for (const name of UBUNTU_ONLY_STEPS) {
      const step = byName.get(name);
      expect(step, `找不到 step「${name}」—— 改名了就要同步这张表`).toBeDefined();
      expect(step?.if, `step「${name}」缺少 if 门控`).toContain("runner.os == 'ubuntu-latest'");
    }
  });

  it('TS-05 聚合门禁覆盖全部 job（新增 job 忘了挂 needs 会红）', () => {
    const ciOk = workflow.jobs['ci-ok'];
    expect(ciOk, 'jobs.ci-ok 必须存在').toBeDefined();
    expect(ciOk.if, 'ci-ok 必须 if: always()，否则 needs 失败会让它 skipped 而 skipped 不算失败').toBe('always()');

    const needs = Array.isArray(ciOk.needs) ? ciOk.needs : ciOk.needs ? [ciOk.needs] : [];
    const gateableJobs = Object.keys(workflow.jobs).filter(job => job !== 'ci-ok');
    // 全序断言：不是「包含了 ci」，而是「**每一个**可被门禁的 job 都在里面」——
    // 少了任何一个，那个 job 的失败就不会阻断 merge（TS-05 设计意图的直接守卫）。
    expect([...needs].sort()).toEqual([...gateableJobs].sort());
  });
});
