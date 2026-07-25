/**
 * @ubean/core/vite — 默认 Vite 插件组装入口
 *
 * 将 `@ubean/build`、`@ubean/vite`、`@ubean/islands` 三个 Vite 插件
 * 组合为单一 `ubeanPlugin` 入口,对应原 `ubean` 包 `ubeanPlugin` 的行为。
 *
 * 消费者通常在 `vite.config.ts` 中使用:
 * ```ts
 * import { defineConfig } from 'vite-plus';
 * import { ubeanPlugin } from '@ubean/core/vite';
 *
 * export default defineConfig({
 *   plugins: [ubeanPlugin()]
 * });
 * ```
 *
 * 对于需要细粒度控制的场景,可直接从子包导入:
 * - `@ubean/build/vite` → `ubeanPlugin as ubeanCorePlugin`(框架无关)
 * - `@ubean/vite` → `ubeanVuePlugin`(Vue 专属:页面/入口虚拟模块 + 自动导入)
 * - `@ubean/islands/vite` → `ubeanIslandsPlugin`(Islands SFC transform)
 */

import type { Plugin } from 'vite';
import { ubeanPlugin as ubeanCorePlugin } from '@ubean/build/vite';
import type { UbeanPluginOptions } from '@ubean/build/vite';
import { tryGetConfig, loadUbeanConfig } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';
import { ubeanVuePlugin } from '@ubean/vite';
import type { UbeanVuePluginOptions } from '@ubean/vite';

export type { UbeanPluginOptions, UbeanVuePluginOptions };

/**
 * ubean 默认 Vite 插件组合。
 *
 * 返回一个扁平的 `Plugin[]`,包含:
 * 1. `ubeanCorePlugin` — 框架无关的核心插件(路由扫描、虚拟模块、宏转换)
 * 2. `ubeanVuePlugin` — Vue 专属插件(页面/入口虚拟模块、自动导入、组件解析)
 * 3. `ubeanIslandsPlugin` — Islands 架构插件(SFC 中 `client:*` 指令转换)
 *
 * Config 解析顺序:
 * 1. 显式传入的 `options.config`
 * 2. `tryGetConfig()` 返回的全局缓存(CLI `dev`/`build` 命令已加载时可用)
 * 3. 同步 `loadUbeanConfig()`(仅在以上两者均未命中时调用)
 *
 * 注意:此函数返回 `Plugin[]`,消费者可直接展开使用 `...ubeanPlugin()`,
 * 也可以整体作为一个数组传入 `plugins` 字段。
 */
export function ubeanPlugin(options: UbeanPluginOptions & Partial<UbeanVuePluginOptions> = {}): Plugin[] {
  // Config 解析:Vue 插件要求同步可用,因此此处需尽力同步获取
  let config = options.config ?? tryGetConfig();

  if (!config) {
    // tryGetConfig 未命中时,同步加载一次(结果会被缓存,后续 tryGetConfig 可用)
    // 注意:loadUbeanConfig 本身是异步的,但内部 c12 在同步路径下也能完成
    // 这里用 void 消费 Promise,buildStart 会再次校验
    config = loadUbeanConfigSync();
  }

  if (!config) {
    throw new Error(
      '[ubean] ubeanPlugin requires a resolved config. ' +
        'Pass it explicitly: `ubeanPlugin({ config: await loadUbeanConfig() })`, ' +
        'or use the individual plugins from @ubean/build/vite (auto-loads config in buildStart).'
    );
  }

  return [ubeanCorePlugin({ config }), ...ubeanVuePlugin({ config, ssr: options.ssr }), ubeanIslandsPlugin()];
}

/**
 * 同步加载 ubean 配置的兜底工具。
 *
 * `loadUbeanConfig` 是异步的,但在大多数场景下 c12 已经缓存了配置
 * (CLI 命令在调用 vite 之前已加载),`tryGetConfig` 会命中。
 * 此函数仅在 `tryGetConfig` 未命中时尝试同步触发加载并返回缓存结果,
 * 若仍不可用则返回 undefined(由调用方决定是否抛错)。
 */
function loadUbeanConfigSync(): ReturnType<typeof tryGetConfig> {
  try {
    // 触发异步加载(不 await),随后立刻读缓存
    void loadUbeanConfig();
    return tryGetConfig();
  } catch {
    return null;
  }
}
