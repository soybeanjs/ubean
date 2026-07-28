/**
 * ubean 包内部的虚拟模块类型声明。
 *
 * `src/runtime/vue.ts` 中的桥接 `hydrateIslands` 从 `virtual:ubean-islands-registry`
 * 导入自动注册表。该虚拟模块由用户项目的 `ubeanIslandsPlugin` 生成,ubean 包构建时
 * 将其标记为 external(`neverBundle: /^virtual:/`),因此此处的 `declare module`
 * 仅用于 ubean 包自身的类型检查。
 *
 * 对外发布的类型声明由 `@ubean/islands` 包提供(`@ubean/islands/src/virtual-registry.d.ts`),
 * 用户项目通过 `node_modules/@ubean/islands/dist/virtual-registry.d.ts` 自动获取。
 */
declare module 'virtual:ubean-islands-registry' {
  import type { Component } from 'vue';
  export const islands: Record<string, Component | (() => Promise<Component>)>;
}
