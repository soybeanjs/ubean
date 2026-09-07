/**
 * ubean/build — 构建时工具聚合入口
 *
 * 聚合编译期/构建期子包,仅在 Node 环境(构建脚本、CI、`ubean.config.ts` 加载器、
 * `vite.config.ts`)中使用 —— 包含 `node:*` 内建、文件系统扫描与 oxc-parser WASM:
 * - `@ubean/build/prerender` — SSG 预渲染(`prerender()` / payload 提取 / manifest)
 * - `@ubean/preset` — 平台预设(`definePreset` / `detectPreset` / 平台配置生成)
 * - `@ubean/config` — 配置加载(`loadUbeanConfig` / `getConfig` / 模块系统)
 * - `@ubean/build/codegen` — auto-imports 预设与解析(`getAutoImportPresets` 等)
 * - `@ubean/scan` — 项目扫描器与路由元数据类型
 * - Vite 插件本体(`ubeanPlugin` / `ubeanVite` / `ubeanIslandsPlugin` /
 *   `ubeanServerActionsPlugin`);组合版推荐直接用 `ubean/vite`
 *
 * `ubean.config.ts` 中的 `defineConfig` 仍从 isomorphic 主入口导入(内联 identity 实现)。
 *
 * ```ts
 * import { prerender, resolvePrerenderConfig } from 'ubean/build';
 * import { getAutoImportPresets } from 'ubean/build';
 * ```
 */
export * from '@ubean/build/prerender';
export * from '@ubean/preset';
export * from '@ubean/config';
export * from '@ubean/build/codegen';

// ============== 路由扫描器 + AST 提取器 ==============
export * from '@ubean/scan';

// ============== Vite 插件本体 ==============
export { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
export type { UbeanPluginOptions as UbeanCorePluginOptions } from '@ubean/build/vite';
// 别名 `ubeanPlugin`(对齐原 ubean 主入口导出名)— 指向 build 插件
// 注意:组合版 `ubeanPlugin`(build + vue + islands)在 `./vite` 子路径导出
export { ubeanPlugin } from '@ubean/build/vite';
export type { UbeanPluginOptions } from '@ubean/build/vite';
export { ubeanVite } from '@ubean/build/vue';
export type { UbeanViteOptions } from '@ubean/build/vue';
export { VUE_PLUGIN_INCLUDE } from '@ubean/build/vue';
// `ubeanIslandsPlugin` 来自 `/vite` 子路径;`getIslandsBootstrapScript` 在 isomorphic 主入口
export { ubeanIslandsPlugin } from '@ubean/islands/vite';
export { ubeanServerActionsPlugin } from '@ubean/build/actions';
