import { createHash } from 'node:crypto';
import { defu } from 'defu';
import type {
  PwaOptions,
  PwaResolvedOptions,
  SwTemplateOptions,
  VersionedAsset,
  WebAppManifest,
  RuntimeCachingRule
} from './types';

export const DEFAULT_MANIFEST: WebAppManifest = {
  name: 'Ubean App',
  short_name: 'Ubean',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#000000',
  icons: [],
  lang: 'en'
};

export const DEFAULT_PWA_OPTIONS: PwaResolvedOptions = {
  enabled: true,
  manifest: DEFAULT_MANIFEST,
  registerType: 'autoUpdate',
  workbox: false,
  injectRegister: 'auto',
  devOptions: {
    enabled: false,
    suppressWarnings: false
  },
  strategies: {
    assets: 'cache-first',
    pages: 'network-first',
    images: 'stale-while-revalidate',
    fonts: 'cache-first',
    crossOrigin: 'network-first'
  },
  runtimeCaching: [],
  precacheManifest: true,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  swDest: 'sw.js',
  swSrc: '',
  outDir: 'dist'
};

export function resolvePwaOptions(options: PwaOptions = { manifest: { name: 'Ubean App' } }): PwaResolvedOptions {
  return defu(
    {
      ...options,
      manifest: defu(options.manifest || {}, DEFAULT_MANIFEST) as WebAppManifest
    },
    DEFAULT_PWA_OPTIONS
  ) as PwaResolvedOptions;
}

export function generateManifest(options: PwaResolvedOptions): WebAppManifest {
  return { ...options.manifest };
}

export function generateManifestJson(manifest: WebAppManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function hashContent(content: string | Buffer): string {
  return createHash('md5').update(content).digest('hex').slice(0, 10);
}

export function hashFile(content: string | Buffer): string {
  return hashContent(content);
}

export function generatePrecacheManifest(
  buildAssets: Array<{ url: string; content?: string | Buffer; size?: number }>
): VersionedAsset[] {
  return buildAssets
    .filter(asset => {
      const ext = asset.url.split('.').pop()?.toLowerCase() || '';
      return !['map', 'br', 'gz'].includes(ext);
    })
    .map(asset => ({
      url: asset.url,
      revision: asset.content ? hashContent(asset.content) : String(Date.now())
    }));
}

export function generateRuntimeCachingDefaults(options: PwaResolvedOptions) {
  const defaults = [
    {
      urlPattern: /\.(?:png|gif|jpg|jpeg|svg|webp|avif|ico)$/i,
      handler: options.strategies.images,
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60
        }
      }
    },
    {
      urlPattern: /\.(?:woff2?|eot|ttf|otf)$/i,
      handler: options.strategies.fonts,
      options: {
        cacheName: 'fonts',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 365 * 24 * 60 * 60
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: options.strategies.assets,
      options: {
        cacheName: 'assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60
        }
      }
    },
    {
      urlPattern: /\/api\//i,
      handler: 'network-first',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60
        }
      }
    },
    {
      urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
      handler: options.strategies.pages,
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 24 * 60 * 60
        }
      }
    }
  ];
  return defaults as unknown as RuntimeCachingRule[];
}

function serializeUrlPattern(pattern: string | RegExp | ((ctx: { request: Request }) => boolean)): string {
  if (typeof pattern === 'string') {
    return `new RegExp(${JSON.stringify(pattern)})`;
  }
  if (typeof pattern === 'function') {
    return `(${pattern.toString()})`;
  }
  return pattern.toString();
}

export function generateServiceWorker(options: SwTemplateOptions): string {
  const {
    version,
    precacheManifest,
    runtimeCaching,
    skipWaiting,
    clientsClaim,
    cleanupOutdatedCaches,
    navigateFallback
  } = options;

  const precacheEntries = precacheManifest
    .map(a => `  { url: ${JSON.stringify(a.url)}, revision: ${JSON.stringify(a.revision)} }`)
    .join(',\n');

  const swCode = `/* ubean-pwa service worker v${version} */
const SW_VERSION = ${JSON.stringify(version)};
const PRECACHE = 'ubean-precache-' + SW_VERSION;
const RUNTIME = 'ubean-runtime-' + SW_VERSION;

const PRECACHE_URLS = [
${precacheEntries}
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map(e => e.url)))
      .then(() => ${skipWaiting ? 'self.skipWaiting()' : 'Promise.resolve()'})
  );
});

self.addEventListener('activate', (event) => {
  const expectedCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => ${cleanupOutdatedCaches} && !expectedCaches.includes(name))
            .map((name) => caches.delete(name))
        );
      })
      .then(() => ${clientsClaim ? 'self.clients.claim()' : 'Promise.resolve()'})
  );
});

const CACHE_STRATEGIES = {
  'cache-first': async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return cached || new Response('Network error', { status: 504 });
    }
  },
  'network-first': async (request, cacheName) => {
    try {
      const response = await fetch(request);
      if (response.status === 200) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
      ${navigateFallback ? `return cache.match(${JSON.stringify(navigateFallback)});` : "return new Response('Offline', { status: 503 });"}
    }
  },
  'stale-while-revalidate': async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then((response) => {
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => cached);
    return cached || fetchPromise;
  },
  'network-only': async (request) => {
    return fetch(request);
  },
  'cache-only': async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached || new Response('Not found in cache', { status: 404 });
  }
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  let handler = null;
  let cacheName = RUNTIME;

${runtimeCaching
  .map(rule => {
    const pattern = serializeUrlPattern(rule.urlPattern);
    const handlerName = rule.handler;
    const cn = rule.options?.cacheName || 'ubean-runtime';
    return `  if (!handler && ${pattern}.test ? ${pattern}.test(url.pathname) : typeof ${pattern} === 'function' ? ${pattern}({ request: event.request }) : ${pattern} === url.pathname) {
    handler = CACHE_STRATEGIES[${JSON.stringify(handlerName)}];
    cacheName = ${JSON.stringify(cn)};
  }`;
  })
  .join('\n')}

  if (!handler) {
    handler = CACHE_STRATEGIES['network-first'];
    cacheName = 'pages';
  }

  event.respondWith(handler(event.request, cacheName));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
`;

  return swCode;
}

export function generateRegisterSwCode(swUrl: string, options: PwaResolvedOptions): string {
  const { registerType } = options;

  return `
export async function registerSW(options = {}) {
  if ('serviceWorker' in navigator) {
    const {
      immediate = true,
      onNeedRefresh,
      onOfflineReady,
      onRegistered,
      onRegisterError,
      onUpdateFound
    } = options;

    if (!immediate) return;

    try {
      const registration = await navigator.serviceWorker.register(${JSON.stringify(swUrl)}, {
        scope: '/'
      });

      if (onRegistered) onRegistered(${JSON.stringify(swUrl)});

      if (${registerType === 'autoUpdate'}) {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (onUpdateFound) onUpdateFound();
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (onNeedRefresh) onNeedRefresh();
              }
              if (newWorker.state === 'activated') {
                window.location.reload();
              }
            });
          }
        });

        setInterval(() => registration.update(), 60 * 60 * 1000);
      }

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      } else {
        if (onOfflineReady) onOfflineReady();
      }

      return registration;
    } catch (error) {
      if (onRegisterError) onRegisterError(error);
      return null;
    }
  }
  return null;
}

export function updateSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  }
}
`;
}

export function generateManifestLinkTags(manifestPath: string = '/manifest.webmanifest'): string {
  return `<link rel="manifest" href="${manifestPath}">`;
}

export function generateThemeColorTag(color: string): string {
  return `<meta name="theme-color" content="${color}">`;
}

export function generateAppleTouchIconTags(icons: Array<{ src: string; sizes: string }>): string {
  return icons
    .filter(i => i.sizes && parseInt(i.sizes) >= 180)
    .map(i => `<link rel="apple-touch-icon" sizes="${i.sizes}" href="${i.src}">`)
    .join('\n');
}
