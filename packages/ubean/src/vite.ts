/**
 * ubean/vite — 默认 Vite 插件组装入口
 *
 * 将 `@ubean/build`、`@ubean/vite`、`@ubean/islands` 三个 Vite 插件
 * 组合为单一 `ubeanPlugin` 入口，对应原 `ubean` 包 `ubeanPlugin` 的行为。
 *
 * 消费者在 `vite.config.ts` 中使用：
 * ```ts
 * import { defineConfig } from 'vite-plus';
 * import { ubeanPlugin } from 'ubean/vite';
 *
 * export default defineConfig({
 *   plugins: [ubeanPlugin()]
 * });
 * ```
 *
 * 配置始终从 `ubean.config.ts` 加载，无需（也不能）通过参数传递。
 * CLI（`ubean dev` / `ubean build`）在启动 Vite 前已调用 `loadUbeanConfig()`
 * 设置全局缓存，`ubeanPlugin()` 会优先读取缓存（包含 CLI 参数修改）；
 * 若缓存未命中（如独立使用 Vite 时），则用 jiti 同步加载 `ubean.config.ts`。
 *
 * 对于需要细粒度控制的场景，可直接从子包导入：
 * - `@ubean/build/vite` → `ubeanPlugin as ubeanCorePlugin`（框架无关）
 * - `@ubean/vite` → `ubeanVite`（Vue 专属：页面/入口虚拟模块 + 自动导入）
 * - `@ubean/islands/vite` → `ubeanIslandsPlugin`（Islands SFC transform）
 */

import type { Plugin } from 'vite';
import { ubeanServerActionsPlugin } from '@ubean/actions/vite';
import { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
import type { UbeanPluginOptions } from '@ubean/build/vite';
import { loadUbeanConfigSync } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
import { ubeanVite } from '@ubean/vite';
import type { UbeanViteOptions } from '@ubean/vite';

export type { UbeanPluginOptions, UbeanViteOptions };

/**
 * ubean 默认 Vite 插件组合（无参数版本）。
 *
 * 返回一个扁平的 `Plugin[]`，包含：
 * 1. `ubeanCorePlugin` — 框架无关的核心插件（路由扫描、虚拟模块、宏转换）
 * 2. `ubeanVite` — Vue 专属插件（页面/入口虚拟模块、自动导入、组件解析）
 * 3. `ubeanIslandsPlugin` — Islands 架构插件（SFC 中 `v-client.*` 指令转换）
 * 4. `ubeanServerActionsPlugin` — Server Actions 插件（`defineAction()` 调用转换）
 *
 * 配置来源：始终从 `ubean.config.ts` 加载（同步），不接受 `config` 参数。
 *
 * 注：组件级缓存通过 `defineCachedFunction()` 显式调用,无需 Vite 插件参与。
 */
export function ubeanPlugin(): Plugin[] {
  // 同步加载 config（优先读缓存，其次用 jiti 同步加载 ubean.config.ts）
  const config = loadUbeanConfigSync();

  return [
    ubeanCorePlugin({ config }),
    ...ubeanVite({ config }),
    ubeanIslandsPlugin(),
    ubeanServerActionsPlugin({ root: config.rootDir || process.cwd() })
  ];
}
