import { describe, it, expect } from 'vitest';
import {
  resolvePwaOptions,
  generateManifest,
  generateManifestJson,
  generateServiceWorker,
  generatePrecacheManifest,
  hashContent,
  generateManifestLinkTags,
  generateThemeColorTag,
  generateRuntimeCachingDefaults,
  DEFAULT_MANIFEST,
  DEFAULT_PWA_OPTIONS
} from '../src/core';
import type { PwaOptions } from '../src/types';

describe('ubean-pwa core', () => {
  describe('resolvePwaOptions', () => {
    it('resolves with defaults when no options provided', () => {
      const resolved = resolvePwaOptions();
      expect(resolved.enabled).toBe(true);
      expect(resolved.registerType).toBe('autoUpdate');
      expect(resolved.manifest.name).toBe('Ubean App');
      expect(resolved.strategies.assets).toBe('cache-first');
    });

    it('merges user options with defaults', () => {
      const opts: PwaOptions = {
        manifest: { name: 'My App', short_name: 'MyApp', theme_color: '#ff0000' },
        registerType: 'prompt',
        skipWaiting: false
      };
      const resolved = resolvePwaOptions(opts);
      expect(resolved.manifest.name).toBe('My App');
      expect(resolved.manifest.short_name).toBe('MyApp');
      expect(resolved.manifest.theme_color).toBe('#ff0000');
      expect(resolved.registerType).toBe('prompt');
      expect(resolved.skipWaiting).toBe(false);
      expect(resolved.clientsClaim).toBe(true);
    });
  });

  describe('generateManifest', () => {
    it('generates a valid Web App Manifest', () => {
      const resolved = resolvePwaOptions({
        manifest: { name: 'Test App', short_name: 'Test' }
      });
      const manifest = generateManifest(resolved);
      expect(manifest.name).toBe('Test App');
      expect(manifest.short_name).toBe('Test');
      expect(manifest.start_url).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color).toBeDefined();
      expect(manifest.theme_color).toBeDefined();
    });

    it('preserves custom manifest properties', () => {
      const resolved = resolvePwaOptions({
        manifest: {
          name: 'Custom App',
          description: 'A custom app',
          display: 'fullscreen',
          orientation: 'portrait',
          start_url: '/home'
        }
      });
      const manifest = generateManifest(resolved);
      expect(manifest.display).toBe('fullscreen');
      expect(manifest.orientation).toBe('portrait');
      expect(manifest.start_url).toBe('/home');
      expect(manifest.description).toBe('A custom app');
    });
  });

  describe('generateManifestJson', () => {
    it('produces valid JSON', () => {
      const manifest = { name: 'Test', short_name: 'T' };
      const json = generateManifestJson(manifest);
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('Test');
    });
  });

  describe('hashContent', () => {
    it('produces consistent hashes', () => {
      const h1 = hashContent('hello world');
      const h2 = hashContent('hello world');
      const h3 = hashContent('different');
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
      expect(typeof h1).toBe('string');
      expect(h1.length).toBeGreaterThan(0);
    });
  });

  describe('generateManifestLinkTags', () => {
    it('generates correct link tag for manifest', () => {
      const tag = generateManifestLinkTags('/manifest.webmanifest');
      expect(tag).toContain('rel="manifest"');
      expect(tag).toContain('href="/manifest.webmanifest"');
    });
  });

  describe('generateThemeColorTag', () => {
    it('generates correct meta tag for theme color', () => {
      const tag = generateThemeColorTag('#000000');
      expect(tag).toContain('name="theme-color"');
      expect(tag).toContain('#000000');
    });
  });

  describe('generateRuntimeCachingDefaults', () => {
    it('generates default runtime caching rules', () => {
      const resolved = resolvePwaOptions({ manifest: { name: 'Test' } });
      const defaults = generateRuntimeCachingDefaults(resolved);
      expect(Array.isArray(defaults)).toBe(true);
      expect(defaults.length).toBeGreaterThanOrEqual(3);
    });

    it('respects custom strategy options', () => {
      const resolved = resolvePwaOptions({
        manifest: { name: 'Test' },
        strategies: {
          images: 'cache-first',
          fonts: 'stale-while-revalidate'
        }
      });
      const defaults = generateRuntimeCachingDefaults(resolved);
      const imageRule = defaults.find(r => r.options?.cacheName === 'images');
      expect(imageRule?.handler).toBe('cache-first');
      const fontRule = defaults.find(r => r.options?.cacheName === 'fonts');
      expect(fontRule?.handler).toBe('stale-while-revalidate');
    });
  });

  describe('generatePrecacheManifest', () => {
    it('adds revision hashes to assets', () => {
      const assets = [
        { url: '/index.html', content: Buffer.from('<html></html>') },
        { url: '/assets/main.js', content: Buffer.from('console.log("hello")') }
      ];
      const manifest = generatePrecacheManifest(assets);
      expect(manifest).toHaveLength(2);
      expect(manifest[0].url).toBe('/index.html');
      expect(manifest[0].revision).toBeDefined();
      expect(typeof manifest[0].revision).toBe('string');
      expect(manifest[0].revision!.length).toBeGreaterThan(0);
    });

    it('handles empty asset list', () => {
      const manifest = generatePrecacheManifest([]);
      expect(manifest).toHaveLength(0);
    });
  });

  describe('generateServiceWorker', () => {
    it('generates a valid service worker script', () => {
      const precacheManifest = [
        { url: '/index.html', revision: 'abc123' },
        { url: '/assets/main.js', revision: 'def456' }
      ];
      const swCode = generateServiceWorker({
        version: '1.0.0',
        precacheManifest,
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      });

      expect(swCode).toContain('SW_VERSION');
      expect(swCode).toContain('PRECACHE');
      expect(swCode).toContain('install');
      expect(swCode).toContain('activate');
      expect(swCode).toContain('fetch');
      expect(swCode).toContain('CACHE_STRATEGIES');
      expect(swCode).toContain('/index.html');
      expect(swCode).toContain('/assets/main.js');
    });

    it('includes skipWaiting when enabled', () => {
      const swCode = generateServiceWorker({
        version: '1.0.0',
        precacheManifest: [],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      });
      expect(swCode).toContain('self.skipWaiting()');
    });

    it('includes navigateFallback when provided', () => {
      const swCode = generateServiceWorker({
        version: '1.0.0',
        precacheManifest: [],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html'
      });
      expect(swCode).toContain('/index.html');
    });

    it('includes all cache strategies', () => {
      const swCode = generateServiceWorker({
        version: '1.0.0',
        precacheManifest: [],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      });
      expect(swCode).toContain('cache-first');
      expect(swCode).toContain('network-first');
      expect(swCode).toContain('stale-while-revalidate');
      expect(swCode).toContain('network-only');
      expect(swCode).toContain('cache-only');
    });

    it('handles SKIP_WAITING message', () => {
      const swCode = generateServiceWorker({
        version: '1.0.0',
        precacheManifest: [],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      });
      expect(swCode).toContain('SKIP_WAITING');
    });
  });

  describe('DEFAULT_MANIFEST', () => {
    it('has required PWA manifest fields', () => {
      expect(DEFAULT_MANIFEST.name).toBeDefined();
      expect(DEFAULT_MANIFEST.display).toBeDefined();
      expect(DEFAULT_MANIFEST.start_url).toBe('/');
    });
  });

  describe('DEFAULT_PWA_OPTIONS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_PWA_OPTIONS.enabled).toBe(true);
      expect(DEFAULT_PWA_OPTIONS.precacheManifest).toBe(true);
      expect(DEFAULT_PWA_OPTIONS.skipWaiting).toBe(true);
      expect(DEFAULT_PWA_OPTIONS.swDest).toBe('sw.js');
    });
  });
});
