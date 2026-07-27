/**
 * ubean Electron Vite 插件
 *
 * 这是 vite-plugin-electron 的薄封装层，职责：
 * 1. 将 ubean 风格的 ElectronOptions 转换为 vite-plugin-electron/simple 的配置
 * 2. 透传 vite-plugin-electron 的全部能力（Hot Restart / Hot Reload / HMR / 自动启动）
 * 3. 在 Vite closeBundle hook 中自动执行 `electron .` 启动桌面应用
 *
 * Electron main/preload 构建、进程管理、HMR 均由 vite-plugin-electron 实现。
 */

import type { Plugin } from 'vite';
import electron from 'vite-plugin-electron/simple';
import { DEFAULT_MAIN_ENTRY, DEFAULT_PRELOAD_INPUT } from './constant';
import type { ElectronOptions } from './types';

/**
 * ubean Electron Vite 插件（基于 vite-plugin-electron）
 *
 * main/preload 有默认值，最简配置只需 `electron: true`。
 *
 * @example
 * ```ts
 * // ubean.config.ts — 最简启用
 * export default defineConfig({ electron: true });
 *
 * // ubean.config.ts — 自定义入口
 * export default defineConfig({
 *   electron: {
 *     main: { entry: 'electron/main.ts' },
 *     preload: { input: 'electron/preload.ts' }
 *   }
 * });
 * ```
 *
 * 通常由 ubean module 系统自动加载，无需在 vite.config.ts 中手动调用。
 */
export async function ubeanElectronPlugin(options: ElectronOptions = {}): Promise<Plugin[]> {
  // 禁用时返回 noop 插件
  if (options.enabled === false) {
    return [{ name: 'ubean:electron:noop', enforce: 'post' }];
  }

  const mainEntry = options.main?.entry ?? DEFAULT_MAIN_ENTRY;
  const preloadInput = options.preload?.input ?? DEFAULT_PRELOAD_INPUT;

  // renderer 仅在显式配置时传入 — 否则 vite-plugin-electron/simple 会要求
  // 安装 vite-plugin-electron-renderer（仅在 renderer 进程使用 Node.js API 时才需要）
  const electronConfig: Parameters<typeof electron>[0] = {
    main: {
      entry: mainEntry,
      ...options.main?.vite
    },
    preload: {
      input: preloadInput,
      ...options.preload?.vite
    }
  };
  if (options.renderer) {
    electronConfig.renderer = options.renderer;
  }

  // vite-plugin-electron/simple 的 electronSimple 是 async 函数，必须 await
  const plugins = await electron(electronConfig);

  // vite-plugin-electron/simple 返回 Plugin[]，重命名便于识别
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins];

  return pluginArray.map(p => ({
    ...p,
    name: p.name?.startsWith('ubean:') ? p.name : `ubean:electron(${p.name ?? 'unknown'})`
  }));
}

/**
 * 类型安全的 Electron 配置定义辅助函数（透传）
 */
export function defineElectronConfig(options: ElectronOptions): ElectronOptions {
  return options;
}

export default ubeanElectronPlugin;
