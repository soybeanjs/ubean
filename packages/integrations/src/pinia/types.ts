/**
 * @ubean/integrations/pinia 类型定义
 *
 * Pinia 集成模块的配置选项与运行时类型。
 */

/**
 * Pinia 模块配置选项
 *
 * 用户在 `ubean.config.ts` 中通过 `pinia: true | UbeanPiniaOptions` 配置。
 * `pinia: true` 即可启用,默认开启 Vite 预构建优化。
 *
 * 注意:`pinia: true` 仅启用 Vite 插件(dev 预构建优化),
 * 用户仍需在 `src/app.ts` 中通过 `defineApp` 注册 `createPinia()` 插件
 * 和 `serializePiniaState` / `hydratePiniaState` 钩子以启用 SSR 状态水合。
 *
 * @example
 * ```ts
 * // ubean.config.ts — 最简启用
 * export default defineConfig({ pinia: true });
 *
 * // 显式配置
 * export default defineConfig({
 *   pinia: { optimizeDeps: true }
 * });
 * ```
 */
export interface UbeanPiniaOptions {
  /** 是否启用,默认 true。设为 false 等价于 `pinia: false` */
  enabled?: boolean;
  /**
   * 是否将 `pinia` 加入 Vite 的 `optimizeDeps.include`,默认 true。
   *
   * dev 模式下预构建 pinia 可避免首次请求的依赖扫描延迟。
   * 若你使用了自定义的 pinia 别名或 monorepo 内的 pinia 源码,可设为 false。
   */
  optimizeDeps?: boolean;
}

/**
 * SSR 序列化的 state 对象形状。
 *
 * `serializePiniaState` 返回此对象,`hydratePiniaState` 接收此对象。
 * `pinia` 字段对应 `pinia.state.value`。
 */
export interface PiniaSerializedState {
  /** Pinia 的 root state(`pinia.state.value`) */
  pinia?: Record<string, unknown>;
  /** 允许扩展自定义字段 */
  [key: string]: unknown;
}
