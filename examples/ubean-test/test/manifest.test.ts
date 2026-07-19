/**
 * PWA Manifest 系统测试
 *
 * 覆盖 ubean 的 Web App Manifest 能力:
 * - defineManifest: 类型安全的 manifest 定义
 * - createManifestResponse: 返回符合规范的 manifest HTTP 响应
 *
 * 测试策略:
 * - 函数级: 直接调用 ubean 导出的函数验证返回值与响应头
 * - HTTP 集成级: 通过 /api/manifest-test 验证端到端 Content-Type 与字段
 */
import { describe, it, expect } from 'vitest';
import { defineManifest, createManifestResponse } from 'ubean';
import type { WebAppManifest } from 'ubean';
import { api } from './helper';

describe('PWA Manifest system', () => {
  describe('defineManifest()', () => {
    it('returns the manifest object as-is', () => {
      const manifest = defineManifest({
        name: 'Test App',
        short_name: 'Test',
        start_url: '/'
      });
      expect(manifest).toBeDefined();
      expect(manifest.name).toBe('Test App');
      expect(manifest.short_name).toBe('Test');
      expect(manifest.start_url).toBe('/');
    });

    it('preserves all WebAppManifest fields', () => {
      const manifest = defineManifest({
        name: 'Full App',
        short_name: 'Full',
        description: 'A full test manifest',
        start_url: '/start',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        orientation: 'portrait',
        lang: 'en',
        dir: 'ltr',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      });
      expect(manifest.description).toBe('A full test manifest');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color).toBe('#ffffff');
      expect(manifest.theme_color).toBe('#000000');
      expect(manifest.orientation).toBe('portrait');
      expect(manifest.lang).toBe('en');
      expect(manifest.dir).toBe('ltr');
      expect(manifest.scope).toBe('/');
      expect(manifest.icons).toHaveLength(2);
    });

    it('accepts minimal manifest with only required fields', () => {
      const manifest: WebAppManifest = defineManifest({
        name: 'Minimal'
      });
      expect(manifest.name).toBe('Minimal');
    });

    it('accepts all display modes', () => {
      const modes: Array<WebAppManifest['display']> = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
      for (const mode of modes) {
        const m = defineManifest({ display: mode });
        expect(m.display).toBe(mode);
      }
    });

    it('accepts all orientation values', () => {
      const orientations: Array<WebAppManifest['orientation']> = ['portrait', 'landscape', 'any'];
      for (const o of orientations) {
        const m = defineManifest({ orientation: o });
        expect(m.orientation).toBe(o);
      }
    });

    it('accepts all dir values', () => {
      const dirs: Array<WebAppManifest['dir']> = ['ltr', 'rtl', 'auto'];
      for (const d of dirs) {
        const m = defineManifest({ dir: d });
        expect(m.dir).toBe(d);
      }
    });

    it('accepts icons with purpose field', () => {
      const manifest = defineManifest({
        icons: [
          { src: '/i1.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/i2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/i3.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      });
      expect(manifest.icons?.[0].purpose).toBe('any');
      expect(manifest.icons?.[1].purpose).toBe('maskable');
      expect(manifest.icons?.[2].purpose).toBe('any maskable');
    });
  });

  describe('createManifestResponse()', () => {
    it('returns a Response instance', () => {
      const res = createManifestResponse({ name: 'Test' });
      expect(res).toBeInstanceOf(Response);
    });

    it('sets Content-Type to application/manifest+json', () => {
      const res = createManifestResponse({ name: 'Test' });
      expect(res.headers.get('Content-Type')).toContain('application/manifest+json');
    });

    it('sets Cache-Control header', () => {
      const res = createManifestResponse({ name: 'Test' });
      expect(res.headers.get('Cache-Control')).toBeTruthy();
    });

    it('serializes manifest as JSON in body', async () => {
      const manifest = { name: 'Serialized', short_name: 'Ser', start_url: '/' };
      const res = createManifestResponse(manifest);
      const text = await res.text();
      const parsed = JSON.parse(text);
      expect(parsed.name).toBe('Serialized');
      expect(parsed.short_name).toBe('Ser');
      expect(parsed.start_url).toBe('/');
    });

    it('returns status 200', () => {
      const res = createManifestResponse({ name: 'Status' });
      expect(res.status).toBe(200);
    });

    it('pretty-prints JSON output', async () => {
      const res = createManifestResponse({ name: 'Pretty', short_name: 'P' });
      const text = await res.text();
      // Pretty-printed JSON contains newlines
      expect(text).toContain('\n');
    });

    it('serializes icons array correctly', async () => {
      const res = createManifestResponse({
        name: 'Icons',
        icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }]
      });
      const parsed = await res.json();
      expect(parsed.icons).toHaveLength(1);
      expect(parsed.icons[0].src).toBe('/icon.png');
    });
  });

  describe('HTTP integration - /api/manifest-test', () => {
    it('returns 200 status', async () => {
      const res = await api('/api/manifest-test');
      expect(res.status).toBe(200);
    });

    it('returns Content-Type application/manifest+json', async () => {
      const res = await api('/api/manifest-test');
      expect(res.headers.get('Content-Type')).toContain('application/manifest+json');
    });

    it('returns valid JSON manifest in body', async () => {
      const res = await api('/api/manifest-test');
      const data = res.data as WebAppManifest;
      expect(data.name).toBe('Ubean Test App');
      expect(data.short_name).toBe('UbeanTest');
      expect(data.description).toBe('A test project for ubean framework');
      expect(data.start_url).toBe('/');
      expect(data.display).toBe('standalone');
      expect(data.background_color).toBe('#ffffff');
      expect(data.theme_color).toBe('#3b82f6');
      expect(data.orientation).toBe('portrait');
      expect(data.lang).toBe('en');
      expect(data.dir).toBe('ltr');
    });

    it('includes icons array with multiple sizes', async () => {
      const res = await api('/api/manifest-test');
      const data = res.data as WebAppManifest;
      expect(Array.isArray(data.icons)).toBe(true);
      expect(data.icons?.length).toBe(2);
    });

    it('icons have required src/sizes/type fields', async () => {
      const res = await api('/api/manifest-test');
      const data = res.data as WebAppManifest;
      for (const icon of data.icons || []) {
        expect(icon.src).toBeDefined();
        expect(icon.sizes).toBeDefined();
        expect(icon.type).toBeDefined();
      }
    });

    it('icons include purpose field', async () => {
      const res = await api('/api/manifest-test');
      const data = res.data as WebAppManifest;
      expect(data.icons?.every(i => i.purpose)).toBe(true);
    });

    it('includes 192x192 and 512x512 icon sizes', async () => {
      const res = await api('/api/manifest-test');
      const data = res.data as WebAppManifest;
      const sizes = (data.icons || []).map(i => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });

    it('sets Cache-Control header for caching', async () => {
      const res = await api('/api/manifest-test');
      expect(res.headers.get('Cache-Control')).toBeTruthy();
    });
  });
});
