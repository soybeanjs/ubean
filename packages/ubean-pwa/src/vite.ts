import type { Plugin, ResolvedConfig } from 'vite';
import { consola } from 'consola';
import {
  resolvePwaOptions,
  generateManifest,
  generateManifestJson,
  generateServiceWorker,
  generatePrecacheManifest,
  hashContent,
  generateManifestLinkTags,
  generateThemeColorTag,
  generateRuntimeCachingDefaults
} from './core';
import type { PwaOptions, PwaResolvedOptions } from './types';

export function ubeanPwaPlugin(userOptions: PwaOptions = { manifest: { name: 'Ubean App' } }): Plugin {
  const options: PwaResolvedOptions = resolvePwaOptions(userOptions);
  let viteConfig: ResolvedConfig;
  let builtAssets: Array<{ url: string; content?: Buffer }> = [];
  let swGenerated = false;

  return {
    name: 'ubean:pwa',
    enforce: 'post',

    configResolved(config) {
      viteConfig = config;
    },

    transformIndexHtml(html) {
      if (!options.enabled) return html;

      const tags: string[] = [];
      tags.push(generateManifestLinkTags('/manifest.webmanifest'));
      if (options.manifest.theme_color) {
        tags.push(generateThemeColorTag(options.manifest.theme_color));
      }

      if (options.injectRegister === 'inline') {
        tags.push(`<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/${options.swDest}', { scope: '/' }).catch(function(){});
}
</script>`);
      }

      return html.replace('</head>', `${tags.join('\n')}\n</head>`);
    },

    generateBundle(_, bundle) {
      if (!options.enabled || viteConfig.command !== 'build') return;

      builtAssets = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          builtAssets.push({
            url: `/${fileName}`,
            content: Buffer.from(chunk.code)
          });
        } else if (chunk.type === 'asset' && chunk.source) {
          builtAssets.push({
            url: `/${fileName}`,
            content: Buffer.isBuffer(chunk.source) ? chunk.source : Buffer.from(chunk.source as string)
          });
        }
      }

      const manifest = generateManifest(options);
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: generateManifestJson(manifest)
      });

      if (options.precacheManifest) {
        const precacheManifest = generatePrecacheManifest(builtAssets);
        const runtimeCaching = [...generateRuntimeCachingDefaults(options), ...options.runtimeCaching];

        const swCode = generateServiceWorker({
          version: hashContent(Date.now().toString()).slice(0, 8),
          precacheManifest,
          runtimeCaching: runtimeCaching as any,
          skipWaiting: options.skipWaiting,
          clientsClaim: options.clientsClaim,
          cleanupOutdatedCaches: options.cleanupOutdatedCaches,
          navigateFallback: options.registerType !== 'manual' ? '/index.html' : undefined
        });

        this.emitFile({
          type: 'asset',
          fileName: options.swDest,
          source: swCode
        });

        swGenerated = true;
      }
    },

    closeBundle() {
      if (!options.enabled || viteConfig.command !== 'build') return;
      if (swGenerated) {
        consola.success(`[pwa] Service Worker generated: ${options.swDest}`);
        consola.success(`[pwa] Web App Manifest generated: manifest.webmanifest`);
      }
    }
  };
}

export function definePwaConfig(options: PwaOptions): PwaOptions {
  return options;
}

export default ubeanPwaPlugin;
