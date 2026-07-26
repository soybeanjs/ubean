/**
 * ubean UI Vite 插件
 *
 * 这是 @soybeanjs/ui 的薄封装层，职责：
 * 1. 将 UiResolver 注册到 ubean 的组件自动导入系统
 * 2. 可选将 @soybeanjs/ui/styles.css 注册到客户端入口（默认启用）
 *
 * 组件库本身由 @soybeanjs/ui 提供，本模块不重新导出组件。
 */

import type { Plugin } from 'vite';
import UiResolver from '@soybeanjs/ui/resolver';
import { registerComponentResolver, registerCssImport } from '@ubean/build';
import type { UiOptions } from './types';

/** @soybeanjs/ui 预构建样式路径 */
const SOYBEAN_UI_STYLES = '@soybeanjs/ui/styles.css';

/**
 * ubean UI Vite 插件（@soybeanjs/ui 集成）
 *
 * `ui: true` 即可启用，默认自动注入 styles.css + UiResolver。
 *
 * @example
 * ```ts
 * // ubean.config.ts — 最简启用
 * export default defineConfig({ ui: true });
 *
 * // ubean.config.ts — UnoCSS 模式（不注入 styles.css）
 * export default defineConfig({ ui: { css: false } });
 * ```
 *
 * 通常由 ubean module 系统自动加载，无需在 vite.config.ts 中手动调用。
 */
export function ubeanUiPlugin(options: UiOptions = {}): Plugin[] {
  // 禁用时返回 noop 插件
  if (options.enabled === false) {
    return [{ name: 'ubean:ui:noop', enforce: 'post' }];
  }

  // 注册 UiResolver 到组件自动导入系统
  // ubeanVuePlugin 会从 registry 读取并合并到 unplugin-vue-components 的 resolvers 中
  registerComponentResolver(UiResolver());

  // 注册 CSS 导入（默认 true）
  // ubean 客户端入口虚拟模块会从 registry 读取并注入 import 语句
  if (options.css !== false) {
    registerCssImport(SOYBEAN_UI_STYLES);
  }

  // 返回一个标识性插件（实际工作通过 registry 完成）
  return [
    {
      name: 'ubean:ui',
      enforce: 'pre',
      config() {
        // 确保 @soybeanjs/ui 被 Vite 预构建（dev 模式下避免首次请求延迟）
        return {
          optimizeDeps: {
            include: ['@soybeanjs/ui']
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
