/**
 * @ubean/client i18n — vue-i18n 封装
 */
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import {
  createUbeanI18n,
  configureI18nRuntime,
  localizePath,
  switchLocalePath,
  bindI18nRuntime,
  setLocale
} from '../src/i18n';

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

  it('setLocale 写入 composer locale 并 router.replace 到前缀路径', async () => {
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
