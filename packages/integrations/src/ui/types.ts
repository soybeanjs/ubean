/**
 * @ubean/integrations/ui 类型定义
 *
 * ubean UI 模块的配置选项。
 * 底层组件库为 @vean/ui，本模块负责：
 * 1. 注入 UiResolver 到 unplugin-vue-components（组件自动导入）
 * 2. 可选注入 @vean/ui/styles.css（预构建样式）
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
 * // 使用 UnoCSS 模式（不注入 styles.css，由用户自行配置 @vean/unocss）
 * export default defineConfig({ ui: { css: false } });
 * ```
 */
/**
 * `@vean/theme` 首帧脚本的选项。
 *
 * 必须与 `SConfigProvider` 的 `theme` props / `@vean/unocss` 的 `darkSelector`
 * 保持一致 —— 脚本切错的 class 不会报错，只会静默不生效。
 */
export interface UiThemeOptions {
  /**
   * 注入 `@vean/theme` 的 `createThemeInitScript` 作为 `<head>` 第一个脚本，
   * 免去项目手动 `useHead()` 注入。默认 true。
   *
   * 默认开启时 ubean 内置的 `colorMode` 会被强制关闭（两套首帧脚本互斥）。
   */
  initScript?: boolean;
  /**
   * 暗色模式的表达方式，默认 `'class'`（即 `.dark`）。
   *
   * - `'class'`：切换 `.dark` 类（`@vean/unocss` preset 的默认值）
   * - `'media'`：跟随 `prefers-color-scheme`
   * - `'.xxx'` / `'[data-theme="dark"]'`：自定义选择器
   */
  darkSelector?: 'class' | 'media' | string;
  /** 主题信封的 localStorage key，默认 `__VEAN_THEME`。 */
  storageKey?: string;
  /** 首帧脚本打补丁的 `<style>` 元素 id，默认 `vean-theme`。 */
  styleId?: string;
  /**
   * 脚本是否同时写 `documentElement.style.colorScheme`，默认 true。
   * 关掉会让滚动条 / 表单控件 / autofill 在暗色下仍是亮色。
   */
  setColorScheme?: boolean;
}

export interface UiOptions {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /**
   * 是否自动注入 `@vean/ui/styles.css`，默认 true。
   *
   * - `true`（默认）：自动注入预构建样式，零配置开箱即用
   * - `false`：不注入样式，用户需自行配置 UnoCSS + `@vean/unocss` preset
   */
  css?: boolean;
  /**
   * 首帧主题脚本（`@vean/theme/createThemeInitScript`）的注入选项。
   *
   * 默认注入，且此时 ubean 的 `colorMode` 自动关闭 —— vean 的主题引擎完全接管
   * 首帧淡入淡出。传 `{ initScript: false }` 可退回手动注入。
   */
  theme?: UiThemeOptions | false;
}
