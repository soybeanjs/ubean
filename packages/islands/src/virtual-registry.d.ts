/**
 * `virtual:ubean-islands-registry` 的 TypeScript 类型声明。
 *
 * 此虚拟模块由 `ubeanIslandsPlugin` 在构建/开发期生成,导出扫描到的 island 组件注册表。
 * 自动注册机制详见站点指南 [Islands](/guide/islands)（Automatic Hydration 一节）。
 *
 * 用户项目通常无需手动引用此声明 —— 只要 `tsconfig.json` 的 `include` 涵盖了
 * `node_modules/@ubean/islands/dist/**`,TypeScript 会自动发现此 ambient 声明。
 * 若未自动发现,可在项目的 `env.d.ts` 中添加:
 * ```ts
 * /// <reference types="@ubean/islands" />
 * ```
 * 或手动声明 `declare module 'virtual:ubean-islands-registry'`。
 */
declare module 'virtual:ubean-islands-registry' {
  import type { Component } from 'vue';
  /**
   * 自动扫描得到的 island 组件注册表。
   *
   * - key:模板中使用的组件标签名(如 `<IslandCounter client:load />` 中的 `IslandCounter`)
   * - value:对应的 Vue 组件(可能是同步组件或返回 Promise 的懒加载函数)
   *
   * 当未扫描到任何 island 组件时,导出空对象 `{}`。
   */
  export const islands: Record<string, Component | (() => Promise<Component>)>;
}
