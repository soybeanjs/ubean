/**
 * ubean/runtime/vue — 浏览器端 Vue 客户端运行时入口
 *
 * 纯 re-export `@ubean/runtime`,为浏览器/客户端 bundle 提供独立的入口点,
 * 避免从 `ubean` 主入口拉入服务端依赖(build/cli/dev 等构建时工具)。
 *
 * 客户端代码应始终从此子路径导入:
 * ```ts
 * import { defineApp, hydrateIslands, useRouter, useHead, Link, PageView } from 'ubean/runtime/vue';
 * ```
 *
 * 对应原 ubean 包 `runtime/vue/index.ts` 的行为。
 */
export * from '@ubean/runtime';
