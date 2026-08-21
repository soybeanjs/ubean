import { describe, it, expect } from 'vitest';
import {
  t,
  runWithI18n,
  createRequestContext,
  setLocaleMessages,
  compileLocalePaths,
  localizePath,
  extractLocaleFromPath,
  createI18nMiddleware,
  detectLocaleFromAcceptLanguage
} from 'ubean';
import { getJson } from './helper';

const routing = {
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  strategy: 'prefix_except_default' as const
};

describe('i18n', () => {
  it('compileLocalePaths prefix_except_default 不含 /en/about', () => {
    const compiled = compileLocalePaths('/about', routing);
    expect(compiled.hono.map(h => h.path).sort()).toEqual(['/about', '/zh/about']);
  });

  it('localizePath / extractLocaleFromPath', () => {
    expect(localizePath('/about', 'zh', routing)).toBe('/zh/about');
    expect(localizePath('/about', 'en', routing)).toBe('/about');
    expect(extractLocaleFromPath('/zh/about', routing.locales).locale).toBe('zh');
  });

  it('detectLocaleFromAcceptLanguage', () => {
    expect(detectLocaleFromAcceptLanguage('zh-CN,zh;q=0.9', ['en', 'zh'], 'en')).toBe('zh');
  });

  it('createI18nMiddleware 返回函数', () => {
    expect(typeof createI18nMiddleware({ ...routing, detectBrowserLanguage: { redirectOn: 'root' } })).toBe('function');
  });

  it('ALS t() 按请求 locale 翻译', async () => {
    setLocaleMessages('en', { hello: 'Hello {name}' });
    setLocaleMessages('zh', { hello: '你好 {name}' });
    const zh = await runWithI18n({ locale: 'zh', fallbackLocale: 'en', ctx: createRequestContext('zh', 'en') }, () =>
      t('hello', { name: 'ubean' })
    );
    expect(zh).toContain('你好');
  });

  describe('HTTP /api/i18n-test', () => {
    it('info', async () => {
      const res = await getJson('/api/i18n-test?action=info');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('currentLocale');
      expect((res.data as { registeredLocales: string[] }).registeredLocales).toContain('en');
    });

    it('translate', async () => {
      const res = await getJson('/api/i18n-test?action=translate&key=common.hello&name=Alice');
      expect(res.status).toBe(200);
      expect((res.data as { translation: string }).translation).toContain('Alice');
    });

    it('translate zh', async () => {
      const res = await getJson('/api/i18n-test?action=translate&locale=zh&key=common.hello&name=World');
      expect(res.status).toBe(200);
      expect((res.data as { locale: string }).locale).toBe('zh');
      expect((res.data as { translation: string }).translation).toContain('你好');
    });

    it('SSR HTML payload includes routing for client hydration', async () => {
      const res = await getJson('/i18n');
      expect(res.status).toBe(200);
      expect(res.text).toContain('__UBEAN_LOCALE__');
      expect(res.text).toContain('"strategy":"prefix_except_default"');
      expect(res.text).toContain('/zh/i18n');
    });

    it('plural', async () => {
      const res = await getJson('/api/i18n-test?action=plural');
      expect(res.status).toBe(200);
      const plural = (res.data as { plural: Record<string, string> }).plural;
      expect(plural['items.count']).toContain('item');
    });

    it('linked', async () => {
      const res = await getJson('/api/i18n-test?action=linked');
      expect(res.status).toBe(200);
      expect((res.data as { nested: string }).nested).toContain('Home');
    });

    it('detect', async () => {
      const res = await getJson('/api/i18n-test?action=detect');
      expect(res.data).toHaveProperty('detected');
    });
  });
});
