/**
 * @ubean/pwa 入口
 *
 * PWA 底层实现由 vite-plugin-pwa + workbox 提供。
 * 本包提供:
 * - ubeanPwaPlugin: ubean 风格配置的 Vite 插件(包装 vite-plugin-pwa)
 * - usePwa: Vue composable,响应式 PWA 状态
 * - 类型定义:PwaOptions / PwaState / WebAppManifest 等
 */

export { ubeanPwaPlugin, definePwaConfig, toVitePwaOptions } from './vite';

export { registerSW, updateSW, getSWRegistration, usePwa } from './runtime';

export type {
  PwaOptions,
  WebAppManifest,
  ManifestIcon,
  ManifestScreenshot,
  DisplayMode,
  ManifestOrientation,
  CachingStrategy,
  RuntimeCachingRule,
  UsePwaOptions,
  PwaState
} from './types';
