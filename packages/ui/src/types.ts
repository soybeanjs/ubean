/**
 * @ubean/ui 类型定义
 *
 * ubean UI 模块的配置选项。
 * 底层组件库为 @soybeanjs/ui，本模块负责：
 * 1. 注入 UiResolver 到 unplugin-vue-components（组件自动导入）
 * 2. 可选注入 @soybeanjs/ui/styles.css（预构建样式）
 */

/**
 * UI 模块配置选项
 *
 * 用户在 ubean.config.ts 中通过 `ui: true | UiOptions` 配置。
 * `ui: true` 即可启用，默认自动注入 styles.css。
 *
 * @example
 * ```ts
 * // 最简启用（含 styles.css）
 * export default defineConfig({ ui: true });
 *
 * // 使用 UnoCSS 模式（不注入 styles.css，由用户自行配置 @soybeanjs/unocss-shadcn）
 * export default defineConfig({ ui: { css: false } });
 * ```
 */
export interface UiOptions {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /**
   * 是否自动注入 `@soybeanjs/ui/styles.css`，默认 true。
   *
   * - `true`（默认）：自动注入预构建样式，零配置开箱即用
   * - `false`：不注入样式，用户需自行配置 UnoCSS + `@soybeanjs/unocss-shadcn` preset
   */
  css?: boolean;
}
