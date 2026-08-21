import type { ResolvedI18nConfig } from '@ubean/config';
import { getVueLocaleParam } from '@ubean/i18n';

export function serializeI18nConfig(config: ResolvedI18nConfig): string {
  return JSON.stringify(config);
}

export function localeVueParamFromI18n(config: ResolvedI18nConfig): string | undefined {
  if (!config.enabled) return undefined;
  const param = getVueLocaleParam({
    defaultLocale: config.defaultLocale,
    locales: config.locales.map(l => l.code),
    strategy: config.strategy
  });
  return param || undefined;
}
