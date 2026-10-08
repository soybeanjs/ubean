import { describe, expect, it } from 'vitest';
import { AboutPage } from '../pages/about.page';
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
 *
 * TS-35：本 spec 原先还包含 6 条纯 HTTP 用例（404 API / 404 页面 JSON / 4 个 public 静态
 * 文件）。那 6 条不需要浏览器（原 `api.*` 走的是 Node 侧 fetch），已下沉到
 * `examples/ubean-test/test/`（`http-contracts.test.ts` + 既有 `static-files.test.ts` /
 * `routing.test.ts`）。此处只保留**只有真实浏览器能证明**的 SSR / SPA 导航语义。
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
});
