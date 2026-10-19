/**
 * 首帧主题脚本的归属判据。
 *
 * 两个消费者必须得到**同一个答案**，否则 `<head>` 里会同时出现两份互相抵消的脚本
 * （ubean 写 `.dark-mode`，`@vean/theme` 写 `.dark`，UnoCSS 只认后者）：
 *
 * - `@ubean/integrations/ui` 的 `ubeanUiPlugin()` —— 为真时 `registerHeadScript()`
 * - `@ubean/config` 的 `resolveColorModeOwnership()` —— 为真时把 `colorMode` 置 `false`
 *
 * 放在 `@ubean/shared`（两侧都已有的依赖，且浏览器安全）而不是任一侧：
 * `@ubean/config` 不能依赖 `@ubean/build`（`./ui` 子路径静态 import 它），
 * 而 `@ubean/build` 又不该知道 vean 的存在。
 */

/** 判定只看 `ui` 字段，避免把整个 `ResolvedConfig` 拖进类型依赖。 */
export interface FirstPaintOwnerConfig {
  ui?: boolean | { disabled?: boolean; theme?: false | { initScript?: boolean } } | undefined;
}

/**
 * `ui` 是否接管首帧主题脚本。
 *
 * 默认接管（`ui: true` / `ui: {}` / `ui: { css: false }` 都算）。只有三种情况让位：
 * - `ui` 未启用（`false` / `undefined`）
 * - `ui.disabled === true`
 * - `ui.theme === false` 或 `ui.theme.initScript === false`（显式手动注入）
 */
export function integrationOwnsFirstPaintScript(config: FirstPaintOwnerConfig): boolean {
  const ui = config.ui;
  if (ui === false || ui === undefined) return false;
  if (ui === true) return true;

  const options = ui as { disabled?: boolean; theme?: false | { initScript?: boolean } };
  if (options.disabled === true) return false;
  if (options.theme === false) return false;
  if (typeof options.theme === 'object' && options.theme !== null && options.theme.initScript === false) return false;
  return true;
}
