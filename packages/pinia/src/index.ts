/**
 * @ubean/pinia 入口
 *
 * ubean Pinia 集成模块,提供:
 * - `ubeanPiniaPlugin`:Vite 插件(dev 预构建优化)
 * - `serializePiniaState` / `hydratePiniaState`:SSR 状态水合辅助函数
 * - 类型定义:`UbeanPiniaOptions`
 *
 * Pinia 本身请直接从 `pinia` 导入:
 * ```ts
 * import { createPinia, defineStore, storeToRefs } from 'pinia';
 * ```
 *
 * 启用方式(ubean.config.ts):
 * ```ts
 * export default defineConfig({ pinia: true });
 * ```
 *
 * SSR 水合配置(src/app.ts):
 * ```ts
 * import { createPinia } from 'pinia';
 * import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
 *
 * export default defineApp({
 *   plugins: [createPinia()],
 *   serializeState: serializePiniaState,
 *   hydrateState: hydratePiniaState
 * });
 * ```
 */

export { ubeanPiniaPlugin, definePiniaConfig } from './vite';
export { serializePiniaState, hydratePiniaState } from './runtime';

export type { UbeanPiniaOptions, PiniaSerializedState } from './types';
