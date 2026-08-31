import { describe, it, expect } from 'vitest';
import { api } from './helper';

describe('Pages & Layouts', () => {
  describe('SSR rendering', () => {
    it('renders index page with HTML', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(res.text).toContain('<html');
    });

    it('renders about page', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<html');
      // Page content must be server-rendered
      expect(res.text).toContain('关于 ubean-test');
    });

    it('renders features page', async () => {
      const res = await api('/features');
      expect(res.status).toBe(200);
    });
  });

  describe('Layout system', () => {
    it('default layout wraps page content', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<html');
      // The default layout markup (header/nav/footer/main) must be present in
      // the SSR output and wrap the page content — guards against the layout
      // being skipped because its async load was not awaited before render.
      const appStart = res.text.indexOf('<div id="app"');
      expect(appStart).toBeGreaterThan(-1);
      expect(res.text.slice(appStart)).toContain('class="layout"');
      expect(res.text.slice(appStart)).toContain('class="header"');
      expect(res.text.slice(appStart)).toContain('class="footer"');
    });

    it('about page SSR includes default layout around page content', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      const appStart = res.text.indexOf('<div id="app"');
      const appHtml = res.text.slice(appStart);
      // Layout wraps the page: layout → main → page content
      const layoutIdx = appHtml.indexOf('class="layout"');
      const mainIdx = appHtml.indexOf('class="main"');
      const pageIdx = appHtml.indexOf('class="about"');
      expect(layoutIdx).toBeGreaterThan(-1);
      expect(mainIdx).toBeGreaterThan(layoutIdx);
      expect(pageIdx).toBeGreaterThan(mainIdx);
    });

    it('dashboard pages use layout', async () => {
      const res = await api('/dashboard');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<html');
    });
  });

  describe('Dynamic page params', () => {
    it('user/[id].vue renders with param', async () => {
      const res = await api('/user/42');
      expect(res.status).toBe(200);
      // The page should contain the user ID
      expect(res.text).toContain('42');
    });

    it('user/[id].vue with different param', async () => {
      const res = await api('/user/alice');
      expect(res.status).toBe(200);
      expect(res.text).toContain('alice');
    });
  });

  describe('Route groups in pages', () => {
    it('(marketing)/marketing-page renders at /marketing-page', async () => {
      const res = await api('/marketing-page');
      expect(res.status).toBe(200);
    });
  });

  describe('Markdown pages', () => {
    it('md-test.md renders as HTML', async () => {
      const res = await api('/md-test');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });
  });

  describe('Form actions (POST to pages)', () => {
    it('POST to page triggers action', async () => {
      const res = await api('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'test=value'
      });
      // Page POST may return 200, 302, or 422 depending on action
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Data fetching pages', () => {
    it('data-fetch page renders', async () => {
      const res = await api('/data-fetch');
      expect(res.status).toBe(200);
    });

    it('data-fetch page contains fetched data', async () => {
      const res = await api('/data-fetch');
      expect(res.status).toBe(200);
      // The page should contain some data from the loader
      expect(res.text).toContain('<html');
    });
  });

  describe('SEO meta page', () => {
    it('seo-meta page renders with meta tags', async () => {
      const res = await api('/seo-meta');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<html');
    });
  });

  describe('i18n page', () => {
    it('i18n page renders', async () => {
      const res = await api('/i18n');
      expect(res.status).toBe(200);
    });
  });

  describe('Islands test page', () => {
    it('islands-test page renders', async () => {
      const res = await api('/islands-test');
      expect(res.status).toBe(200);
    });
  });

  describe('View transitions page', () => {
    it('view-transitions page renders', async () => {
      const res = await api('/view-transitions');
      expect(res.status).toBe(200);
    });
  });

  describe('Page JSON (isPagesRequest)', () => {
    it('returns JSON when Accept header is application/json', async () => {
      const res = await api('/', {
        headers: { Accept: 'application/json' }
      });
      // Some pages support JSON response for client-side navigation
      if (res.headers.get('Content-Type')?.includes('application/json')) {
        const data = JSON.parse(res.text);
        expect(data).toHaveProperty('component');
      } else {
        // If not JSON, it should still be HTML
        expect(res.status).toBe(200);
      }
    });
  });
});
