/**
 * ubean UI Vite 插件
 *
 * 这是 @vean/ui 的薄封装层，职责：
 * 1. 将 UiResolver 注册到 ubean 的组件自动导入系统
 * 2. 可选将 @vean/ui/styles.css 注册到客户端入口（默认启用）
 * 3. 将 @vean/theme 的首帧主题脚本注册为 `<head>` 第一个 script（默认启用），
 *    此时 ubean 内置的 `colorMode` 由配置层自动让位
 *
 * 组件库本身由 @vean/ui 提供，本模块不重新导出组件。
 */

export type { UiOptions, UiThemeOptions } from './types';

/**
 * `ui` 是否接管首帧主题脚本。
 *
 * 判据定义在 `@ubean/shared`（与 `@ubean/integrations/ui` 共用同一份实现）—— 两处
 * 判定必须一致，否则会同时注入两份首帧脚本，或两份都不注入。
 */
export { integrationOwnsFirstPaintScript } from '@ubean/shared';

import type { Plugin } from 'vite';
import { registerComponentResolver, registerCssImport, registerHeadScript } from '@ubean/build';
import { createThemeInitScript } from '@vean/theme/ssr';
import UiResolver from '@vean/ui/resolver';
import { integrationOwnsFirstPaintScript } from '@ubean/shared';
import type { UiOptions, UiThemeOptions } from './types';

/** @vean/ui 预构建样式路径 */
const VEAN_UI_STYLES = '@vean/ui/styles.css';

/**
 * 渲染首帧主题脚本（包一层 `<script>` 标签，供 registry 直接注入 `<head>`）。
 *
 * 必须在 `ubeanUiPlugin()` 调用时（而非插件的 `buildStart`）执行 ——
 * `prepareBuild()` 里 `generateVirtualModulesToDisk()` 要读注册表才能生成
 * 服务端 / ssg 入口，而该函数运行在任何 `buildStart` 之前。
 */
function renderThemeScript(options: UiThemeOptions): string {
  const script = createThemeInitScript({
    storageKey: options.storageKey,
    styleId: options.styleId,
    darkSelector: options.darkSelector,
    setColorScheme: options.setColorScheme
  });
  return `<script>${script}</script>`;
}

/**
 * ubean UI Vite 插件（@vean/ui 集成）
 *
 * `ui: true` 即可启用，默认自动注入 styles.css + UiResolver + 首帧主题脚本。
 *
 * @example
 * ```ts
 * // ubean.config.ts — 最简启用
 * export default defineConfig({ ui: true });
 *
 * // ubean.config.ts — UnoCSS 模式（不注入 styles.css）
 * export default defineConfig({ ui: { css: false } });
 *
 * // ubean.config.ts — 换暗色选择器（须与 SConfigProvider theme + @vean/unocss 对齐）
 * export default defineConfig({ ui: { theme: { darkSelector: '.dark' } } });
 *
 * // ubean.config.ts — 退回手动注入首帧脚本（此时 colorMode 可继续使用）
 * export default defineConfig({ ui: { theme: { initScript: false } } });
 * ```
 *
 * 通常由 ubean module 系统自动加载，无需在 vite.config.ts 中手动调用。
 */
export function ubeanUiPlugin(options: UiOptions = {}): Plugin[] {
  // 禁用时返回 noop 插件
  //
  // 注意用的是 `enabled` 而非配置面的 `disabled`：`extractBuiltinOptions()` 已把
  // `disabled` 剥掉，工厂拿到的只有其余选项（被禁用时工厂根本不会被调用）。
  if (options.enabled === false) {
    return [{ name: 'ubean:ui:noop', enforce: 'post' }];
  }

  // 注册 UiResolver 到组件自动导入系统
  // ubeanVite 会从 registry 读取并合并到 unplugin-vue-components 的 resolvers 中
  registerComponentResolver(UiResolver());

  // 注册 CSS 导入（默认 true）
  // ubean 客户端入口虚拟模块会从 registry 读取并注入 import 语句
  if (options.css !== false) {
    registerCssImport(VEAN_UI_STYLES);
  }

  const themeOptions: UiThemeOptions = options.theme === false ? {} : (options.theme ?? {});
  // 与 `@ubean/config` 的 `resolveColorModeOwnership()` 共用同一判据：
  // 这里为真时配置层会把 `colorMode` 置 false，于是 `<head>` 里只有本脚本。
  //
  // 注册就放在工厂里（而不是 `buildStart`）：`prepareBuild()` 的
  // `generateVirtualModulesToDisk()` 要读 registry 才能生成服务端/ssg 入口，
  // 而这一步发生在任何 `buildStart` 之前。`registerHeadScript` 对相同字符串去重，
  // 重复调用（模块被多个环境或多次构建加载）也安全。
  if (integrationOwnsFirstPaintScript({ ui: options })) {
    registerHeadScript(renderThemeScript(themeOptions));
  }

  return [
    {
      name: 'ubean:ui',
      enforce: 'pre',
      config() {
        // 确保 @vean/ui 被 Vite 预构建（dev 模式下避免首次请求延迟）
        return {
          optimizeDeps: {
            include: ['@vean/ui']
          }
        };
      }
    }
  ];
}

/**
 * 类型安全的 UI 配置定义辅助函数（透传）
 */
export function defineUiConfig(options: UiOptions): UiOptions {
  return options;
}

export default ubeanUiPlugin;
