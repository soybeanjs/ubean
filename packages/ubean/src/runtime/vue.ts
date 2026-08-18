/**
 * ubean/runtime/vue — 浏览器端 Vue 客户端运行时入口(兼容别名)
 *
 * 客户端内核已提升为独立包 `@ubean/client`;新代码请优先使用
 * `ubean/client` 子路径(或独立 SPA 直接依赖 `@ubean/client` 包)。
 * 此入口保留以兼容既有导入与脚手架产物,导出面完全一致。
 *
 * ```ts
 * import { defineApp, hydrateIslands, useRouter, useHead, Link, PageView } from 'ubean/runtime/vue';
 * ```
 *
 * ## Islands 自动注册
 *
 * 此入口覆盖了 `hydrateIslands`,在调用前自动从
 * `virtual:ubean-islands-registry` 导入由 Vite 插件扫描生成的 island 组件注册表,
 * 并与用户手动传入的 `components` 合并(手动优先)。
 *
 * 用户因此无需在 `app.ts` 中维护 `components` map:
 * ```ts
 * // app.ts —— 零注册
 * export default defineApp({
 *   onClientReady: app => {
 *     hydrateIslands({ appContext: app });
 *   }
 * });
 * ```
 *
 * 仍可通过 `components` 参数手动补充边缘场景(全局注册、动态 import 等)。
 */
import type { Component } from 'vue';
import { hydrateIslands as _hydrateIslands } from '@ubean/islands/runtime';
import type { HydrateIslandsOptions } from '@ubean/islands/runtime';
// 从 Vite 虚拟模块导入自动注册表(由 `ubeanIslandsPlugin` 在构建/开发期生成)。
// 此 import 在 ubean 包构建时被标记为 external(`neverBundle: /^virtual:/`),
// 留待用户项目的 Vite 解析。若未启用 islands 插件,该模块不存在 → import 失败,
// 但此入口仅由客户端代码使用,而客户端必然包含 islands 插件(默认 `ubeanPlugin()` 的一部分)。
import { islands as autoIslands } from 'virtual:ubean-islands-registry';

export * from '@ubean/client';
// P9-02: Server Actions client runtime (callAction, useAction, useFormAction).
// Re-exported here so client code can auto-import from `ubean/runtime/vue`
// alongside other Vue composables, without pulling server-side code.
export { callAction, useAction, useFormAction } from '@ubean/actions/runtime';
export type { UseActionReturn, UseFormActionReturn } from '@ubean/actions/runtime';

/**
 * `hydrateIslands` 的桥接版本:自动合并虚拟注册表与手动 `components`。
 *
 * 合并优先级:手动注册 > 自动注册(允许用户对特定组件做特殊处理)。
 */
export function hydrateIslands(
  options: Omit<HydrateIslandsOptions, 'components'> & {
    components?: Record<string, Component | (() => Promise<Component>)>;
  } = {}
): void {
  const { components: manual = {}, ...rest } = options;
  // 手动注册覆盖自动注册(同名组件以手动传入的为准)
  const components: Record<string, Component | (() => Promise<Component>)> = {
    ...autoIslands,
    ...manual
  };
  return _hydrateIslands({ components, ...rest });
}
