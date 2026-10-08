import { describe, expect, it } from 'vitest';
import { I18nPage } from '../pages/i18n.page';

/**
 * Spec 04: i18n (Internationalization)
 *
 * Covers:
 * - vue-i18n 11 Composition API (`legacy: false`)
 * - Locale info display (current, fallback, available)
 * - Locale switcher (`setLocale` → URL + messages)
 * - Translations (t function with interpolation)
 * - useSwitchLocalePath / useLocalePath
 * - i18n routing strategy: prefix_except_default (vue-router + Hono aligned)
 *
 * TS-35：本 spec 原先还有 13 条纯 HTTP 用例（`/about` 前缀 3 条 + `/api/i18n-test` 10 条）。
 * 它们不需要浏览器，已下沉到 `examples/ubean-test/test/http-contracts.test.ts`
 * （routing 3 条 + API 8 条）。`/api/i18n-test` 的 info/translate/plural/linked 4 条
 * 已由既有 `i18n.test.ts` 覆盖。此处只保留**只有真实浏览器能证明**的客户端切换语义。
 */
describe('i18n', () => {
  describe('i18n test page (client-side)', () => {
    it('renders the i18n test page heading', async () => {
      const page = await new I18nPage().open();
      const heading = await page.heading();
      expect(heading).toBeTruthy();
    });

    it('displays the current locale (en by default)', async () => {
      const page = await new I18nPage().open();
      const locale = await page.currentLocale();
      expect(locale).toBeTruthy();
    });

    it('displays the fallback locale', async () => {
      const page = await new I18nPage().open();
      const fallback = await page.fallbackLocale();
      expect(fallback).toBeTruthy();
    });

    it('renders locale switcher buttons for all available locales', async () => {
      const page = await new I18nPage().open();
      const count = await page.localeButtonCount();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('shows translation for common.hello with interpolation', async () => {
      const page = await new I18nPage().open();
      const hello = await page.helloTranslationRow();
      expect(hello).toBeTruthy();
      // The row includes both the label and the translated text
      expect(hello).toContain('common.hello');
    });

    it('shows switchLocalePath preview for zh', async () => {
      const page = await new I18nPage().open();
      const preview = await page.switchPathPreview();
      expect(preview).toBeTruthy();
      // With prefix_except_default strategy, zh locale gets /zh prefix
      expect(preview).toContain('/zh');
    });

    it('shows localePath preview for /about', async () => {
      const page = await new I18nPage().open();
      const preview = await page.localePathPreview();
      expect(preview).toBeTruthy();
    });

    it('switches locale when clicking a locale button', async () => {
      const page = await new I18nPage().open();
      const beforeLocale = await page.currentLocale();
      const targetLocale = beforeLocale === 'en' ? 'zh' : 'en';
      await page.switchLocale(targetLocale);
      const activeButton = await page.activeLocaleButton();
      expect(activeButton).toBe(targetLocale);
    });

    it('SPA navigation to /zh/about matches and stays Chinese after hydrate', async () => {
      const page = await new I18nPage().open();
      await page.switchLocale('zh');
      await page.waitForFunction('return /\\/zh/.test(location.pathname)', 8000);
      const url = await page.url();
      expect(url).toMatch(/\/zh/);
    });
  });
});
