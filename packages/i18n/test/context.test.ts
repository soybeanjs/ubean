import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  runWithI18n,
  createRequestContext,
  t,
  setLocaleMessages,
  registerLocaleLoader,
  ensureLocaleMessages
} from '../src/context';
import { createI18nMiddleware } from '../src/routing';

describe('ALS isolation', () => {
  afterEach(() => {
    registerLocaleLoader(undefined);
  });
  it('并行两个 locale 不串译', async () => {
    setLocaleMessages('en', { hello: 'Hello' });
    setLocaleMessages('zh', { hello: '你好' });

    const run = (locale: string) =>
      runWithI18n({ locale, fallbackLocale: 'en', ctx: createRequestContext(locale, 'en') }, async () => {
        await new Promise(r => setTimeout(r, locale === 'zh' ? 20 : 5));
        return t('hello');
      });

    const [en, zh] = await Promise.all([run('en'), run('zh')]);
    expect(en).toBe('Hello');
    expect(zh).toBe('你好');
  });

  it('无 ALS 时 t() 抛错', () => {
    expect(() => t('hello')).toThrow(/outside request scope/);
  });

  it('同 locale 第二次 createRequestContext 复用编译缓存', () => {
    setLocaleMessages('en', { hello: 'Hello' });
    const a = createRequestContext('en', 'en');
    const b = createRequestContext('en', 'en');
    expect(a).toBe(b);
    setLocaleMessages('en', { hello: 'Hi' });
    const c = createRequestContext('en', 'en');
    expect(c).not.toBe(a);
  });

  it('registerLocaleLoader 供 ensureLocaleMessages 调用', async () => {
    const loaded: string[] = [];
    registerLocaleLoader(async code => {
      loaded.push(code);
      setLocaleMessages(code, { hello: 'ok' });
    });
    await ensureLocaleMessages('en', 'zh');
    expect(loaded).toEqual(['en', 'zh']);
    const out = runWithI18n({ locale: 'en', fallbackLocale: 'zh', ctx: createRequestContext('en', 'zh') }, () =>
      t('hello')
    );
    expect(out).toBe('ok');
  });

  it('具名插值 {name}', () => {
    setLocaleMessages('en', { hello: 'Hello, {name}!' });
    const out = runWithI18n({ locale: 'en', fallbackLocale: 'en', ctx: createRequestContext('en', 'en') }, () =>
      t('hello', { name: 'Alice' })
    );
    expect(out).toBe('Hello, Alice!');
  });
});

describe('createI18nMiddleware', () => {
  const app = new Hono();
  app.use(
    '*',
    createI18nMiddleware({
      defaultLocale: 'en',
      locales: ['en', 'zh'],
      strategy: 'prefix_except_default',
      detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root' }
    })
  );
  app.get('/about', c => c.text(c.get('locale') as string));
  app.get('/zh/about', c => c.text(c.get('locale') as string));
  app.get('/', c => c.text(c.get('locale') as string));

  it('URL 前缀命中写 cookie', async () => {
    const res = await app.request('/zh/about');
    expect(await res.text()).toBe('zh');
    expect(res.headers.get('set-cookie')).toMatch(/ubean_locale=zh/);
  });

  it('redirectOn root: / 可因 Accept-Language 302，/about 不 302', async () => {
    const root = await app.request('/', { headers: { 'accept-language': 'zh' } });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/zh');

    const about = await app.request('/about', { headers: { 'accept-language': 'zh' } });
    expect(about.status).toBe(200);
    expect(await about.text()).toBe('en');
  });

  it('prefix_except_default 下 /en/about 302 到无前缀', async () => {
    const res = await app.request('/en/about');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/about');
  });

  it('cookie 优先于 Accept-Language', async () => {
    const res = await app.request('/', {
      headers: { 'accept-language': 'en', cookie: 'ubean_locale=zh' }
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/zh');
  });

  it('/api/ 仍进入 ALS 且不改 URL', async () => {
    setLocaleMessages('zh', { hello: '你好' });
    const apiApp = new Hono();
    apiApp.use(
      '*',
      createI18nMiddleware({
        defaultLocale: 'en',
        locales: ['en', 'zh'],
        strategy: 'prefix_except_default',
        detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root' }
      })
    );
    apiApp.get('/api/ping', c => c.text(t('hello')));
    const res = await apiApp.request('/api/ping', { headers: { cookie: 'ubean_locale=zh' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('你好');
  });
});

describe('createI18nMiddleware prefix', () => {
  const app = new Hono();
  app.use(
    '*',
    createI18nMiddleware({
      defaultLocale: 'en',
      locales: ['en', 'zh'],
      strategy: 'prefix',
      detectBrowserLanguage: { cookieName: 'ubean_locale', redirectOn: 'root' }
    })
  );
  app.get('/en/about', c => c.text('en'));
  app.get('/zh/about', c => c.text('zh'));

  it('无前缀内容路径必须 302', async () => {
    const res = await app.request('/about');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/en/about');
  });
});
