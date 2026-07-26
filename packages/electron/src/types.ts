/**
 * Electron 类型定义
 *
 * 面向 ubean 用户配置，底层实现由 vite-plugin-electron 提供。
 * ubean ElectronOptions 在 ubeanElectronPlugin 内部转换为 vite-plugin-electron/simple 的配置。
 */

import type { InlineConfig } from 'vite';

/** main 进程配置 */
export interface ElectronMainOptions {
  /** main 进程入口文件路径，默认 'electron/main.ts' */
  entry?: string;
  /** 传递给 Vite 的额外配置 */
  vite?: InlineConfig;
}

/** preload 脚本配置 */
export interface ElectronPreloadOptions {
  /** preload 脚本入口文件路径，默认 'electron/preload.ts' */
  input?: string;
  /** 传递给 Vite 的额外配置 */
  vite?: InlineConfig;
}

/** renderer 进程配置（可选，用于在 renderer 中使用 Node.js API） */
export interface ElectronRendererOptions {
  /** 是否在 renderer 中启用 Node.js API */
  nodeIntegration?: boolean;
}

/**
 * ubean Electron 配置选项
 *
 * 用户在 ubean.config.ts 中通过 `electron: true | ElectronOptions` 配置。
 * main/preload 有默认值，`electron: true` 即可启用。
 * 内部由 ubeanElectronPlugin 转换为 vite-plugin-electron/simple 的配置。
 */
export interface ElectronOptions {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** main 进程配置（默认 entry: 'electron/main.ts'） */
  main?: ElectronMainOptions;
  /** preload 脚本配置（默认 input: 'electron/preload.ts'） */
  preload?: ElectronPreloadOptions;
  /** renderer 进程配置（可选） */
  renderer?: ElectronRendererOptions;
}
