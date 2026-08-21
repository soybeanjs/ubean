import { localizePath, extractLocaleFromPath } from './paths';
import type { I18nLocaleMeta, LocaleRoutingConfig } from './types';

export interface LocaleHeadInput {
  path: string;
  locale: string;
  locales: I18nLocaleMeta[];
  routing: LocaleRoutingConfig;
  baseUrl?: string;
}

export interface LocaleHeadTags {
  htmlAttrs: { lang: string; dir: 'ltr' | 'rtl' };
  link: Array<{ rel: string; href: string; hreflang?: string }>;
  meta: Array<{ property: string; content: string }>;
}

function abs(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function ogLocale(languageOrCode: string): string {
  return languageOrCode.replace(/-/g, '_');
}

function pagePathWithoutLocale(path: string, locales: string[]): string {
  return extractLocaleFromPath(path, locales).pathWithoutLocale;
}

/**
 * Build hreflang / canonical / og:locale tags.
 * `prefix_and_default` 下默认语言的 canonical 指向无前缀 URL，避免双 URL 重复收录。
 */
export function buildLocaleHead(input: LocaleHeadInput): LocaleHeadTags {
  const current = input.locales.find(l => l.code === input.locale);
  const lang = current?.language || input.locale;
  const dir = current?.dir || 'ltr';
  const clean = pagePathWithoutLocale(input.path, input.routing.locales);
  const codes = input.routing.locales;

  const link: LocaleHeadTags['link'] = [];
  const meta: LocaleHeadTags['meta'] = [];

  const languageGroups = new Map<string, I18nLocaleMeta>();
  for (const loc of input.locales) {
    const href = abs(input.baseUrl || '', localizePath(clean, loc.code, input.routing));
    const hreflang = loc.language || loc.code;
    link.push({ rel: 'alternate', href, hreflang });
    const group = hreflang.split('-')[0];
    if (!languageGroups.has(group)) languageGroups.set(group, loc);
  }

  for (const [group, loc] of languageGroups) {
    if (link.some(l => l.hreflang === group)) continue;
    link.push({
      rel: 'alternate',
      href: abs(input.baseUrl || '', localizePath(clean, loc.code, input.routing)),
      hreflang: group
    });
  }

  const defaultLoc =
    input.locales.find(l => l.isDefault) || input.locales.find(l => l.code === input.routing.defaultLocale);
  if (defaultLoc) {
    const defaultUnprefixed = abs(
      input.baseUrl || '',
      localizePath(clean, defaultLoc.code, { ...input.routing, locales: codes, strategy: 'prefix_except_default' })
    );
    link.push({ rel: 'alternate', href: defaultUnprefixed, hreflang: 'x-default' });

    const isDefaultLocale = input.locale === defaultLoc.code;
    const canonicalPath =
      isDefaultLocale && input.routing.strategy === 'prefix_and_default'
        ? defaultUnprefixed
        : abs(input.baseUrl || '', localizePath(clean, input.locale, input.routing));
    link.push({ rel: 'canonical', href: canonicalPath });
  }

  meta.push({ property: 'og:locale', content: ogLocale(lang) });
  for (const loc of input.locales) {
    if (loc.code === input.locale) continue;
    meta.push({ property: 'og:locale:alternate', content: ogLocale(loc.language || loc.code) });
  }

  return { htmlAttrs: { lang, dir }, link, meta };
}
