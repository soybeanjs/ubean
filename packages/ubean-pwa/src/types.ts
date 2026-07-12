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

export type CachingStrategy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only'
  | 'cache-only';

export interface RuntimeCachingRule {
  urlPattern: string | RegExp;
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

export interface PwaOptions {
  enabled?: boolean;
  manifest?: Partial<WebAppManifest> & {
    name: string;
  };
  registerType?: 'autoUpdate' | 'prompt' | 'manual';
  workbox?: boolean;
  injectRegister?: 'auto' | 'script' | 'inline' | null;
  devOptions?: {
    enabled?: boolean;
    suppressWarnings?: boolean;
  };
  strategies?: {
    assets?: CachingStrategy;
    pages?: CachingStrategy;
    images?: CachingStrategy;
    fonts?: CachingStrategy;
    crossOrigin?: CachingStrategy;
  };
  runtimeCaching?: RuntimeCachingRule[];
  precacheManifest?: boolean;
  skipWaiting?: boolean;
  clientsClaim?: boolean;
  cleanupOutdatedCaches?: boolean;
  swDest?: string;
  swSrc?: string;
  outDir?: string;
}

export interface PwaResolvedOptions extends Required<Omit<PwaOptions, 'manifest' | 'strategies' | 'runtimeCaching'>> {
  manifest: WebAppManifest;
  strategies: Required<NonNullable<PwaOptions['strategies']>>;
  runtimeCaching: RuntimeCachingRule[];
}

export interface VersionedAsset {
  url: string;
  revision: string;
}

export interface SwTemplateOptions {
  version: string;
  precacheManifest: VersionedAsset[];
  runtimeCaching: RuntimeCachingRule[];
  skipWaiting: boolean;
  clientsClaim: boolean;
  cleanupOutdatedCaches: boolean;
  navigateFallback?: string;
}

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
