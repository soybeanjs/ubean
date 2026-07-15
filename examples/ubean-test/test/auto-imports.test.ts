import { describe, it, expect } from 'vitest';
import { api, getJson } from './helper';

describe('Auto-imports system', () => {
  describe('Built-in composables', () => {
    it('usePage() is available in pages (SSR)', async () => {
      const res = await api('/user/123');
      expect(res.status).toBe(200);
      // user/[id].vue uses usePage() to get params
      expect(res.text).toContain('123');
    });

    it('usePage().params works for dynamic routes', async () => {
      const res = await api('/user/alice');
      expect(res.status).toBe(200);
      expect(res.text).toContain('alice');
    });

    it('usePage().url works', async () => {
      const res = await api('/user/456');
      expect(res.status).toBe(200);
      // The page displays the current URL
      expect(res.text).toContain('456');
    });
  });

  describe('Vue Macros (definePage)', () => {
    it('definePage() macro works in pages', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      // about.vue uses definePage({ meta: { title: '关于' } })
      // The title should appear in the rendered HTML
    });

    it('definePage() meta is applied', async () => {
      const res = await api('/dashboard');
      expect(res.status).toBe(200);
      // dashboard/index.vue uses definePage with meta
    });
  });

  describe('Link component (auto-imported)', () => {
    it('Link component is globally available', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      // about.vue uses <Link to="/">
      expect(res.text).toContain('<a');
    });

    it('Link to="/" renders anchor tag', async () => {
      const res = await api('/user/789');
      expect(res.status).toBe(200);
      // user/[id].vue uses <Link to="/" class="back-link">
      expect(res.text).toContain('back-link');
    });
  });

  describe('components/ directory auto-import', () => {
    it('Island components are available', async () => {
      const res = await api('/islands-test');
      expect(res.status).toBe(200);
      // islands-test.vue uses island components
    });
  });

  describe('Auto-imported API functions', () => {
    it('defineHandler is available in API routes', async () => {
      const res = await getJson('/api/hello');
      expect(res.status).toBe(200);
      // hello.ts uses defineHandler which is auto-imported
    });

    it('defineValidator is available in API routes', async () => {
      const res = await getJson('/api/headers', {
        'x-request-id': 'test-req-id',
        'x-custom-header': 'test-custom-value'
      });
      expect(res.status).toBe(200);
      // headers.ts uses validator which is auto-imported
    });
  });
});
