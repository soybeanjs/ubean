/**
 * ubean PWA Vite 插件
 *
 * 这是 vite-plugin-pwa 的薄封装层,职责:
 * 1. 将 ubean 风格的 PwaOptions 转换为 vite-plugin-pwa 的 VitePluginPWOptions
 * 2. 将 ubean 的 strategies(assets/pages/images/fonts/crossOrigin)转换为 workbox runtimeCaching 默认规则
 * 3. 透传 vite-plugin-pwa 的全部能力(workbox generateSW / injectManifest / dev 模式 / 自动注册)
 *
 * Service Worker 生成、manifest 生成、precache、runtime caching 均由 vite-plugin-pwa + workbox 实现。
 */

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

import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { VitePWAOptions } from 'vite-plugin-pwa';
import { defu } from 'defu';
import type { PwaOptions, CachingStrategy, RuntimeCachingRule } from './types';

// ============== 默认配置 ==============

const DEFAULT_MANIFEST = {
  name: 'Ubean App',
  short_name: 'Ubean',
  start_url: '/',
  scope: '/',
  display: 'standalone' as const,
  background_color: '#ffffff',
  theme_color: '#000000',
  icons: [],
  lang: 'en'
};

const DEFAULT_STRATEGIES = {
  assets: 'cache-first' as CachingStrategy,
  pages: 'network-first' as CachingStrategy,
  images: 'stale-while-revalidate' as CachingStrategy,
  fonts: 'cache-first' as CachingStrategy,
  crossOrigin: 'network-first' as CachingStrategy
};

// ============== strategies → runtimeCaching 转换 ==============

/**
 * 将 ubean 的 strategies(按资源类型)转换为 workbox runtimeCaching 规则。
 * 这些规则作为默认值,放在用户自定义 runtimeCaching 之前。
 */
function strategiesToRuntimeCaching(strategies: {
  assets?: CachingStrategy;
  pages?: CachingStrategy;
  images?: CachingStrategy;
  fonts?: CachingStrategy;
  crossOrigin?: CachingStrategy;
}): RuntimeCachingRule[] {
  const rules: RuntimeCachingRule[] = [];

  if (strategies.assets) {
    rules.push({
      urlPattern: /\.(?:js|css|woff2?|ttf|eot)$/,
      handler: strategies.assets,
      options: { cacheName: 'assets' }
    });
  }

  if (strategies.pages) {
    rules.push({
      urlPattern: /\/$/,
      handler: strategies.pages,
      options: { cacheName: 'pages' }
    });
  }

  if (strategies.images) {
    rules.push({
      urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|avif)$/,
      handler: strategies.images,
      options: {
        cacheName: 'images',
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }
      }
    });
  }

  if (strategies.fonts) {
    rules.push({
      urlPattern: /\.(?:woff2?|ttf|eot|otf)$/,
      handler: strategies.fonts,
      options: {
        cacheName: 'fonts',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
      }
    });
  }

  if (strategies.crossOrigin) {
    rules.push({
      urlPattern: /^https?:\/\/(?!localhost).*/,
      handler: strategies.crossOrigin,
      options: { cacheName: 'cross-origin' }
    });
  }

  return rules;
}

// ============== ubean PwaOptions → vite-plugin-pwa VitePluginPWOptions ==============

/**
 * 将 ubean PwaOptions 转换为 vite-plugin-pwa 的 VitePluginPWOptions。
 *
 * 映射关系:
 * - manifest           → manifest
 * - registerType       → registerType
 * - injectRegister     → injectRegister
 * - devOptions         → devOptions
 * - skipWaiting        → workbox.skipWaiting
 * - clientsClaim       → workbox.clientsClaim
 * - cleanupOutdatedCaches → workbox.cleanupOutdatedCaches
 * - strategies + runtimeCaching → workbox.runtimeCaching
 * - injectManifest + swSrc → strategies: 'injectManifest' + injectManifest.swSrc
 */
export function toVitePwaOptions(options: PwaOptions = {}): VitePWAOptions {
  const {
    enabled = true,
    manifest,
    registerType = 'autoUpdate',
    injectRegister = 'auto',
    devOptions,
    strategies,
    runtimeCaching = [],
    skipWaiting = true,
    clientsClaim = true,
    cleanupOutdatedCaches = true,
    injectManifest = false,
    swSrc
  } = options;

  if (!enabled) {
    // vite-plugin-pwa disable 开关
    return { disable: true } as VitePWAOptions;
  }

  // 合并默认 manifest
  const resolvedManifest = defu(manifest ?? {}, DEFAULT_MANIFEST);

  // 合并默认 strategies
  const resolvedStrategies = defu(strategies ?? {}, DEFAULT_STRATEGIES);

  // strategies → runtimeCaching(默认规则在前,用户自定义在后)
  const defaultRules = strategiesToRuntimeCaching(resolvedStrategies);
  const allRuntimeCaching = [...defaultRules, ...runtimeCaching];

  if (injectManifest) {
    // injectManifest 策略:用户自定义 SW 源
    return {
      strategies: 'injectManifest',
      registerType,
      injectRegister: injectRegister ?? undefined,
      manifest: resolvedManifest,
      devOptions,
      injectManifest: {
        swSrc: swSrc ?? 'src/sw.ts',
        skipWaiting,
        clientsClaim,
        cleanupOutdatedCaches,
        runtimeCaching: allRuntimeCaching
      }
    } as unknown as VitePWAOptions;
  }

  // generateSW 策略(默认):vite-plugin-pwa + workbox 自动生成 sw.js
  return {
    strategies: 'generateSW',
    registerType,
    injectRegister: injectRegister ?? undefined,
    manifest: resolvedManifest,
    devOptions,
    workbox: {
      skipWaiting,
      clientsClaim,
      cleanupOutdatedCaches,
      runtimeCaching: allRuntimeCaching
    }
  } as unknown as VitePWAOptions;
}

// ============== ubean PWA Vite 插件 ==============

/**
 * ubean PWA Vite 插件(基于 vite-plugin-pwa)
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { ubeanPwaPlugin } from '@ubean/integrations/pwa';
 *
 * export default defineConfig({
 *   plugins: [
 *     ubeanPwaPlugin({
 *       manifest: { name: 'My App', theme_color: '#ff0000' },
 *       registerType: 'prompt'
 *     })
 *   ]
 * });
 * ```
 *
 * 通常由 ubean module 系统在 `ubean.config.ts` 中 `pwa: true | PwaOptions` 自动加载,
 * 无需在 vite.config.ts 中手动调用。
 */
export function ubeanPwaPlugin(options: PwaOptions = {}): Plugin {
  // 禁用时直接返回 noop,不调用 VitePWA(避免引入不必要的插件钩子)
  if (options.enabled === false) {
    return {
      name: 'ubean:pwa:noop',
      enforce: 'post'
    };
  }

  const vitePwaOptions = toVitePwaOptions(options);

  // VitePWA 返回 Plugin 或 Plugin[],这里扁平化为单个 Plugin
  const plugins = VitePWA(vitePwaOptions);
  const plugin = Array.isArray(plugins) ? plugins[0] : plugins;

  if (!plugin) {
    // 极端情况:VitePWA 返回空数组,返回 no-op 插件
    return {
      name: 'ubean:pwa:noop',
      enforce: 'post'
    };
  }

  // 重命名插件,便于在 vite 插件列表中识别
  return {
    ...plugin,
    name: `ubean:pwa(${plugin.name})`
  };
}

/**
 * 类型安全的 PWA 配置定义辅助函数(透传)
 */
export function definePwaConfig(options: PwaOptions): PwaOptions {
  return options;
}

export default ubeanPwaPlugin;
