/**
 * @ubean/client i18n — vue-i18n 封装
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, h } from 'vue';
import {
  createUbeanI18n,
  configureI18nRuntime,
  localizePath,
  switchLocalePath,
  bindI18nRuntime,
  setLocale,
  getLocale,
  getAvailableLocales,
  extractLocaleFromPath
} from '../src/i18n';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createUbeanI18n', () => {
  it('legacy: false 且 messages 可 t()', () => {
    configureI18nRuntime({
      config: {
        defaultLocale: 'en',
        locales: ['en', 'zh'],
        strategy: 'prefix_except_default',
        fallbackLocale: 'en',
        cookieName: 'ubean_locale',
        baseUrl: ''
      }
    });
    const i18n = createUbeanI18n({
      locale: 'zh',
      fallbackLocale: 'en',
      messages: {
        zh: { hello: '你好 {name}' },
        en: { hello: 'Hello {name}' }
      }
    });
    expect(i18n.mode).toBe('composition');
    expect(i18n.global.t('hello', { name: 'ubean' })).toBe('你好 ubean');
  });

  it('localizePath 按 runtime config 加前缀', () => {
    expect(localizePath('/about', 'zh')).toBe('/zh/about');
    expect(localizePath('/about', 'en')).toBe('/about');
  });

  it('switchLocalePath prefix_except_default 给非默认语言加前缀', () => {
    expect(switchLocalePath('zh', '/i18n')).toBe('/zh/i18n');
    expect(switchLocalePath('en', '/zh/i18n')).toBe('/i18n');
  });

  it('setLocale 浏览器环境写入 composer locale 并 router.replace 到前缀路径', async () => {
    vi.stubGlobal('window', { location: { pathname: '/' } });
    const i18n = createUbeanI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: {}, zh: {} }
    });
    const replaced: string[] = [];
    bindI18nRuntime(i18n, {
      currentRoute: { value: { path: '/i18n', fullPath: '/i18n' } },
      replace: async (to: string) => {
        replaced.push(to);
      }
    } as never);
    await setLocale('zh');
    expect(String(i18n.global.locale.value)).toBe('zh');
    expect(replaced).toEqual(['/zh/i18n']);
  });

  it('setLocale SSR（无 window）不触发 router.replace，防止导航守卫死循环', async () => {
    // 回归测试（2026-09-10 docs SSG 构建挂死）：守卫中调用 setLocale 时，
    // 对共享/陈旧 memory-history router 的 replace 会取消进行中的初始导航，
    // 且守卫条件永假导致 replace 无限循环、事件循环饥饿。
    const i18n = createUbeanI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: {}, zh: {} }
    });
    const replaced: string[] = [];
    bindI18nRuntime(i18n, {
      currentRoute: { value: { path: '/i18n', fullPath: '/i18n' } },
      replace: async (to: string) => {
        replaced.push(to);
      }
    } as never);
    await setLocale('zh');
    expect(String(i18n.global.locale.value)).toBe('zh');
    expect(replaced).toEqual([]);
  });

  it('getLocale 在 setup 外回退到已绑定 composer 的 locale', async () => {
    const i18n = createUbeanI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: {}, zh: {} }
    });
    // 未绑定 i18n 时回退到 config 默认值
    bindI18nRuntime({ global: { locale: { value: 'en' } } } as never);
    expect(getLocale()).toBe('en');
    // setLocale 后 getLocale 反映切换结果（守卫条件不再永假）
    bindI18nRuntime(i18n);
    await setLocale('zh');
    expect(getLocale()).toBe('zh');
  });

  it('vue-router optional locale param 从 /i18n replace 到 /zh/i18n', async () => {
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:locale(zh)?/i18n', name: 'i18n', component: { render: () => null } },
        { path: '/:locale(zh)?/:pathMatch(.*)*', name: 'NotFound', component: { render: () => null } }
      ]
    });
    await router.push('/i18n');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/i18n');
    await router.replace('/zh/i18n');
    expect(router.currentRoute.value.path).toBe('/zh/i18n');
    expect(router.currentRoute.value.params.locale).toBe('zh');
  });

  it('app.use(i18n) 可挂载', () => {
    const i18n = createUbeanI18n({ locale: 'en', messages: { en: {} } });
    const app = createApp({ render: () => h('div') });
    app.use(i18n);
    expect(app._context.provides).toBeTruthy();
  });
});

describe('paths override (code stays BCP-47, URL uses a short segment)', () => {
  const config = {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    strategy: 'prefix_except_default' as const,
    fallbackLocale: 'en',
    cookieName: 'ubean_locale',
    baseUrl: '',
    paths: { 'zh-CN': 'zh' }
  };

  it('localizePath / switchLocalePath write the segment, not the code', () => {
    configureI18nRuntime({ config });
    expect(localizePath('/about', 'zh-CN')).toBe('/zh/about');
    expect(switchLocalePath('zh-CN', '/about')).toBe('/zh/about');
    expect(switchLocalePath('en', '/zh/about')).toBe('/about');
  });

  it('extractLocaleFromPath returns the code for a segment URL', () => {
    configureI18nRuntime({ config });
    expect(extractLocaleFromPath('/zh/about')).toEqual({ locale: 'zh-CN', pathWithoutLocale: '/about' });
  });

  it('getAvailableLocales falls back to configured codes with their segments', () => {
    // Empty `locales` clears any catalog metadata hydrated by an earlier case.
    configureI18nRuntime({ config, locales: [] });
    expect(getAvailableLocales()).toEqual([
      { code: 'en', dir: 'ltr', isDefault: true },
      { code: 'zh-CN', dir: 'ltr', path: 'zh' }
    ]);
  });

  it('getAvailableLocales prefers hydrated catalog metadata', () => {
    configureI18nRuntime({
      config,
      locales: [
        { code: 'en', language: 'en', name: 'English', dir: 'ltr', isDefault: true },
        { code: 'zh-CN', language: 'zh-CN', name: '简体中文', dir: 'ltr' }
      ]
    });
    const available = getAvailableLocales();
    expect(available).toEqual([
      { code: 'en', language: 'en', name: 'English', dir: 'ltr', isDefault: true },
      // `path` comes from the runtime config when the catalog does not carry it.
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文', dir: 'ltr', path: 'zh' }
    ]);
  });

  it('carries `language` so hreflang and og:locale survive a short URL segment', () => {
    // `code` is the identity, `path` is the URL segment, `language` is what
    // `<html lang>`, `hreflang` and `og:locale` must say. Dropping `language`
    // here silently degrades all three to the code.
    configureI18nRuntime({
      config,
      locales: [{ code: 'zh-CN', language: 'zh-Hans-CN', name: '简体中文', dir: 'ltr' }]
    });
    expect(getAvailableLocales()[0]).toMatchObject({ code: 'zh-CN', language: 'zh-Hans-CN', path: 'zh' });
  });

  it('keeps a hydrated `path` when the catalog provides one', () => {
    configureI18nRuntime({
      config: { ...config, paths: { 'zh-CN': 'zh-CN' } },
      locales: [{ code: 'zh-CN', path: 'zh', dir: 'ltr' }]
    });
    expect(getAvailableLocales()).toEqual([{ code: 'zh-CN', path: 'zh', dir: 'ltr' }]);
  });

  it('marks the configured default locale when no metadata was hydrated', () => {
    configureI18nRuntime({
      config: { ...config, defaultLocale: 'zh-CN' },
      locales: []
    });
    expect(getAvailableLocales()).toEqual([
      { code: 'en', dir: 'ltr' },
      { code: 'zh-CN', dir: 'ltr', path: 'zh', isDefault: true }
    ]);
  });
});

describe('legacy placeholder', () => {
  it('app.use(i18n) 可挂载', () => {
    const i18n = createUbeanI18n({ locale: 'en', messages: { en: {} } });
    const app = createApp({ render: () => h('div') });
    app.use(i18n);
    expect(app._context.provides).toBeTruthy();
  });
});
