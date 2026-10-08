/**
 * `scripts/flaky.mjs` 的类型面。
 *
 * 为什么需要：它是**手写的 .mjs**，没有 `.d.mts`，`moduleResolution: bundler` 下从 TS 侧导入会得到
 * `TS7016: Could not find a declaration file for module '…/scripts/flaky.mjs' … implicitly has an
 * 'any' type` —— 这条错误会让示例项目的 `vue-tsc` 直接失败
 * （`examples/ubean-test/vitest.config.ts:3` 就是唯一的导入点）。
 *
 * 曾经的修法是给示例开 `allowJs`，代价是整个示例的 `.ts`/`.vue` 也被拉进 `checkJs` 的射程；
 * 现在只声明**真正被导入的那一个函数**。
 *
 * 契约对齐 `scripts/flaky.mjs` 的实现：`UBEAN_TEST_RETRIES` 显式值 > CI 默认 > 本地默认
 * （`DEFAULT_CI_RETRIES = 1`、`DEFAULT_LOCAL_RETRIES = 0`，均以**秒**无关的纯数字返回）。
 */
export declare function resolveRetries(env?: Record<string, string | undefined>): number;
