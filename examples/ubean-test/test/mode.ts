/**
 * TS-33：dev / build 双轨开关。
 *
 * 为什么需要它：L2 默认只跑 `ubean dev`，与主流**相反** —— Nuxt e2e 默认 `build=true`、
 * SvelteKit 用 `DEV=true` 跑两遍、Next 推荐测生产代码。历史漏检 #2（asset-manifest 被内联成
 * 空串、所有体积门禁全绿）正是「dev 侧有断言、build 侧无断言」的形态：dev 与生产构建走的是
 * **两条不同的代码路径**（`vite dev` vs `vite build` + 静态产物），只在 dev 上绿的断言证明不了
 * 生产产物可用。
 *
 * 用法（见 `examples/ubean-test/vitest.config.ts` 与 `test/global-setup.ts`）：
 * - 不设：`dev` 轨 —— 与既有行为完全一致（`ubean dev`，跑 `test/**` 全集）
 * - `UBEAN_TEST_MODE=build`：`build` 轨 —— `ubean build --outDir .temp-build` +
 *   `ubean preview --outDir .temp-build`，只跑 `test/mode-family/**`（高风险子集，
 *   不全量翻倍，见 `docs/test.md` §5 TS-33 做法③）
 */
export type TestMode = 'dev' | 'build';

export const TEST_MODE: TestMode = process.env.UBEAN_TEST_MODE === 'build' ? 'build' : 'dev';

export const isBuildMode = TEST_MODE === 'build';

/**
 * 按运行形态取期望值。
 *
 * 只在**确实会不同**的地方用，并且调用点必须写明原因 —— 两端相同的断言直接写死期望值，
 * 不要包一层 `perMode` 把差异藏起来。
 */
export function perMode<T>(dev: T, build: T): T {
  return isBuildMode ? build : dev;
}
