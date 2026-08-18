/**
 * @ubean/client i18n Vue 包装层测试
 *
 * 重点回归(浏览器验证曾发现的响应性丢失):模块级 `t()` / `localizePath()`
 * 必须建立对 `localeRef` 的响应式依赖,`setLocale` 才能驱动 effect 重算。
 */
import { describe, it, expect } from 'vitest';
import { effect, stop } from 'vue';
import { defineLocale, setLocale, getLocale, t, localizePath } from '../src/i18n';

describe('i18n Vue 包装层', () => {
  it('defineLocale 注册后 t() 按 locale 解析;setLocale 切换生效', () => {
    defineLocale({ code: 'zh', dir: 'ltr', isDefault: true, messages: { 'nav.home': '首页', greeting: '你好,{name}' } });
    defineLocale({ code: 'en', dir: 'ltr', messages: { 'nav.home': 'Home', greeting: 'Hello,{name}' } });

    expect(t('nav.home')).toBe('首页'); // 默认 zh
    expect(t('greeting', { name: 'ubean' })).toBe('你好,ubean');

    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('nav.home')).toBe('Home');

    setLocale('zh');
    expect(t('nav.home')).toBe('首页');
  });

  it('t() / localizePath() 建立响应式依赖 —— setLocale 驱动 effect 重算(回归)', () => {
    defineLocale({ code: 'zh', dir: 'ltr', isDefault: true, messages: { 'nav.home': '首页' } });
    defineLocale({ code: 'en', dir: 'ltr', messages: { 'nav.home': 'Home' } });

    let translated = '';
    const runner = effect(() => {
      translated = t('nav.home');
      void localizePath('/about');
    });

    expect(translated).toBe('首页');

    setLocale('en');
    expect(translated).toBe('Home'); // effect 依赖 localeRef,sync 调度立即重算

    setLocale('zh');
    expect(translated).toBe('首页');

    stop(runner);
  });
});
