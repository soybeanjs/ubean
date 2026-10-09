/**
 * 非 CI 主矩阵的两个 workflow 的**结构断言**：`release.yml`（tag 推送即发版）与
 * `compat.yml`（TS-18 nightly 依赖兼容矩阵）。
 *
 * 为什么要钉：
 *
 * 1. 发布门禁（TS-06）后来补上了 typecheck/lint/test，但**发布 job 里跑测试 ≠ 浏览器装好了**。
 *    `packages/cli/test/dev-dx.test.ts` 直接 `chromium.launch()`，浏览器不在 node_modules 里。
 *    2026-10-07 的 `v0.6.1-beta.1` 就这样在 publish 前一步红了
 *    （`Executable doesn't exist at /home/runner/.cache/ms-playwright/...`）——
 *    没有这道断言，下次「把 Windows/发布流程简化一下」就能把它再删掉。
 * 2. 兼容矩阵的 L2 依赖各包的 `dist`（`dist` 在 .gitignore:12，CI 不提交它）。
 *    没有 build 步骤时 globalSetup 起的 `ubean dev` 进程一启动就 `ERR_MODULE_NOT_FOUND`，
 *    而失败信息只有一句 180s 之后的「服务不可达」。这道断言盯住「L2 之前必须有 build」。
 *
 * 断言刻意只锁**顺序与存在性**，不锁具体命令串：脚本怎么写是实现细节，
 * 但「L2 之前先构建」「发布前装浏览器」是契约。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const rootRequire = createRequire(join(repoRoot, 'package.json'));
const YAML = rootRequire('yaml') as typeof import('yaml');

type Step = { id?: string; name?: string; run?: string; uses?: string };
type Job = { steps?: Step[] };

/** 取 workflow 里**唯一**那个 job 的步骤列表。release.yml / compat.yml 都只有一个 job。 */
function stepsOf(workflowName: string): Step[] {
  const text = readFileSync(join(repoRoot, '.github/workflows', workflowName), 'utf8');
  const jobs = (YAML.parse(text) as { jobs: Record<string, Job> }).jobs;
  const entries = Object.entries(jobs);

  expect(entries.length, `${workflowName} 应当只有一个 job`).toBe(1);
  return entries[0][1].steps ?? [];
}

describe('release.yml 的门禁完整性', () => {
  const steps = stepsOf('release.yml');

  it('装浏览器：`pnpm test` 会真的 launch chromium（dev-dx），不装就是 publish 前一步必红', () => {
    const install = steps.find(s => /playwright install/i.test(s.run ?? ''));

    expect(
      install?.run,
      '发布 job 里必须有一道 `pnpm exec playwright install …` —— packages/cli/test/dev-dx.test.ts 直接 chromium.launch()'
    ).toContain('chromium');
  });

  it('质量门禁（typecheck / lint / test）都在 publish 之前', () => {
    const names = steps.map(s => s.run ?? '');

    const gateIdx = names.findIndex(run => run.trim().startsWith('pnpm test'));
    const publishIdx = names.findIndex(run => run.includes('publish'));

    expect(gateIdx, '必须有 `pnpm test` 门禁（TS-06）').toBeGreaterThan(-1);
    expect(publishIdx, '必须有 publish 步骤').toBeGreaterThan(-1);
    expect(gateIdx, '门禁必须排在 publish 之前，否则就是「带着红灯发版」').toBeLessThan(publishIdx);
  });

  it('publish 必须显式指定 dist-tag，且预发布不能占 latest', () => {
    // 2026-10-09 实测事故：`pnpm -r publish` 没带 `--tag`，npm 默认给预发布也打 `latest`，
    // 于是 24 个包的 `latest` 全部从 0.6.0 挪到 0.6.1-beta.2 —— `pnpm add ubean` 会装到 beta。
    // 当时那次 Publish 步是 **success**（没有任何红灯），是事后手动回滚的。
    // 这里锁两件事：publish 带 `--tag`，且 tag 是按「版本号带不带 `-`」算出来的。
    // 注意匹配 `pnpm -r publish` 而不是裸的 `publish`：上面 Resolve 步的 echo 里也有
    // “publishing”，裸匹配会命中它而不是真正的 publish 步骤。
    const publish = steps.find(s => s.run?.includes('pnpm -r publish'));

    expect(publish?.run, 'publish 必须显式 `--tag` —— 不带就是 npm 默认的 `latest`，预发布会顶掉正式版').toMatch(
      /--tag/
    );
    expect(publish?.run, 'tag 必须来自算出来的 dist-tag，不能写死').toContain('steps.dist-tag.outputs.tag');

    // 纯字符串断言（不跑 shell）：semver 里 `-` 即预发布。
    const resolveStep = steps.find(s => s.id === 'dist-tag');

    expect(resolveStep?.run, '必须先算出 dist-tag 再 publish').toBeTruthy();
    expect(resolveStep?.run, '版本号含 `-` 即预发布 → 走 beta').toContain('*-*');
    expect(resolveStep?.run, '否则才是 latest').toMatch(/tag=latest/);
  });
});

describe('根 package.json 的 build 过滤器', () => {
  it('`-F ./packages/*` 必须用双引号：Windows 上单引号会匹配不到任何包', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    // 2026-10-07 实测：Windows 格报 `No projects matched the filters in "D:\a\ubean\ubean"`
    // → 所有包都没构建 → apps/docs 的 `ubean prepare` 找不到
    // `packages/ubean/node_modules/@ubean/cli/dist/cli.js`（ERR_MODULE_NOT_FOUND）。
    expect(pkg.scripts.build, 'build 必须双引号包住 filter').toContain('"./packages/*"');
  });
});

describe('compat.yml 的 L2 前置条件', () => {
  const steps = stepsOf('compat.yml');

  it('装了浏览器之外，还必须能构建 packages（L2 的 globalSetup 要用 packages/*/dist）', () => {
    // dist 在 .gitignore:12，checkout 后的干净工作区里没有它；`node_modules/ubean` 是指向
    // packages/ubean 的符号链接，入口 `import '@ubean/cli/cli'` 直接依赖 dist/cli.js。
    const depMatrix = readFileSync(join(repoRoot, 'scripts/dep-matrix.mjs'), 'utf8');
    const l2Idx = depMatrix.indexOf("'pnpm', ['--filter', 'ubean-test', 'test']");

    expect(l2Idx, 'dep-matrix.mjs 必须仍以 L2 作为最后一跑').toBeGreaterThan(-1);

    const buildIdx = depMatrix.lastIndexOf('--parallel', l2Idx);
    expect(
      buildIdx,
      'L2 之前必须先 `pnpm -F ./packages/* --parallel build` —— 兼容矩阵的 job 从未构建过 packages'
    ).toBeGreaterThan(-1);

    // 注：dep-matrix.mjs 里 `'./packages/*'` 是传给 spawnSync 的 **argv 数组元素**（不过 shell），
    // 所以单引号无害；需要双引号的只有根 package.json 里的 shell 脚本 —— 见上面的 describe。
  });

  it('workflow 本身不隐藏失败：矩阵格是 ubuntu + L2 步骤直出', () => {
    const l2Step = steps.find(s => /dep-matrix\.mjs/.test(s.run ?? ''));

    expect(l2Step?.run, 'compat.yml 必须直接把 dep-matrix.mjs 跑在 job 里（退出码即格子的结论）').toBeTruthy();
  });
});
