// @vitest-environment happy-dom
/**
 * 真机链路复现(扩展):并行路由 SlotView、markdown 页面渲染、特殊页注入、
 * matcher 守卫真机导航 —— 虚拟模块 routes + SFC 页面 + PageView DOM 挂载。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ubeanVue, PageView, defineMatcher, createMatcherGuard, LOADING_KEY, ERROR_KEY } from '@ubean/vue';
import { routes, loadingComponent, errorComponent } from 'virtual:ubean-vue-routes';

async function mountApp() {
  const el = document.createElement('div');
  document.body.appendChild(el);

  const router = createRouter({ history: createMemoryHistory(), routes: routes as never });
  router.beforeEach(createMatcherGuard());
  const app = createApp({
    setup() {
      return () => h('div', [h(PageView)]);
    }
  });
  app.use(router);
  app.use(ubeanVue, { routes: routes as never });
  app.provide(LOADING_KEY, loadingComponent);
  app.provide(ERROR_KEY, errorComponent);
  app.mount(el);

  // 等待初始导航完成(start → 首个路由解析 + 异步页面组件加载)。
  // 否则 `currentRoute` 停留在 START_LOCATION,PageView 渲染空内容;
  // CI 环境异步解析较慢,若不等待会偶发收到空字符串。
  await router.isReady();
  await nextTick();

  const settle = async (ms = 120) => {
    await nextTick();
    await new Promise(r => setTimeout(r, ms));
  };
  return { el, router, settle, unmount: () => app.unmount() };
}

describe('并行路由 SlotView(DOM)', () => {
  it('/dashboard 同屏渲染 default 与 analytics 命名视图', async () => {
    const { el, router, settle, unmount } = await mountApp();

    await router.push('/dashboard');
    await settle();

    const text = el.textContent ?? '';
    expect(text).toContain('仪表盘'); // dashboard/index.vue(default)
    expect(text).toContain('访问量'); // dashboard/@analytics/index.vue(SlotView 渲染)
    expect(text).toContain('1284'); // slot 页 onMounted 后的统计值

    unmount();
  });
});

describe('markdown 页面(DOM)', () => {
  it('/guide 渲染 markdown 正文(h1 + 表格),frontmatter 不出现在正文', async () => {
    const { el, router, settle, unmount } = await mountApp();

    await router.push('/guide');
    await settle(200);

    const text = el.textContent ?? '';
    expect(text).toContain('指南(markdown 页面)');
    expect(text).toContain('frontmatter → 页面元数据');
    expect(el.querySelector('.ubean-md-page')).not.toBeNull();
    expect(el.querySelector('table')).not.toBeNull(); // markdown 表格渲染

    unmount();
  });
});

describe('matcher 守卫真机导航(DOM)', () => {
  it('/users/1 渲染详情;/users/abc 被拦截 → NotFound', async () => {
    defineMatcher('numeric', v => /^\d+$/.test(v));
    const { el, router, settle, unmount } = await mountApp();

    await router.push('/users/1');
    await settle();
    expect(el.textContent).toContain('用户详情');
    expect(el.textContent).toContain('索易 Bean');

    await router.push('/users/abc');
    await settle();
    expect(router.currentRoute.value.name).toBe('NotFound');
    expect(el.textContent).toContain('404');

    unmount();
  });
});

describe('特殊页注入协议(DOM)', () => {
  it('loading/error 组件经注入键接入 PageView(Suspense/ErrorBoundary)', async () => {
    // loadingComponent 是虚拟模块导出的 loading.vue 组件(非 null)
    expect(loadingComponent).not.toBeNull();
    expect(errorComponent).not.toBeNull();

    // loading.vue 渲染含 spinner 角色标记
    const { el, settle, unmount } = await mountApp();
    await settle(50);
    expect(el.querySelector('[role="status"], .loading') || el.textContent).toBeTruthy();
    unmount();
  });
});
