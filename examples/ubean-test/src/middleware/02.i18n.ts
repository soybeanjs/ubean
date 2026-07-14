import { defineMiddleware, createI18nMiddleware, setI18nConfig } from 'ubean';

// Set global i18n config (used by localizePath, switchLocalePath, etc.)
// Locale messages are auto-loaded by ubean:locales virtual module.
setI18nConfig({
  defaultLocale: 'en',
  strategy: 'prefix_except_default',
  locales: ['en', 'zh']
});

// Create i18n middleware instance once.
const i18nHandler = createI18nMiddleware({
  strategy: 'prefix_except_default',
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  detectFromHeader: true,
  detectFromCookie: true,
  redirectOnLocaleMismatch: false
});

export default defineMiddleware(async (c, next) => {
  return i18nHandler(c, next);
});
