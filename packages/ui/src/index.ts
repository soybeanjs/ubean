/**
 * @ubean/ui 入口
 *
 * ubean UI 模块，基于 @soybeanjs/ui 提供：
 * - ubeanUiPlugin: 注册 UiResolver + 自动注入 styles.css 的 Vite 插件
 * - 类型定义：UiOptions
 *
 * 组件库本身请直接从 @soybeanjs/ui 导入：
 * ```ts
 * import { SButton, SInput, SConfigProvider } from '@soybeanjs/ui';
 * ```
 *
 * 启用方式（ubean.config.ts）：
 * ```ts
 * export default defineConfig({ ui: true });
 * ```
 */

export { ubeanUiPlugin, defineUiConfig } from './vite';

export type { UiOptions } from './types';
