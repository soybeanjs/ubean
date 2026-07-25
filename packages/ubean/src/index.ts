/**
 * ubean — Vue 元框架主入口(Phase 7 切换后)
 *
 * 本包现在是 `@ubean/core` 聚合器的 thin re-export 层。
 * 所有实现已迁移到 `@ubean/*` 子包,本包仅负责:
 *   1. re-export `@ubean/core` 的全部 API(向后兼容)
 *   2. 保留历史子路径(`ubean/vite`、`ubean/runtime/vue` 等)的导出
 *   3. 提供 `ubean` CLI 二进制(转发到 `@ubean/cli/cli`)
 *
 * 新项目推荐直接使用 `@ubean/core`:
 * ```ts
 * import { defineConfig, defineHandler, defineApp } from '@ubean/core';
 * ```
 *
 * 旧项目可继续使用 `ubean`(本包),API 100% 兼容。
 */

export * from '@ubean/core';
