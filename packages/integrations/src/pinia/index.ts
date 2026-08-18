/**
 * ubean Pinia Vite 插件
 *
 * 这是 Pinia 的薄封装层,职责:
 * 1. 将 `pinia` 加入 Vite 的 `optimizeDeps.include`(dev 模式预构建优化)
 * 2. 标识性 Vite 插件(实际 SSR 水合工作通过 `runtime.ts` 的辅助函数完成)
 *
 * Pinia 本身由 `pinia` 包提供,本模块不重新导出 pinia API。
 * 用户需自行 `import { createPinia, defineStore } from 'pinia'`。
 *
 * 启用方式(ubean.config.ts):
 * ```ts
 * export default defineConfig({ pinia: true });
 * ```
 *
 * 然后在 `src/app.ts` 中配置 SSR 水合:
 * ```ts
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

export type { UbeanPiniaOptions, PiniaSerializedState } from './types';

import type { Plugin } from 'vite';
import type { UbeanPiniaOptions } from './types';

/**
 * ubean Pinia Vite 插件
 *
 * @param options 配置选项(`pinia: true` 时传入 `{}`,`pinia: { ... }` 时传入该对象)
 * @returns Vite 插件数组
 */
export function ubeanPiniaPlugin(options: UbeanPiniaOptions = {}): Plugin[] {
  // 禁用时返回 noop 插件
  if (options.enabled === false) {
    return [{ name: 'ubean:pinia:noop', enforce: 'post' }];
  }

  const optimizeDeps = options.optimizeDeps !== false;

  return [
    {
      name: 'ubean:pinia',
      enforce: 'pre',
      config() {
        if (!optimizeDeps) return undefined;
        return {
          optimizeDeps: {
            include: ['pinia']
          }
        };
      }
    }
  ];
}

/**
 * 类型安全的 Pinia 配置定义辅助函数(透传)
 */
export function definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions {
  return options;
}

export default ubeanPiniaPlugin;
