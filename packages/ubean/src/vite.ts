/**
 * ubean/vite — 默认 Vite 插件组装入口
 *
 * 将 `@ubean/build`（core + Vue）与 `@ubean/islands` 的 Vite 插件
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
 * 设置全局缓存，`ubeanPlugin()` 命中缓存（包含 CLI 的参数修改）；缓存未命中
 * （直接使用 Vite 时）则在这里异步加载 —— 因此**配置里的顶层 await 在两条路径上都可用**。
 *
 * `ubeanPlugin()` 是 async 的，但调用点照常写 `plugins: [ubeanPlugin()]`：Vite 的
 * `PluginOption` 是 `Thenable<Plugin | … | PluginOption[]>`，插件数组里的 Promise 会在
 * 跑任何钩子之前被 await 掉，所以不需要在 `vite.config.ts` 里 await 它。
 * 需要提前拿到配置（如自建 Vite server、在配置里读 ubean 配置字段）时用
 * `await ensureUbeanConfig()`。
 *
 * 对于需要细粒度控制的场景，可直接从子包导入：
 * - `@ubean/build/vite` → `ubeanPlugin as ubeanCorePlugin`（框架无关）
 * - `@ubean/build/vue` → `ubeanVite`（Vue 专属：页面/入口虚拟模块 + 自动导入）
 * - `@ubean/islands/vite` → `ubeanIslandsPlugin`（Islands SFC transform）
 */

import type { Plugin } from 'vite';
import { ubeanServerActionsPlugin } from '@ubean/build/actions';
import {
  ubeanPlugin as ubeanCorePlugin,
  ubeanDevRequestPlugin,
  createVirtualRegistry,
  DEVTOOLS_PASS_THROUGH_PREFIXES
} from '@ubean/build/vite';
import type { UbeanPluginOptions } from '@ubean/build/vite';
import { ubeanVite } from '@ubean/build/vue';
import type { UbeanViteOptions } from '@ubean/build/vue';
import { ensureUbeanConfig } from '@ubean/config';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export type { UbeanPluginOptions, UbeanViteOptions };

/**
 * 异步加载 `ubean.config.ts` 并写入全局缓存（缓存优先，不重复加载）。
 *
 * `ubeanPlugin()` 内部已经用它，通常无需手动调用；自建 Vite server、或想在 `vite.config.ts`
 * 里先拿到配置字段（如传给其他插件）时才需要。
 */
export { ensureUbeanConfig };

/**
 * ubean 默认 Vite 插件组合（无参数版本）。
 *
 * 返回的数组包含：
 * 1. `ubeanCorePlugin` — 框架无关的核心插件（路由扫描、虚拟模块、宏转换）
 * 2. `ubeanVite` — Vue 专属插件（页面/入口虚拟模块、自动导入、组件解析）
 * 3. `ubeanIslandsPlugin` — Islands 架构插件（SFC 中 `v-client.*` 指令转换）
 * 4. `ubeanServerActionsPlugin` — Server Actions 插件（`defineAction()` 调用转换）
 *
 * **是 async 的**，因为配置在工厂内 `await`（`vite.config.ts` 里照常写
 * `plugins: [ubeanPlugin()]`，不需要 await —— Vite 的 `PluginOption` 是
 * `Thenable<Plugin | … | PluginOption[]>`，插件数组里的 Promise 会在跑任何钩子之前被 await）。
 *
 * 这样做的意义：`ubean.config.ts` 的**顶层 await** 在两条路径上都能解析 ——
 * 裸 Vite（`vite dev` / `vp dev`）与 CLI（`ubean dev` / `build` / `preview`）走同一个入口。
 * 此前工厂必须同步拿配置（jiti 同步模式把配置编译成 CJS，顶层 await 是语法错误），
 * 只有 CLI 路径能用顶层 await，裸 Vite 路径会崩在 `vite.config.ts` 求值阶段。
 *
 * 配置来源始终是 `ubean.config.ts`（不接受参数）。缓存优先：CLI 已加载时直接复用，
 * 既不做二次加载，也不会覆盖 CLI 对 resolved 配置的原地修改。
 *
 * 注：组件级缓存通过 `defineCachedFunction()` 显式调用,无需 Vite 插件参与。
 */
export async function ubeanPlugin(): Promise<Plugin[]> {
  // 异步加载配置（缓存优先；含顶层 await 的配置也能解析）
  const config = await ensureUbeanConfig();

  // RM-V02：core 与 vue 插件共享同一个显式注册表实例，不再依赖模块级单例
  const registry = createVirtualRegistry();

  const plugins: Plugin[] = [
    ubeanCorePlugin({ config, registry }),
    ...ubeanVite({ config, registry }),
    ubeanIslandsPlugin(),
    ubeanServerActionsPlugin({ root: config.rootDir || process.cwd() })
  ];

  // ADR-0012（RM-V36 收敛后为唯一路径）：请求路由归插件，于是 `vite dev` 单独就能服务整个
  // 应用（页面 SSR / API / 内置 `_` 路由 / 404），与 `ubean dev` 行为一致。插件自举的 app 与
  // CLI 的 app 不会并存 —— 显式传入 handler 时插件只用传入的那个。
  //
  // `passThrough` 与 `devtoolsRedirect` 必须在这里给出：DevTools 的命名空间（DTK 外壳
  // `/__devtools*`、SPA `/_devtools*`）都落在保留命名空间里，通用判据会判成应用请求 → 404，
  // 而裸 `/_devtools` 需要 302 到外壳。收敛前这两件事分处 CLI 侧两个插件（靠注册顺序保证），
  // 收敛后插件由用户 `vite.config.ts` 注册 —— 顺序不再由注册点决定，因此都收进请求插件自身
  // （`dev-topology` / `dev-dx` 守着）。
  plugins.push(
    ubeanDevRequestPlugin({
      passThrough: config.devtools?.enabled ? [...DEVTOOLS_PASS_THROUGH_PREFIXES] : [],
      devtoolsRedirect: config.devtools?.enabled === true
    })
  );

  return plugins;
}
