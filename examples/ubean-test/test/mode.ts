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
 * - 不设 / `pnpm test`：`dev` 轨 —— 与既有行为完全一致（`ubean dev`）
 * - `UBEAN_TEST_MODE=build` 或 `pnpm test:build`：`build` 轨 ——
 *   `ubean build --outDir .temp-build` + `ubean preview --outDir .temp-build`
 *
 * 两轨跑的是**同一套** `test/**`，差异只在两端确实不同的断言上（`perMode` / `isBuildMode`，
 * 共 6 个调用点：devtools / static-files / middleware-order / http-contracts / download /
 * data-cache）。不做子集过滤 —— 过滤掉的文件在另一轨从未跑过，那正是要消灭的盲区。
 */
export type TestMode = 'dev' | 'build';

/**
 * 开关的**唯一来源是 `process.env.UBEAN_TEST_MODE`**，由 `vitest.config.ts` 写入。
 *
 * 为什么不写成 shell 前缀（`UBEAN_TEST_MODE=build vitest run`）：那是 POSIX 语法，Windows 的
 * cmd.exe / PowerShell 会把整个 `UBEAN_TEST_MODE=build` 当成可执行文件名 —— CI 的 windows 格
 * 在 `pnpm test:build` 这一 step 直接 `'UBEAN_TEST_MODE' is not recognized as an internal or
 * external command`，build 轨在 Windows 上从未真正跑过。
 *
 * 为什么是 `process.env` 而不是 `import.meta.env`：这里有两个执行环境 —— vitest worker
 * （有 `import.meta.env`）与 `global-setup.ts`（直接由 node/bun 执行，被 rolldown 打包时
 * `import.meta.env` 换成 `{}`）。`test.env` 只写进 `import.meta.env`，**不**写进进程 env，
 * 于是 global-setup 读不到、会静默走成 dev 轨（跑绿但测的是错的东西）。配置文件因此同时写
 * `process.env` 与 `test.env`，两处读到的值才一致。
 */
const rawMode = process.env.UBEAN_TEST_MODE;

if (rawMode !== undefined && rawMode !== 'build' && rawMode !== 'dev') {
  throw new Error(`UBEAN_TEST_MODE 只接受 'dev' 或 'build'，收到：${JSON.stringify(rawMode)}`);
}

export const TEST_MODE: TestMode = rawMode === 'build' ? 'build' : 'dev';

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
