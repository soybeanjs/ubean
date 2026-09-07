/**
 * ubean/client — 一等客户端入口(re-export `@ubean/client` 内核)。
 *
 * 面向两类消费者:
 * 1. 框架虚拟模块(`virtual:ubean-app` 等)的统一导入点;
 * 2. 用户客户端代码(`import { setLocale } from 'ubean/client'`)。
 *
 * 在 `@ubean/client` 内核之上额外提供:
 * - `createServerHead` — 框架的 SSR 构建会加载同一份 `virtual:ubean-app` 模块
 *   (执行 `createSSRApp` 分支),需要服务端 head 工厂;
 * - Server Actions 客户端运行时(`callAction`/`useAction`/`useFormAction`/`invokeServerFn`,
 *   来自浏览器安全的 `@ubean/routes/runtime`);
 * - `hydrateIslands` 桥接版 — 自动合并 `virtual:ubean-islands-registry`
 *   (由 islands Vite 插件扫描生成,空表时导出空对象,import 恒可解析)。
 *
 * 独立 SPA 场景请直接依赖 `@ubean/client` 包(不含上述框架桥接,无任何 server 符号)。
 */
import type { Component } from 'vue';
import { hydrateIslands as _hydrateIslands } from '@ubean/islands/runtime';
import type { HydrateIslandsOptions } from '@ubean/islands/runtime';
// 从 Vite 虚拟模块导入自动注册表(由 `ubeanIslandsPlugin` 在构建/开发期生成;
// 未启用 islands 时插件仍注册该虚拟模块 → 导出空表)。此 import 在 ubean 包
// 构建时被标记为 external(`neverBundle: /^virtual:/`),留待用户项目的 Vite 解析。
import { islands as autoIslands } from 'virtual:ubean-islands-registry';

export * from '@ubean/client';
// Server Actions client runtime (callAction, useAction, useFormAction, invokeServerFn)。
// `@ubean/routes/runtime` 是浏览器安全模块(仅依赖 vue + @ubean/shared)。
export { callAction, useAction, useFormAction, invokeServerFn } from '@ubean/routes/runtime';
export type { UseActionReturn, UseFormActionReturn } from '@ubean/routes/runtime';

export { createHead as createServerHead } from '@unhead/vue/server';

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
