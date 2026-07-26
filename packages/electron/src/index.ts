/**
 * @ubean/electron 入口
 *
 * Electron 底层实现由 vite-plugin-electron 提供。
 * 本包提供：
 * - ubeanElectronPlugin: ubean 风格配置的 Vite 插件（包装 vite-plugin-electron/simple）
 * - 类型定义：ElectronOptions / ElectronMainOptions / ElectronPreloadOptions 等
 */

export { ubeanElectronPlugin, defineElectronConfig } from './vite';

export { DEFAULT_MAIN_ENTRY, DEFAULT_PRELOAD_INPUT } from './constant';

export type { ElectronOptions, ElectronMainOptions, ElectronPreloadOptions, ElectronRendererOptions } from './types';
