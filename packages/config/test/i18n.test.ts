import { describe, it, expect } from 'vitest';
import { localePathsOf, pathsOf, resolveI18nConfig } from '../src/i18n';

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

describe('i18n.locales[].path (BCP-47 code, short URL segment)', () => {
  it('exposes overrides as `paths`, keyed by code', () => {
    const resolved = resolveI18nConfig({
      locales: [
        { code: 'en' },
        { code: 'zh-CN', path: 'zh' },
        { code: 'pt-BR', path: 'pt' }
      ]
    });
    expect(resolved.paths).toEqual({ 'zh-CN': 'zh', 'pt-BR': 'pt' });
    expect(localePathsOf(resolved)).toEqual({ 'zh-CN': 'zh', 'pt-BR': 'pt' });
  });

  it('omits `paths` entirely when no locale overrides its segment', () => {
    const resolved = resolveI18nConfig({ locales: ['en', 'zh'] });
    expect(resolved.paths).toBeUndefined();
    expect(localePathsOf(resolved)).toBeUndefined();
  });

  it('drops a redundant `path` equal to the code', () => {
    expect(pathsOf([{ code: 'zh', path: 'zh' }])).toBeUndefined();
  });

  it('throws when two locales claim the same URL segment', () => {
    // Silent outcome would be route shadowing: whichever locale registered last
    // serves `/zh/*`, and the other silently stops resolving.
    expect(() =>
      resolveI18nConfig({
        locales: [
          { code: 'zh-CN', path: 'zh' },
          { code: 'zh-TW', path: 'zh' }
        ]
      })
    ).toThrow(/both use the URL segment `zh`/);
  });

  it('treats a missing path as the code when checking collisions', () => {
    expect(() =>
      resolveI18nConfig({
        locales: [{ code: 'zh' }, { code: 'zh-CN', path: 'zh' }]
      })
    ).toThrow(/both use the URL segment `zh`/);
  });
});
