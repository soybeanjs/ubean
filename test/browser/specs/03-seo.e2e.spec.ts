import { describe, expect, it } from 'vitest';
import { api } from '../pages/base.page';
import { MarkdownPage } from '../pages/markdown.page';
import { SeoMetaPage } from '../pages/seo-meta.page';

/**
 * Spec 03: SEO
 *
 * Covers:
 * - definePage({ head }) static SEO config
 * - useHead() reactive head management
 * - useSeoMeta() comprehensive SEO metadata
 * - robots.txt generation (createRobotsResponse)
 * - sitemap.xml generation (createSitemapResponse)
 * - Markdown frontmatter head extraction
 * - Web App Manifest (defineManifest + createManifestResponse)
 */
describe('SEO', () => {
  describe('definePage head (about page)', () => {
    it('sets the title from definePage.head in SSR output', async () => {
      // definePage.head.title is applied during SSR. The client-side document.title
      // may be overridden by defineApp({ head: { title } }) after hydration, so we
      // verify the SSR HTML output contains the page-specific title.
      const res = await api.get('/about');
      expect(res.status).toBe(200);
      expect(res.body).toContain('<title>关于 - ubean-test</title>');
    });

    it('sets the description meta from definePage.head in SSR output', async () => {
      const res = await api.get('/about');
      expect(res.body).toContain('ubean 框架功能测试项目介绍页');
    });
  });

  describe('useHead + useSeoMeta (seo-meta page)', () => {
    it('renders the SEO meta test page', async () => {
      const page = await new SeoMetaPage().open();
      const heading = await page.heading();
      expect(heading).toContain('SEO Meta Test');
    });

    it('sets description meta via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const desc = await page.descriptionMeta();
      expect(desc).toContain('comprehensive SEO metadata test');
    });

    it('sets robots meta via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const robots = await page.robotsMeta();
      expect(robots).toContain('index');
      expect(robots).toContain('follow');
    });

    it('sets author meta via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const author = await page.authorMeta();
      expect(author).toContain('Ubean');
    });

    it('sets theme-color meta via useHead', async () => {
      const page = await new SeoMetaPage().open();
      const themeColor = await page.themeColorMeta();
      expect(themeColor).toBe('#3b82f6');
    });

    it('sets application-name meta via useHead', async () => {
      const page = await new SeoMetaPage().open();
      const appName = await page.applicationNameMeta();
      expect(appName).toBe('Ubean Test');
    });

    it('sets generator meta via useHead', async () => {
      const page = await new SeoMetaPage().open();
      const generator = await page.generatorMeta();
      expect(generator).toContain('Ubean');
    });

    it('sets OpenGraph title via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const ogTitle = await page.ogTitle();
      expect(ogTitle).toContain('SEO Test Page');
    });

    it('sets OpenGraph description via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const ogDesc = await page.ogDescription();
      expect(ogDesc).toContain('OpenGraph');
    });

    it('sets OpenGraph type via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const ogType = await page.ogType();
      expect(ogType).toBe('website');
    });

    it('sets OpenGraph image via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const ogImage = await page.ogImage();
      expect(ogImage).toContain('og-image.png');
    });

    it('sets OpenGraph site name via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const ogSiteName = await page.ogSiteName();
      expect(ogSiteName).toBe('Ubean Test');
    });

    it('sets Twitter card via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const twitterCard = await page.twitterCard();
      expect(twitterCard).toBe('summary_large_image');
    });

    it('sets Twitter title via useSeoMeta', async () => {
      const page = await new SeoMetaPage().open();
      const twitterTitle = await page.twitterTitle();
      expect(twitterTitle).toContain('SEO Test');
    });

    it('sets canonical link via useHead', async () => {
      const page = await new SeoMetaPage().open();
      const canonical = await page.canonicalLink();
      expect(canonical).toContain('/seo-meta');
    });

    it('sets alternate hreflang links via useHead', async () => {
      const page = await new SeoMetaPage().open();
      const count = await page.alternateLinkCount();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('robots.txt', () => {
    it('GET /robots.txt returns text/plain', async () => {
      const res = await api.get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('contains User-agent: *', async () => {
      const res = await api.get('/robots.txt');
      expect(res.body).toContain('User-agent: *');
    });

    it('contains Allow: /', async () => {
      const res = await api.get('/robots.txt');
      expect(res.body).toMatch(/Allow:\s*\//);
    });

    it('disallows /api/', async () => {
      const res = await api.get('/robots.txt');
      expect(res.body).toMatch(/Disallow:\s*\/api\//);
    });

    it('references the sitemap', async () => {
      const res = await api.get('/robots.txt');
      expect(res.body).toContain('Sitemap:');
      expect(res.body).toContain('/sitemap.xml');
    });
  });

  describe('sitemap.xml', () => {
    it('GET /sitemap.xml returns XML', async () => {
      const res = await api.get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('xml');
    });

    it('contains <urlset> root element', async () => {
      const res = await api.get('/sitemap.xml');
      expect(res.body).toContain('<urlset');
    });

    it('includes the home page URL', async () => {
      const res = await api.get('/sitemap.xml');
      expect(res.body).toContain('<loc>');
      expect(res.body).toContain('/</loc>');
    });

    it('includes the about page URL', async () => {
      const res = await api.get('/sitemap.xml');
      expect(res.body).toContain('/about');
    });

    it('includes priority values', async () => {
      const res = await api.get('/sitemap.xml');
      expect(res.body).toContain('<priority>');
    });
  });

  describe('Markdown frontmatter head', () => {
    it('sets title from frontmatter in SSR output', async () => {
      // The app's defineApp({ head: { title } }) may override the page-specific
      // title on the client side after hydration, so we verify the SSR HTML
      // output contains the page-specific title.
      const res = await api.get('/md-test');
      expect(res.status).toBe(200);
      expect(res.body).toContain('Markdown 测试页');
    });

    it('sets description meta from frontmatter', async () => {
      const page = await new MarkdownPage().open();
      const desc = await page.descriptionMeta();
      expect(desc).toContain('Markdown');
    });

    it('sets keywords meta from frontmatter', async () => {
      const page = await new MarkdownPage().open();
      const keywords = await page.keywordsMeta();
      expect(keywords).toContain('ubean');
      expect(keywords).toContain('markdown');
    });
  });

  describe('Web App Manifest', () => {
    it('GET /api/manifest-test returns manifest JSON', async () => {
      const res = await api.get('/api/manifest-test');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/manifest+json');
    });

    it('manifest contains name and short_name', async () => {
      const res = await api.get('/api/manifest-test');
      expect((res.json as any).name).toBe('Ubean Test App');
      expect((res.json as any).short_name).toBe('UbeanTest');
    });

    it('manifest contains icons array', async () => {
      const res = await api.get('/api/manifest-test');
      expect(Array.isArray((res.json as any).icons)).toBe(true);
      expect((res.json as any).icons.length).toBeGreaterThanOrEqual(2);
    });

    it('manifest contains display and theme_color', async () => {
      const res = await api.get('/api/manifest-test');
      expect((res.json as any).display).toBe('standalone');
      expect((res.json as any).theme_color).toBe('#3b82f6');
    });
  });
});
