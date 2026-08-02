import { describe, expect, it } from 'vitest';
import { AboutAliasPage } from '../pages/about-alias.page';
import { AboutPage } from '../pages/about.page';
import { api } from '../pages/base.page';
import { DashboardPage, DashboardSettingsPage, DashboardProfilePage } from '../pages/dashboard.page';
import { MarkdownPage } from '../pages/markdown.page';
import { MarketingPage } from '../pages/marketing.page';
import { UserDetailPage } from '../pages/user-detail.page';

/**
 * Spec 10: Special routes
 *
 * Covers:
 * - Dynamic routes (/user/[id])
 * - Nested routes (/dashboard, /dashboard/settings, /dashboard/profile)
 * - Route groups ((marketing)/marketing-page → /marketing-page)
 * - Reuse routes (about-alias.reuse.ts → /about-alias reusing About component)
 * - Markdown pages (.md files as routes)
 */
describe('Special Routes', () => {
  describe('Dynamic routes (/user/[id])', () => {
    it('renders user detail page with ID 1', async () => {
      const page = await new UserDetailPage(1).open();
      const heading = await page.heading();
      expect(heading).toContain('用户详情');
      const userId = await page.displayedUserId();
      expect(userId).toBe('1');
    });

    it('renders user detail page with ID 42', async () => {
      const page = await new UserDetailPage(42).open();
      const userId = await page.displayedUserId();
      expect(userId).toBe('42');
    });

    it('displays the route pattern', async () => {
      const page = await new UserDetailPage(1).open();
      const pattern = await page.displayedRoutePattern();
      expect(pattern).toContain('/user/[id]');
    });

    it('displays the resolved route', async () => {
      const page = await new UserDetailPage(5).open();
      const resolved = await page.displayedResolvedRoute();
      expect(resolved).toContain('/user/5');
    });

    it('displays the current URL', async () => {
      const page = await new UserDetailPage(7).open();
      const url = await page.displayedUrl();
      expect(url).toContain('/user/7');
    });

    it('handles non-numeric IDs gracefully', async () => {
      const page = await new UserDetailPage('abc').open();
      const userId = await page.displayedUserId();
      expect(userId).toBe('abc');
    });
  });

  describe('Nested routes (/dashboard/*)', () => {
    it('renders the dashboard index page', async () => {
      const page = await new DashboardPage().open();
      const heading = await page.heading();
      expect(heading).toContain('控制台');
    });

    it('navigates to settings sub-page', async () => {
      const page = await new DashboardPage().open();
      const result = await page.goToSettings();
      expect(result.url).toContain('/dashboard/settings');
      const settings = new DashboardSettingsPage();
      const heading = await settings.heading();
      expect(heading).toContain('设置');
    });

    it('navigates to profile sub-page', async () => {
      const page = await new DashboardPage().open();
      const result = await page.goToProfile();
      expect(result.url).toContain('/dashboard/profile');
      const profile = new DashboardProfilePage();
      const heading = await profile.heading();
      expect(heading).toContain('个人资料');
    });

    it('can access /dashboard/settings directly', async () => {
      const page = await new DashboardSettingsPage().open();
      const heading = await page.heading();
      expect(heading).toContain('设置');
    });

    it('can access /dashboard/profile directly', async () => {
      const page = await new DashboardProfilePage().open();
      const heading = await page.heading();
      expect(heading).toContain('个人资料');
    });
  });

  describe('Route groups ((marketing)/)', () => {
    it('serves /marketing-page without the group prefix in URL', async () => {
      const page = await new MarketingPage().open();
      const url = await page.url();
      expect(url).toContain('/marketing-page');
      expect(url).not.toContain('(marketing)');
    });

    it('renders the marketing page heading', async () => {
      const page = await new MarketingPage().open();
      const heading = await page.heading();
      expect(heading).toContain('营销页面');
      expect(heading).toContain('Route Group');
    });
  });

  describe('Reuse routes (about-alias.reuse.ts)', () => {
    it('serves /about-alias as a reuse of the About page', async () => {
      const page = await new AboutAliasPage().open();
      const heading = await page.heading();
      expect(heading).toContain('关于');
    });

    it('renders the same content as /about', async () => {
      const aliasPage = await new AboutAliasPage().open();
      const aboutPage = await new AboutPage().goto();
      const aliasHeading = await aliasPage.heading();
      const aboutHeading = await aboutPage.heading();
      expect(aliasHeading).toEqual(aboutHeading);
    });

    it('renders feature items (reusing About component)', async () => {
      const page = await new AboutAliasPage().open();
      const count = await page.featureCount();
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('Markdown pages (.md)', () => {
    it('renders the markdown page heading', async () => {
      const page = await new MarkdownPage().open();
      const heading = await page.heading();
      expect(heading).toContain('Markdown 页面测试');
    });

    it('renders h2 headings from markdown', async () => {
      const page = await new MarkdownPage().open();
      const count = await page.h2Count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('renders code blocks from markdown', async () => {
      const page = await new MarkdownPage().open();
      const count = await page.codeBlockCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('renders list items from markdown', async () => {
      const page = await new MarkdownPage().open();
      const count = await page.listItemCount();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('renders bold text (**text**)', async () => {
      const page = await new MarkdownPage().open();
      const strongCount = await page.count('strong');
      expect(strongCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('404 page', () => {
    it('returns 404 status for non-existent page', async () => {
      const res = await api.get('/this-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent API route', async () => {
      const res = await api.get('/api/no-such-route');
      expect(res.status).toBe(404);
    });
  });
});
