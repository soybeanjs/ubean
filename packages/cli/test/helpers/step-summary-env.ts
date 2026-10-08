/**
 * 在**指定**的 `$GITHUB_STEP_SUMMARY` 下调用一段逻辑，跑完原样恢复。
 *
 * ## 为什么需要它（CI 实测红过两次）
 *
 * `scripts/coverage.mjs` 与 `scripts/flaky.mjs` 的签名都是：
 *
 * ```js
 * export function appendStepSummary(markdown, file = process.env.GITHUB_STEP_SUMMARY) { … }
 * ```
 *
 * 默认参数意味着**显式传 `undefined` 并不会关掉它** —— JS 见到实参为 `undefined` 就用默认值。
 * 于是此前两条负向断言（`expect(appendStepSummary('# 报告', undefined)).toBe(false)`）在本地绿、
 * 在 GitHub runner 上红：
 *
 * ```
 * AssertionError: 本地跑（无 GITHUB_STEP_SUMMARY）时静默跳过，诊断步骤不该因此失败: expected true to be false
 * ```
 *
 * （runner 上该环境变量真实存在，函数不但返回 `true`，还把一段测试垃圾**追加进了真的 job
 * step summary**。）更糟的是这条副作用会污染同一 job 后续步骤的 `$GITHUB_STEP_SUMMARY`
 * 内容，而这种污染在测试报告里完全看不见。
 *
 * 修法不是改生产代码的默认值（默认值是对的：生产调用点就是 `appendStepSummary(markdown)`），
 * 而是让测试**真的操作环境变量** —— 只有这样才测到「本地没有该变量」这条路径。
 */
export function withStepSummaryEnv<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.GITHUB_STEP_SUMMARY;

  if (value === undefined) delete process.env.GITHUB_STEP_SUMMARY;
  else process.env.GITHUB_STEP_SUMMARY = value;

  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
  }
}
