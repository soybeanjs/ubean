// @vitest-environment happy-dom
/**
 * 应用实例访问面（`useUbeanApp` / `useUbeanRouter` / `UBEAN_APP_KEY`）。
 *
 * 锁住两条互相补充的契约：
 * 1. **客户端**：模块级单例在 `createUbeanClientApp()` 之后可用，且 `useUbeanApp()`
 *    不依赖组件上下文（这正是它存在的理由 —— `useRouter()` 只能在 setup() 里调）。
 * 2. **服务端**：`createUbeanSSRApp()` **不**写单例（SSR 实例每请求新建，模块级变量
 *    会被并发请求覆盖），只 provide `UBEAN_APP_KEY`，因此组件内 `inject` 是唯一取法。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h, inject } from 'vue';
import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { PageObject } from '@ubean/pages';
import { createUbeanClientApp, createUbeanSSRApp } from '../src/app';
import { createClientHead } from '../src/index';
import { createServerHead } from '../src/server';
import {
  UBEAN_APP_KEY,
  useUbeanApp,
  useUbeanRouter,
  getUbeanAppInstance,
  setUbeanAppInstance
} from '../src/app-instance';

const routes = [{ path: '/', name: 'index', component: { render: () => h('div', 'home') } }];

const resolveLayoutComponent = async (): Promise<Component | null> => null;

beforeEach(() => {
  // 模块级单例是全局状态 —— 用例之间必须隔离，否则顺序会互相影响。
  setUbeanAppInstance(null);
});

describe('UBEAN_APP_KEY / 应用实例访问', () => {
  it('createUbeanClientApp 注册模块级单例，且无需组件上下文即可取用', () => {
    const instance = createUbeanClientApp({
      routes,
      resolveLayoutComponent,
      head: createClientHead()
    });

    // 这是本特性的核心价值：不在 setup() 里也能拿到 router。
    expect(useUbeanApp()).toBe(instance);
    expect(useUbeanRouter()).toBe(instance.router);
    expect(getUbeanAppInstance()).toBe(instance);
  });

  it('createUbeanSSRApp 只 provide，不注册模块级单例', () => {
    createUbeanSSRApp(
      { component: 'index', props: {}, params: {}, url: '/' } as PageObject,
      {
        routes,
        resolveLayoutComponent,
        head: createServerHead()
      }
    );

    // 服务端并发下模块级单例不安全 → 必须保持为 null，调用者会被明确告知改用 inject。
    expect(getUbeanAppInstance()).toBeNull();
    expect(() => useUbeanApp()).toThrow(/UBEAN_APP_KEY/);
  });

  it('未创建应用时 useUbeanApp 抛错，错误信息指向 inject 写法', () => {
    expect(() => useUbeanApp()).toThrow(/useUbeanApp\(\) 取不到应用实例/);
    expect(() => useUbeanRouter()).toThrow(/useUbeanApp\(\) 取不到应用实例/);
  });

  it('createUbeanClientApp 与 createUbeanSSRApp 都在实例上 provide 了 UBEAN_APP_KEY', async () => {
    // 用 `appRoot` 当探针：它是唯一由 `createRootComponent` **同步**渲染的用户组件
    // （页面/布局都是异步解析的，挂载后不会立即渲染，探针会看不到任何东西）。
    const seen: unknown[] = [];
    const Probe = defineComponent({
      name: 'AppKeyProbe',
      setup(_props, { slots }) {
        seen.push(inject(UBEAN_APP_KEY, null));
        return () => h('div', slots.default?.());
      }
    });

    const clientApp = createUbeanClientApp({
      routes,
      resolveLayoutComponent,
      head: createClientHead(),
      appRoot: Probe
    });
    clientApp.app.mount(document.createElement('div'));

    const ssrApp = createUbeanSSRApp(
      { component: 'index', props: {}, params: {}, url: '/' } as PageObject,
      {
        routes,
        resolveLayoutComponent,
        head: createServerHead(),
        appRoot: Probe
      }
    );
    await renderToString(ssrApp.app);

    expect(seen).toHaveLength(2);
    // 两端 provide 的都必须是返回值本身（同一个实例对象）。
    expect(seen[0]).toBe(clientApp);
    expect(seen[1]).toBe(ssrApp);
  });

  it('SSR 渲染期组件内 inject(UBEAN_APP_KEY) 可取到 router 并用于生成 URL', async () => {
    // appRoot 是用户代码在 SSR 下唯一能插手组件树的位置 —— 也正是「渲染期需要 router」
    // 的典型场景（如根据当前路由决定 theme-color）。这里用它当探针。
    const Probe = defineComponent({
      name: 'SsrAppKeyProbe',
      setup() {
        const instance = inject(UBEAN_APP_KEY, null);
        return () =>
          h('span', { id: 'probe' }, instance ? instance.router.resolve('/').href : 'no-instance');
      }
    });

    const { app, router } = createUbeanSSRApp(
      { component: 'index', props: {}, params: {}, url: '/' } as PageObject,
      { routes, resolveLayoutComponent, head: createServerHead(), appRoot: Probe }
    );
    await router.isReady();

    const html = await renderToString(app);
    expect(html).toContain('id="probe"');
    expect(html).not.toContain('no-instance');
  });
});
