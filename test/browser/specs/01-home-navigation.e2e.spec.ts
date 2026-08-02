import { describe, expect, it } from 'vitest';
import { AboutPage } from '../pages/about.page';
import { api } from '../pages/base.page';
import { FeaturesPage } from '../pages/features.page';
import { HomePage } from '../pages/home.page';

/**
 * Spec 01: Home page, navigation, and SSR
 *
 * Covers:
 * - Home page SSR rendering
 * - Link component (SPA navigation)
 * - Layout system (header nav, footer)
 * - Page routing (file-system routes)
 * - useHead title injection
 */
describe('Home & Navigation', () => {
  describe('Home page SSR', () => {
    it('renders the home page heading from SSR output', async () => {
      const home = await new HomePage().open();
      const heading = await home.heading();
      expect(heading).toContain('ubean-test');
    });

    it('renders the subtitle paragraph', async () => {
      const home = await new HomePage().open();
      const subtitle = await home.text('.subtitle');
      expect(subtitle).toContain('ubean');
    });

    it('renders test cards with navigation links', async () => {
      const home = await new HomePage().open();
      const count = await home.linkCount();
      expect(count).toBeGreaterThan(0);
    });

    it('sets the page title via useHead', async () => {
      const home = await new HomePage().open();
      const title = await home.title();
      expect(title).toContain('ubean-test');
    });

    it('sets the description meta via useHead', async () => {
      const home = await new HomePage().open();
      const desc = await home.meta('description');
      expect(desc).toContain('ubean');
    });
  });

  describe('Layout system', () => {
    it('renders the header with nav links', async () => {
      const home = await new HomePage().open();
      const logo = await home.text('.logo');
      expect(logo).toBe('ubean-test');
    });

    it('renders the footer', async () => {
      const home = await new HomePage().open();
      const footer = await home.text('.footer p');
      expect(footer).toContain('ubean');
    });

    it('renders nav links to key pages', async () => {
      const home = await new HomePage().open();
      const aboutLink = await home.count('.nav-links a[href="/about"]');
      const featuresLink = await home.count('.nav-links a[href="/features"]');
      expect(aboutLink).toBe(1);
      expect(featuresLink).toBe(1);
    });
  });

  describe('SPA navigation via Link component', () => {
    it('navigates from home to about via Link click', async () => {
      const home = await new HomePage().open();
      const result = await home.clickNav('a[href="/about"]');
      expect(result.url).toContain('/about');
      const about = new AboutPage();
      const heading = await about.heading();
      expect(heading).toContain('关于');
    });

    it('navigates from home to features via nav header link', async () => {
      const home = await new HomePage().open();
      const result = await home.clickNav('.nav-links a[href="/features"]');
      expect(result.url).toContain('/features');
      const features = new FeaturesPage();
      const heading = await features.heading();
      expect(heading).toContain('功能');
    });

    it('navigates back from about to home via in-page link', async () => {
      const about = await new AboutPage().open();
      const result = await about.goHome();
      expect(result.url.endsWith('/')).toBe(true);
    });

    it('preserves layout across SPA navigation (no full reload)', async () => {
      const home = await new HomePage().open();
      const beforeUrl = await home.url();
      await home.clickNav('.nav-links a[href="/about"]');
      const afterUrl = await home.url();
      expect(beforeUrl).not.toEqual(afterUrl);
      // The layout header should still be present after SPA nav
      const logo = await home.text('.logo');
      expect(logo).toBe('ubean-test');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for non-existent API route', async () => {
      const res = await api.get('/api/this-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent page route (JSON)', async () => {
      const res = await api.get('/this-page-does-not-exist', { accept: 'application/json' });
      expect(res.status).toBe(404);
    });
  });

  describe('Static files from public/', () => {
    it('serves data.json from public/', async () => {
      const res = await api.get('/data.json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('serves test.txt from public/', async () => {
      const res = await api.get('/test.txt');
      expect(res.status).toBe(200);
    });

    it('serves favicon.svg from public/', async () => {
      const res = await api.get('/favicon.svg');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/svg');
    });

    it('serves style.css from public/', async () => {
      const res = await api.get('/style.css');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('css');
    });
  });
});
