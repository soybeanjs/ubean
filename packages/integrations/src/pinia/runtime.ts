/**
 * @ubean/integrations/pinia 运行时
 *
 * 提供 SSR 状态序列化/水合的辅助函数,供 `defineApp` 使用。
 *
 * 这些函数是框架无关的纯函数,直接操作 Vue app 实例上的 `$pinia` 全局属性。
 * 它们与 ubean 的 `defineApp({ serializeState, hydrateState })` 钩子配合使用。
 *
 * @example
 * ```ts
 * // src/app.ts
 * import { createPinia } from 'pinia';
 * import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
 *
 * export default defineApp({
 *   plugins: [createPinia()],
 *   serializeState: serializePiniaState,
 *   hydrateState: hydratePiniaState
 * });
 * ```
 */

import type { App } from 'vue';
import type { PiniaSerializedState } from './types';

/**
 * Pinia 实例在 Vue app 上的挂载位置。
 *
 * `createPinia()` 安装时会设置 `app.config.globalProperties.$pinia`,
 * 同时也会 `app.provide(piniaSymbol, pinia)`。
 * 这里通过 `globalProperties.$pinia` 访问,避免依赖 pinia 内部的 symbol。
 */
interface PiniaLike {
  state: { value: Record<string, unknown> };
}

function getPiniaFromApp(app: App): PiniaLike | null {
  // pinia 安装后会挂载到 app.config.globalProperties.$pinia
  // (见 pinia 源码 createPinia() → app.config.globalProperties.$pinia = pinia)
  const pinia = (app.config.globalProperties as { $pinia?: PiniaLike }).$pinia;
  return pinia ?? null;
}

/**
 * SSR 序列化:从 Vue app 实例提取 Pinia 的 root state。
 *
 * 在服务端 `renderToString(app)` 完成后由 ubean SSR 渲染器调用。
 * 返回的 `{ pinia }` 会被序列化到 HTML 的 `__UBEAN_STATE__` script 标签中。
 *
 * 若 app 上未检测到 `$pinia`(未安装 pinia 插件),返回空对象,
 * 不会抛出错误(允许在部分页面不使用 pinia)。
 *
 * @param app Vue app 实例(SSR 渲染用的 app)
 * @returns 序列化后的状态对象,包含 `pinia.state.value`
 */
export function serializePiniaState(app: App): PiniaSerializedState {
  const pinia = getPiniaFromApp(app);
  if (!pinia) {
    return {};
  }
  // 深拷贝 state.value,避免后续修改影响序列化结果
  // (pinia.state.value 是响应式对象,JSON.stringify 会自动解包)
  return { pinia: JSON.parse(JSON.stringify(pinia.state.value)) };
}

/**
 * 客户端水合:将 SSR 序列化的 state 注入到 Pinia 实例。
 *
 * 在 `applyAppConfig`(注册 `createPinia()` 插件)之后、`app.mount()` 之前调用。
 * 必须在 mount 前执行,否则 store 已用默认 state 初始化,水合无效。
 *
 * 若 `state` 为 `null` 或不含 `pinia` 字段,直接返回(no-op),
 * 允许在 CSR 模式或无 SSR state 时安全调用。
 *
 * @param app Vue app 实例(客户端 app,已 install pinia 插件)
 * @param state 从 `__UBEAN_STATE__` 反序列化的状态对象,或 null
 */
export function hydratePiniaState(app: App, state: Record<string, unknown> | null): void {
  if (!state) return;
  const piniaState = (state as PiniaSerializedState).pinia;
  if (!piniaState || typeof piniaState !== 'object') return;

  const pinia = getPiniaFromApp(app);
  if (!pinia) {
    // 用户配置了 hydrateState 但未注册 createPinia() 插件,
    // 这是一个常见的配置错误,给出明确警告
    console.warn(
      '[ubean/pinia] hydrateState 被调用但 app 上未检测到 $pinia。' +
        '请确保 defineApp({ plugins: [createPinia()] }) 已配置。'
    );
    return;
  }

  // 直接赋值 state.value —— pinia 会自动将其转为响应式
  // (参考 pinia 官方 SSR 文档:pinia.state.value = JSON.parse(window.__pinia))
  pinia.state.value = piniaState;
}

export type { PiniaSerializedState } from './types';
