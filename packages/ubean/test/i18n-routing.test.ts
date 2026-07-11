import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { defineLocale, clearLocales } from '../src/runtime/i18n';
import { createI18nMiddleware, localeRoutes } from '../src/runtime/i18n-routing';

describe('i18n routing middleware', () => {
  beforeEach(() => {
    clearLocales();
    defineLocale({ code: 'en', messages: { hello: 'Hello' }, isDefault: true });
    defineLocale({ code: 'fr', messages: { hello: 'Bonjour' } });
    defineLocale({ code: 'zh', messages: { hello: '你好' } });
  });

  it('extracts locale from URL prefix', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({ strategy: 'prefix', defaultLocale: 'en', locales: ['en', 'fr', 'zh'] }));
    app.get('*', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/fr/about');
    expect(await res.json()).toEqual({ locale: 'fr' });
    expect(res.headers.get('Content-Language')).toBe('fr');
  });

  it('prefix_except_default uses default locale for root paths', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'prefix_except_default',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: false,
      detectFromCookie: false,
      redirectOnLocaleMismatch: false
    }));
    app.get('*', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/about');
    expect(await res.json()).toEqual({ locale: 'en' });
  });

  it('prefix_except_default extracts non-default locale from prefix', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'prefix_except_default',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: false,
      detectFromCookie: false,
      redirectOnLocaleMismatch: false
    }));
    app.get('*', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/zh/about');
    expect(await res.json()).toEqual({ locale: 'zh' });
  });

  it('prefix strategy redirects root to default locale prefix', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'prefix',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: false,
      detectFromCookie: false
    }));
    app.get('*', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/about', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/en/about');
  });

  it('detects locale from Accept-Language header', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'prefix_except_default',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: true,
      detectFromCookie: false,
      redirectOnLocaleMismatch: true
    }));
    app.get('*', (c) => c.json({ ok: true }));

    const res = await app.request('/', {
      headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      redirect: 'manual'
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/fr');
  });

  it('no_prefix strategy does not add prefix', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'no_prefix',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: true,
      detectFromCookie: false
    }));
    app.get('/about', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/about', { headers: { 'Accept-Language': 'fr' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locale: 'fr' });
  });

  it('detects locale from cookie', async () => {
    const app = new Hono();
    app.use('*', createI18nMiddleware({
      strategy: 'no_prefix',
      defaultLocale: 'en',
      locales: ['en', 'fr', 'zh'],
      detectFromHeader: false,
      detectFromCookie: true,
      cookieName: 'ubean_locale'
    }));
    app.get('*', (c) => c.json({ locale: c.get('locale') as string }));

    const res = await app.request('/about', { headers: { cookie: 'ubean_locale=zh' } });
    expect(await res.json()).toEqual({ locale: 'zh' });
  });
});

describe('localeRoutes helper', () => {
  beforeEach(() => {
    clearLocales();
    defineLocale({ code: 'en', messages: {}, isDefault: true });
    defineLocale({ code: 'fr', messages: {} });
  });

  it('localizePath with prefix_except_default', () => {
    const { localizePath } = localeRoutes(['en', 'fr'], 'en', 'prefix_except_default');
    expect(localizePath('/about', 'en')).toBe('/about');
    expect(localizePath('/about', 'fr')).toBe('/fr/about');
    expect(localizePath('/', 'fr')).toBe('/fr');
    expect(localizePath('/', 'en')).toBe('/');
  });

  it('localizePath with prefix strategy', () => {
    const { localizePath } = localeRoutes(['en', 'fr'], 'en', 'prefix');
    expect(localizePath('/about', 'en')).toBe('/en/about');
    expect(localizePath('/about', 'fr')).toBe('/fr/about');
  });

  it('localizePath with no_prefix', () => {
    const { localizePath } = localeRoutes(['en', 'fr'], 'en', 'no_prefix');
    expect(localizePath('/about', 'fr')).toBe('/about');
  });

  it('getLocaleFromUrl extracts locale', () => {
    const { getLocaleFromUrl } = localeRoutes(['en', 'fr', 'zh'], 'en', 'prefix_except_default');
    expect(getLocaleFromUrl('/fr/about')).toBe('fr');
    expect(getLocaleFromUrl('/about')).toBeNull();
    expect(getLocaleFromUrl('/zh')).toBe('zh');
  });

  it('getLocalizedPaths returns all locale variants', () => {
    const { getLocalizedPaths } = localeRoutes(['en', 'fr'], 'en', 'prefix_except_default');
    const paths = getLocalizedPaths('/about');
    expect(paths).toEqual([
      { locale: 'en', path: '/about' },
      { locale: 'fr', path: '/fr/about' }
    ]);
  });
});
