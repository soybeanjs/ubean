import { describe, it, expect } from 'vitest';
import { resolveI18nConfig } from '../src/i18n';

describe('resolveI18nConfig()', () => {
  it('undefined → enabled, default en, redirectOn root', () => {
    const resolved = resolveI18nConfig();
    expect(resolved.enabled).toBe(true);
    expect(resolved.defaultLocale).toBe('en');
    expect(resolved.locales).toEqual([{ code: 'en' }]);
    expect(resolved.strategy).toBe('prefix_except_default');
    expect(resolved.detectBrowserLanguage).toEqual({
      cookieName: 'ubean_locale',
      redirectOn: 'root',
      alwaysRedirect: false
    });
  });

  it('false → enabled: false', () => {
    expect(resolveI18nConfig(false).enabled).toBe(false);
    expect(resolveI18nConfig(false).detectBrowserLanguage).toBe(false);
  });

  it('string[] locales 正规化为 { code }[]', () => {
    const resolved = resolveI18nConfig({ locales: ['en', 'zh'] });
    expect(resolved.locales).toEqual([{ code: 'en' }, { code: 'zh' }]);
  });

  it('detectBrowserLanguage: false 保持关闭', () => {
    expect(resolveI18nConfig({ detectBrowserLanguage: false }).detectBrowserLanguage).toBe(false);
  });

  it('detectBrowserLanguage 对象合并默认 redirectOn: root', () => {
    const resolved = resolveI18nConfig({
      detectBrowserLanguage: { cookieName: 'lang' }
    });
    expect(resolved.detectBrowserLanguage).toEqual({
      cookieName: 'lang',
      redirectOn: 'root',
      alwaysRedirect: false
    });
  });
});
