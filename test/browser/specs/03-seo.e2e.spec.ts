import { describe, expect, it } from 'vitest';
import { MarkdownPage } from '../pages/markdown.page';
import { SeoMetaPage } from '../pages/seo-meta.page';

/**
 * Spec 03: SEO
 *
 * Covers:
 * - useHead() reactive head management
 * - useSeoMeta() comprehensive SEO metadata
 *
 * TS-35：本 spec 原先还有 17 条纯 HTTP 用例（`definePage({ head })` 的 SSR 输出、
 * `robots.txt`、`sitemap.xml`、markdown frontmatter 的 SSR title、`/api/manifest-test`）。
 * 它们不需要浏览器（原 `api.*` 走 Node 侧 fetch），已下沉到 L2：
 * `examples/ubean-test/test/http-contracts.test.ts`（about/md-test/robots/sitemap）与
 * 既有 `seo.test.ts` / `manifest.test.ts`（manifest 的 8 条 HTTP 断言比原 L3 更全）。
 * 此处只保留**只有真实浏览器能证明**的 meta 注入语义。
 */
describe('SEO', () => {
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

  describe('Markdown frontmatter head', () => {
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
});
