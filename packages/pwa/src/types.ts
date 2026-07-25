/**
 * PWA 类型定义
 *
 * 这些类型面向 ubean 用户配置,PWA 底层实现由 vite-plugin-pwa 提供。
 * ubean PwaOptions 在 ubeanPwaPlugin 内部转换为 vite-plugin-pwa 的 VitePluginPWOptions。
 */

// ============== Web App Manifest 类型 ==============

export type DisplayMode = 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';

export type ManifestOrientation =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

export interface ManifestScreenshot {
  src: string;
  sizes: string;
  type?: string;
  form_factor?: 'narrow' | 'wide';
}

export interface WebAppManifest {
  name: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: DisplayMode;
  orientation?: ManifestOrientation;
  background_color?: string;
  theme_color?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  icons?: ManifestIcon[];
  screenshots?: ManifestScreenshot[];
  categories?: string[];
  shortcuts?: Array<{
    name: string;
    short_name?: string;
    description?: string;
    url: string;
    icons?: ManifestIcon[];
  }>;
}

// ============== 缓存策略类型 ==============

export type CachingStrategy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only'
  | 'cache-only';

export interface RuntimeCachingRule {
  urlPattern: string | RegExp | ((ctx: { request: Request }) => boolean);
  handler: CachingStrategy;
  method?: string;
  options?: {
    cacheName?: string;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
    };
    cacheableResponse?: {
      statuses?: number[];
      headers?: Record<string, string>;
    };
  };
}

// ============== ubean PWA 配置 ==============

/**
 * ubean PWA 配置选项
 *
 * 用户在 ubean.config.ts 中通过 `pwa: true | PwaOptions` 配置。
 * 内部由 ubeanPwaPlugin 转换为 vite-plugin-pwa 的 VitePluginPWOptions。
 */
export interface PwaOptions {
  /** 是否启用 PWA,默认 true */
  enabled?: boolean;
  /** Web App Manifest 配置 */
  manifest?: Partial<WebAppManifest> & {
    name: string;
  };
  /** 注册类型:autoUpdate(自动更新)| prompt(提示用户)| manual(手动),默认 autoUpdate */
  registerType?: 'autoUpdate' | 'prompt' | 'manual';
  /** 自动注入 SW 注册脚本:auto | script | inline | null(禁用),默认 auto */
  injectRegister?: 'auto' | 'script' | 'inline' | null;
  /** dev 模式选项 */
  devOptions?: {
    enabled?: boolean;
    suppressWarnings?: boolean;
  };
  /**
   * 按资源类型配置默认缓存策略,会转换为 workbox runtimeCaching 规则。
   * 与 runtimeCaching 合并:默认规则在前,用户自定义规则在后。
   */
  strategies?: {
    assets?: CachingStrategy;
    pages?: CachingStrategy;
    images?: CachingStrategy;
    fonts?: CachingStrategy;
    crossOrigin?: CachingStrategy;
  };
  /** 自定义 workbox runtimeCaching 规则(追加到默认规则之后) */
  runtimeCaching?: RuntimeCachingRule[];
  /** workbox.skipWaiting,默认 true */
  skipWaiting?: boolean;
  /** workbox.clientsClaim,默认 true */
  clientsClaim?: boolean;
  /** workbox.cleanupOutdatedCaches,默认 true */
  cleanupOutdatedCaches?: boolean;
  /**
   * 是否使用 injectManifest 策略(自定义 SW 源文件)。
   * - false(默认):使用 generateSW,vite-plugin-pwa 自动生成 sw.js
   * - true:使用 injectManifest,需提供 swSrc 自定义 SW 源
   */
  injectManifest?: boolean;
  /** injectManifest 模式下的自定义 SW 源文件路径 */
  swSrc?: string;
}

// ============== 运行时 composable 类型 ==============

export interface UsePwaOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (swUrl: string) => void;
  onRegisterError?: (error: Error) => void;
  onUpdateFound?: () => void;
}

export interface PwaState {
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  isOfflineReady: boolean;
  needRefresh: boolean;
  registration: ServiceWorkerRegistration | null;
}
