import { describe, it, expect } from 'vitest';
import { buildLocaleHead } from '../src/head';
import type { LocaleRoutingConfig } from '../src/types';

const locales = [
  { code: 'en', language: 'en', dir: 'ltr' as const, isDefault: true },
  { code: 'zh', language: 'zh-CN', dir: 'ltr' as const }
];

describe('buildLocaleHead', () => {
  it('prefix_except_default: hreflang + x-default + og:locale', () => {
    const routing: LocaleRoutingConfig = {
      defaultLocale: 'en',
      locales: ['en', 'zh'],
      strategy: 'prefix_except_default'
    };
    const tags = buildLocaleHead({
      path: '/zh/about',
      locale: 'zh',
      locales,
      routing,
      baseUrl: 'https://example.com'
    });
    expect(tags.htmlAttrs.lang).toBe('zh-CN');
    expect(
      tags.link.some(l => l.rel === 'alternate' && l.hreflang === 'zh-CN' && l.href === 'https://example.com/zh/about')
    ).toBe(true);
    expect(
      tags.link.some(l => l.rel === 'alternate' && l.hreflang === 'x-default' && l.href === 'https://example.com/about')
    ).toBe(true);
    expect(tags.meta.some(m => m.property === 'og:locale' && m.content === 'zh_CN')).toBe(true);
  });

  it('prefix_and_default: 默认语言 canonical 指向无前缀', () => {
    const routing: LocaleRoutingConfig = {
      defaultLocale: 'en',
      locales: ['en', 'zh'],
      strategy: 'prefix_and_default'
    };
    const tags = buildLocaleHead({
      path: '/en/about',
      locale: 'en',
      locales,
      routing,
      baseUrl: 'https://example.com'
    });
    const canonical = tags.link.find(l => l.rel === 'canonical');
    expect(canonical?.href).toBe('https://example.com/about');
  });
});
