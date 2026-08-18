/**
 * @ubean/integrations/pwa 测试
 *
 * 测试薄封装层的配置转换逻辑:
 * - toVitePwaOptions: ubean PwaOptions → vite-plugin-pwa VitePluginPWOptions
 * - ubeanPwaPlugin: 插件返回值与命名
 * - strategiesToRuntimeCaching: strategies → runtimeCaching 转换(间接通过 toVitePwaOptions 验证)
 *
 * SW 生成、manifest 生成等底层能力由 vite-plugin-pwa + workbox 保证,不在此测试。
 */

import { describe, it, expect } from 'vitest';
import type { PwaOptions } from '../src/pwa/types';
import { ubeanPwaPlugin, definePwaConfig, toVitePwaOptions } from '../src/pwa/index';

describe('@ubean/integrations/pwa thin wrapper', () => {
  describe('toVitePwaOptions', () => {
    it('returns disable:true when enabled=false', () => {
      const result = toVitePwaOptions({ enabled: false });
      expect(result).toMatchObject({ disable: true });
    });

    it('uses generateSW strategy by default', () => {
      const result = toVitePwaOptions({ manifest: { name: 'Test' } });
      expect(result).toMatchObject({ strategies: 'generateSW' });
    });

    it('uses injectManifest strategy when injectManifest=true', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'Test' },
        injectManifest: true,
        swSrc: 'src/custom-sw.ts'
      });
      expect(result).toMatchObject({ strategies: 'injectManifest' });
      expect((result as { injectManifest: { swSrc: string } }).injectManifest.swSrc).toBe('src/custom-sw.ts');
    });

    it('applies default manifest values', () => {
      const result = toVitePwaOptions({ manifest: { name: 'My App' } }) as {
        manifest: { name: string; short_name: string; display: string; start_url: string };
      };
      expect(result.manifest.name).toBe('My App');
      expect(result.manifest.short_name).toBe('Ubean');
      expect(result.manifest.display).toBe('standalone');
      expect(result.manifest.start_url).toBe('/');
    });

    it('preserves user manifest overrides', () => {
      const result = toVitePwaOptions({
        manifest: {
          name: 'Custom',
          short_name: 'CST',
          theme_color: '#ff0000',
          display: 'fullscreen'
        }
      }) as { manifest: { name: string; short_name: string; theme_color: string; display: string } };
      expect(result.manifest.name).toBe('Custom');
      expect(result.manifest.short_name).toBe('CST');
      expect(result.manifest.theme_color).toBe('#ff0000');
      expect(result.manifest.display).toBe('fullscreen');
    });

    it('maps registerType correctly', () => {
      const promptResult = toVitePwaOptions({
        manifest: { name: 'T' },
        registerType: 'prompt'
      }) as { registerType: string };
      expect(promptResult.registerType).toBe('prompt');

      const manualResult = toVitePwaOptions({
        manifest: { name: 'T' },
        registerType: 'manual'
      }) as { registerType: string };
      expect(manualResult.registerType).toBe('manual');
    });

    it('maps skipWaiting/clientsClaim/cleanupOutdatedCaches to workbox options', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: false
      }) as {
        workbox: { skipWaiting: boolean; clientsClaim: boolean; cleanupOutdatedCaches: boolean };
      };
      expect(result.workbox.skipWaiting).toBe(false);
      expect(result.workbox.clientsClaim).toBe(false);
      expect(result.workbox.cleanupOutdatedCaches).toBe(false);
    });

    it('defaults skipWaiting/clientsClaim/cleanupOutdatedCaches to true', () => {
      const result = toVitePwaOptions({ manifest: { name: 'T' } }) as {
        workbox: { skipWaiting: boolean; clientsClaim: boolean; cleanupOutdatedCaches: boolean };
      };
      expect(result.workbox.skipWaiting).toBe(true);
      expect(result.workbox.clientsClaim).toBe(true);
      expect(result.workbox.cleanupOutdatedCaches).toBe(true);
    });

    it('converts strategies to runtimeCaching rules', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        strategies: {
          assets: 'network-first',
          images: 'cache-only'
        }
      }) as { workbox: { runtimeCaching: Array<{ handler: string; options?: { cacheName: string } }> } };

      const assetsRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'assets');
      expect(assetsRule?.handler).toBe('network-first');

      const imagesRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'images');
      expect(imagesRule?.handler).toBe('cache-only');
    });

    it('merges default strategies with user strategies (user wins)', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        strategies: {
          images: 'cache-only'
        }
      }) as { workbox: { runtimeCaching: Array<{ handler: string; options?: { cacheName: string } }> } };

      // 用户覆盖 images
      const imagesRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'images');
      expect(imagesRule?.handler).toBe('cache-only');

      // 未覆盖的 fonts 仍用默认值 cache-first
      const fontsRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'fonts');
      expect(fontsRule?.handler).toBe('cache-first');
    });

    it('appends user runtimeCaching after default rules', () => {
      const customRule = {
        urlPattern: '/api/data',
        handler: 'network-first' as const,
        options: { cacheName: 'api-data' }
      };
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        runtimeCaching: [customRule]
      }) as { workbox: { runtimeCaching: Array<{ options?: { cacheName: string } }> } };

      const apiRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'api-data');
      expect(apiRule).toBeDefined();

      // 默认规则仍在
      const assetsRule = result.workbox.runtimeCaching.find(r => r.options?.cacheName === 'assets');
      expect(assetsRule).toBeDefined();
    });

    it('passes devOptions through', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        devOptions: { enabled: true, suppressWarnings: true }
      }) as { devOptions: { enabled: boolean; suppressWarnings: boolean } };
      expect(result.devOptions.enabled).toBe(true);
      expect(result.devOptions.suppressWarnings).toBe(true);
    });

    it('passes injectRegister through', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        injectRegister: 'inline'
      }) as { injectRegister: string };
      expect(result.injectRegister).toBe('inline');
    });

    it('supports null injectRegister to disable', () => {
      const result = toVitePwaOptions({
        manifest: { name: 'T' },
        injectRegister: null
      }) as { injectRegister: undefined };
      expect(result.injectRegister).toBeUndefined();
    });
  });

  describe('ubeanPwaPlugin', () => {
    it('returns a Vite plugin object', () => {
      const plugin = ubeanPwaPlugin({ manifest: { name: 'Test' } });
      expect(plugin).toBeDefined();
      expect(typeof plugin).toBe('object');
      expect(plugin.name).toMatch(/^ubean:pwa/);
    });

    it('returns noop plugin when disabled', () => {
      const plugin = ubeanPwaPlugin({ enabled: false });
      expect(plugin.name).toBe('ubean:pwa:noop');
    });

    it('accepts empty options (uses defaults)', () => {
      const plugin = ubeanPwaPlugin();
      expect(plugin).toBeDefined();
      expect(plugin.name).toMatch(/^ubean:pwa/);
    });
  });

  describe('definePwaConfig', () => {
    it('returns options as-is (pass-through)', () => {
      const opts: PwaOptions = {
        manifest: { name: 'Config Test' },
        registerType: 'prompt'
      };
      const result = definePwaConfig(opts);
      expect(result).toBe(opts);
      expect(result.manifest.name).toBe('Config Test');
      expect(result.registerType).toBe('prompt');
    });
  });
});
