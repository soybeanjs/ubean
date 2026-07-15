import { describe, it, expect, beforeEach } from 'vitest';
import {
  useI18n,
  t,
  setLocale,
  getLocale,
  getRegisteredLocales,
  getDefaultLocale,
  getLocaleDir,
  getLocaleName,
  detectLocale,
  addLocale,
  mergeLocale,
  clearLocales,
  defineLocale,
  createI18nMiddleware,
  switchLocalePath,
  localeRoutes,
  localizePath,
  extractLocaleFromPath,
  getI18nConfig
} from 'ubean';
import { getJson } from './helper';
import enMessages from '../src/locales/en.json';
import zhMessages from '../src/locales/zh.json';

describe('i18n system', () => {
  beforeEach(() => {
    // Reset state and register base locales needed by tests
    clearLocales();
    addLocale('en', enMessages, { name: 'English', dir: 'ltr' });
    addLocale('zh', zhMessages, { name: 'Chinese', dir: 'ltr' });
    addLocale('ar', { common: { hello: 'مرحبا، {name}!' } }, { name: 'Arabic', dir: 'rtl' });
    setLocale('en');
  });

  describe('useI18n()', () => {
    it('returns the i18n instance', () => {
      const i18n = useI18n();
      expect(i18n).toBeDefined();
      expect(typeof i18n.t).toBe('function');
      expect(typeof i18n.setLocale).toBe('function');
      expect(typeof i18n.getLocale).toBe('function');
      expect(typeof i18n.d).toBe('function');
      expect(typeof i18n.n).toBe('function');
      expect(typeof i18n.c).toBe('function');
      expect(typeof i18n.relativeTime).toBe('function');
      expect(typeof i18n.list).toBe('function');
    });
  });

  describe('getLocale() / setLocale()', () => {
    it('getLocale returns current locale', () => {
      const locale = getLocale();
      expect(typeof locale).toBe('string');
    });

    it('setLocale changes current locale', () => {
      const before = getLocale();
      const locales = getRegisteredLocales();
      const other = locales.find(l => l !== before);
      if (other) {
        setLocale(other);
        expect(getLocale()).toBe(other);
        setLocale(before);
      }
    });
  });

  describe('getRegisteredLocales() / getDefaultLocale()', () => {
    it('getRegisteredLocales returns an array', () => {
      const locales = getRegisteredLocales();
      expect(Array.isArray(locales)).toBe(true);
    });

    it('getDefaultLocale returns a string', () => {
      const def = getDefaultLocale();
      expect(typeof def).toBe('string');
    });
  });

  describe('t() - translation', () => {
    it('translates a key', () => {
      const result = t('common.hello');
      expect(typeof result).toBe('string');
    });

    it('handles missing keys gracefully', () => {
      const result = t('nonexistent.key.xyz');
      expect(typeof result).toBe('string');
    });

    it('interpolates parameters', () => {
      const result = t('common.hello', { name: 'World' });
      expect(result).toContain('World');
    });
  });

  describe('getLocaleDir() - RTL support', () => {
    it('returns ltr for English', () => {
      const dir = getLocaleDir('en');
      expect(dir).toBe('ltr');
    });

    it('returns rtl for Arabic', () => {
      // Arabic should be RTL
      const dir = getLocaleDir('ar');
      expect(dir).toBe('rtl');
    });

    it('returns ltr for Chinese', () => {
      const dir = getLocaleDir('zh');
      expect(dir).toBe('ltr');
    });

    it('defaults to ltr for unknown locale', () => {
      const dir = getLocaleDir('xx');
      expect(dir).toBe('ltr');
    });
  });

  describe('getLocaleName()', () => {
    it('returns name for known locale', () => {
      const name = getLocaleName('en');
      expect(typeof name).toBe('string');
    });
  });

  describe('detectLocale()', () => {
    it('detects from Accept-Language header', () => {
      const detected = detectLocale('en-US,en;q=0.9');
      expect(typeof detected).toBe('string');
    });

    it('detects Chinese from Accept-Language', () => {
      const detected = detectLocale('zh-CN,zh;q=0.9,en;q=0.8');
      expect(detected).toBeTruthy();
    });

    it('falls back to default for unsupported language', () => {
      const detected = detectLocale('xx-XX,xx;q=0.9');
      expect(typeof detected).toBe('string');
    });
  });

  describe('addLocale() / mergeLocale() / defineLocale()', () => {
    it('addLocale registers a new locale', () => {
      addLocale('fr', { common: { hello: 'Bonjour' } }, { name: 'French' });
      const locales = getRegisteredLocales();
      expect(locales).toContain('fr');
    });

    it('mergeLocale adds messages to existing locale', () => {
      addLocale('de', { common: { hello: 'Hallo' } }, { name: 'German' });
      mergeLocale('de', { common: { bye: 'Tschüss' } });
      // Verify merge worked by switching locale and translating
      const prev = getLocale();
      setLocale('de');
      expect(t('common.hello')).toBe('Hallo');
      expect(t('common.bye')).toBe('Tschüss');
      setLocale(prev);
    });

    it('defineLocale returns the definition', () => {
      const def = defineLocale({
        code: 'es',
        name: 'Spanish',
        messages: { common: { hello: 'Hola' } }
      });
      expect(def.code).toBe('es');
      expect(def.name).toBe('Spanish');
    });
  });

  describe('createI18nMiddleware() - routing', () => {
    it('creates a middleware handler', () => {
      const middleware = createI18nMiddleware({
        strategy: 'prefix_except_default',
        defaultLocale: 'en',
        locales: ['en', 'zh']
      });
      expect(typeof middleware).toBe('function');
    });

    it('creates middleware for prefix strategy', () => {
      const middleware = createI18nMiddleware({
        strategy: 'prefix',
        defaultLocale: 'en',
        locales: ['en', 'zh']
      });
      expect(typeof middleware).toBe('function');
    });

    it('creates middleware for no_prefix strategy', () => {
      const middleware = createI18nMiddleware({
        strategy: 'no_prefix',
        defaultLocale: 'en',
        locales: ['en', 'zh']
      });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('localeRoutes() / localizePath() / extractLocaleFromPath()', () => {
    it('localeRoutes returns helpers', () => {
      const routes = localeRoutes(['en', 'zh'], 'en', 'prefix_except_default');
      expect(routes).toBeDefined();
      expect(typeof routes.getLocalizedPaths).toBe('function');
    });

    it('localizePath adds locale prefix for non-default', () => {
      const path = localizePath('/about', 'zh');
      expect(path).toContain('zh');
    });

    it('localizePath keeps path for default locale (prefix_except_default)', () => {
      const path = localizePath('/about', 'en');
      // With prefix_except_default, default locale has no prefix
      expect(path).toBe('/about');
    });

    it('extractLocaleFromPath extracts locale', () => {
      const { locale } = extractLocaleFromPath('/zh/about');
      expect(locale).toBe('zh');
    });

    it('extractLocaleFromPath returns null for no locale', () => {
      const { locale } = extractLocaleFromPath('/about');
      expect(locale).toBeNull();
    });
  });

  describe('switchLocalePath()', () => {
    it('switches locale in path', () => {
      const mockContext = { req: { url: 'http://localhost/zh/about' } } as any;
      const result = switchLocalePath(mockContext, 'en', 'prefix_except_default', 'en');
      expect(result).toContain('about');
    });
  });

  describe('getI18nConfig()', () => {
    it('returns the i18n config', () => {
      const config = getI18nConfig();
      expect(config).toBeDefined();
    });
  });

  describe('HTTP integration - /api/i18n-test', () => {
    it('info action returns i18n info', async () => {
      const res = await getJson('/api/i18n-test?action=info');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('currentLocale');
      expect(res.data).toHaveProperty('defaultLocale');
      expect(res.data).toHaveProperty('registeredLocales');
    });

    it('translate action returns translation', async () => {
      const res = await getJson('/api/i18n-test?action=translate&key=common.hello&name=Alice');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('translation');
      expect(res.data.translation).toContain('Alice');
    });

    it('setLocale action changes locale', async () => {
      const res = await getJson('/api/i18n-test?action=setLocale&locale=zh');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.after).toBe('zh');
    });

    it('plural action returns plural forms', async () => {
      const res = await getJson('/api/i18n-test?action=plural');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('plural');
    });

    it('linked action returns linked messages', async () => {
      const res = await getJson('/api/i18n-test?action=linked');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('greeting');
    });

    it('format action returns formatted values', async () => {
      const res = await getJson('/api/i18n-test?action=format');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('date');
      expect(res.data).toHaveProperty('number');
      expect(res.data).toHaveProperty('relativeTime');
      expect(res.data).toHaveProperty('list');
    });

    it('routing action returns routing info', async () => {
      const res = await getJson('/api/i18n-test?action=routing');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('localizePath');
      expect(res.data).toHaveProperty('extractLocaleFromPath');
    });

    it('detect action detects locale from Accept-Language', async () => {
      const res = await getJson('/api/i18n-test?action=detect', undefined);
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('detected');
    });

    it('translate in Chinese', async () => {
      await getJson('/api/i18n-test?action=setLocale&locale=zh');
      const res = await getJson('/api/i18n-test?action=translate&key=common.hello&name=世界');
      expect(res.status).toBe(200);
      expect(res.data.translation).toContain('世界');
    });
  });
});
