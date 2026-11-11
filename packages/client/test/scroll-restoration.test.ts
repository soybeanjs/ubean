// @vitest-environment happy-dom
/**
 * 滚动位置恢复（`vue-router/experimental` 的 `ScrollRestoration`）。
 *
 * 这条契约替代了已 deprecated 的 `scrollBehavior`：框架在客户端
 * `app.use(router)` 之前自动装插件，页面包装层（`getNamedPageWrapper`）自动
 * 调 `useScrollRestoration()` —— 页面和布局都不需要写任何东西。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createUbeanClientApp } from '../src/app';
import { createClientHead } from '../src/index';

const view = (id: string) =>
  defineComponent({
    name: id,
    setup: () => () => h('div', { id: `page-${id}`, style: 'height: 4000px' }, id)
  });

const routes = [
  { path: '/a', name: 'a', component: view('a') },
  { path: '/b', name: 'b', component: view('b') }
];

const makeApp = (options: Parameters<typeof createUbeanClientApp>[0] = {} as never) =>
  createUbeanClientApp({
    routes,
    resolveLayoutComponent: async () => null,
    head: createClientHead(),
    ...options
  });

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo(0, 0);
});

const settle = async () => {
  await nextTick();
  await nextTick();
  await nextTick();
};

describe('滚动位置恢复', () => {
  it('离开页面时保存位置，返回时恢复', async () => {
    const instance = makeApp();
    const host = document.createElement('div');
    instance.app.mount(host);
    await instance.router.push('/a');
    await settle();

    window.scrollTo(0, 300);
    await instance.router.push('/b');
    await settle();
    // 新页面没有保存位置 → 回到顶部（默认 restore 行为）。
    expect(window.scrollY).toBe(0);

    await instance.router.push('/a');
    await settle();
    expect(window.scrollY).toBe(300);
  });

  it('滚动位置存进 sessionStorage，且默认 key 含 path', async () => {
    const instance = makeApp();
    const host = document.createElement('div');
    instance.app.mount(host);
    await instance.router.push('/a');
    await settle();

    window.scrollTo(0, 120);
    await instance.router.push('/b');
    await settle();

    expect(sessionStorage.getItem('vue:scroll:/a')).toContain('120');
  });

  it('scrollRestoration: false 时不保存位置', async () => {
    const instance = makeApp({
      routes,
      router: { scrollRestoration: false, scrollBehavior: () => ({ top: 0 }) }
    } as never);
    const host = document.createElement('div');
    instance.app.mount(host);
    await instance.router.push('/a');
    await settle();

    window.scrollTo(0, 300);
    await instance.router.push('/b');
    await settle();

    // 插件才写 `vue:scroll:` 前缀；关掉后只剩 vue-router 内部的 `vue-router:scroll`。
    expect(Object.keys(sessionStorage).filter(k => k.startsWith('vue:scroll:'))).toEqual([]);
    expect((globalThis as any).__ubeanScrollRestoration).toBe(false);
  });

  it('router 不装默认 scrollBehavior（插件接管）', () => {
    const instance = makeApp();
    // createRouter 的 options 已消费掉，验证行为即可：默认策略来自插件。
    expect(instance.router.options.scrollBehavior).toBeUndefined();
  });
});
