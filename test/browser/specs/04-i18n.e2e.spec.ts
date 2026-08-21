import { describe, expect, it } from 'vitest';
import { api } from '../pages/base.page';
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
 * - Server-side i18n API (/api/i18n-test)
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

  describe('i18n routing (prefix_except_default strategy)', () => {
    it('serves /about without prefix for default locale (en)', async () => {
      const res = await api.get('/about');
      // Should return 200 (SSR HTML) — not a redirect
      expect(res.status).toBe(200);
    });

    it('serves /zh/about with zh prefix', async () => {
      const res = await api.get('/zh/about');
      expect(res.status).toBe(200);
    });

    it('redirects /en/about to /about (default locale has no prefix)', async () => {
      // prefix_except_default: a default-locale prefix is not a registered page
      // path. The i18n middleware 302s it to the unprefixed canonical URL.
      const res = await api.get('/en/about');
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe('/about');
    });
  });

  describe('Server-side i18n API (/api/i18n-test)', () => {
    it('returns i18n info with action=info', async () => {
      const res = await api.get('/api/i18n-test?action=info');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('currentLocale');
      expect(body).toHaveProperty('defaultLocale');
      expect(body).toHaveProperty('registeredLocales');
      expect(body.registeredLocales).toContain('en');
      expect(body.registeredLocales).toContain('zh');
    });

    it('translates keys with action=translate', async () => {
      const res = await api.get('/api/i18n-test?action=translate&key=common.hello&name=World');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('translation');
      expect(body.translation).toContain('World');
    });

    it('translates in zh locale', async () => {
      const res = await api.get('/api/i18n-test?action=translate&locale=zh&key=common.hello&name=World');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.locale).toBe('zh');
      expect(body).toHaveProperty('translation');
    });

    it('handles pluralization with action=plural', async () => {
      const res = await api.get('/api/i18n-test?action=plural');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('plural');
      expect(body.plural).toHaveProperty('items.count');
    });

    it('handles linked messages with action=linked', async () => {
      const res = await api.get('/api/i18n-test?action=linked');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('greeting');
      expect(body).toHaveProperty('nested');
    });

    it('handles routing helpers with action=routing', async () => {
      const res = await api.get('/api/i18n-test?action=routing');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('localizePath');
      expect(body.localizePath.home_en).toBe('/');
      expect(body.localizePath.home_zh).toBe('/zh');
    });

    it('detects locale from Accept-Language', async () => {
      const res = await api.get('/api/i18n-test?action=detect', {
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      });
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('detected');
      expect(body.detected).toBe('zh');
    });

    it('switches locale with action=setLocale', async () => {
      const res = await api.get('/api/i18n-test?action=setLocale&locale=zh');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body.success).toBe(true);
      expect(body.after).toBe('zh');
    });

    it('returns 400 for setLocale without locale param', async () => {
      const res = await api.get('/api/i18n-test?action=setLocale');
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown action', async () => {
      const res = await api.get('/api/i18n-test?action=unknown_action');
      expect(res.status).toBe(400);
    });
  });
});
