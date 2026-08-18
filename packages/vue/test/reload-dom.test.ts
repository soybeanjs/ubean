// @vitest-environment happy-dom
/**
 * reload + KeepAlive + Transition 组合的浏览器级回归测试(happy-dom)。
 *
 * 背景:reload 曾触发 `TypeError: Cannot read properties of null (reading '_')`
 * 于 Vue updateSlots —— Transition 离场/空槽路径渲染 emptyPlaceholder 空壳
 * KeepAlive(children=null),patch 回存活实例时崩溃(vue@3.5.41,与
 * vuejs/core#10771 同族)。修复:reload 走「短暂空白」序列(KeepAlive slot
 * 渲染 comment vnode),全程避开 Transition 的 leave/empty-placeholder 分支。
 *
 * 注:普通 out-in 换页在「手写渲染链」下仍会触发同一上游 bug(vanilla
 * vue+vue-router 手写 h 链可复现);真实浏览器编译链不受影响(已实测)。
 * 因此换页存活断言放在无过渡用例中,过渡用例只断言 reload 序列。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import {
  ubeanVue,
  PageView,
  enablePageCache,
  isPageCached,
  invalidatePageCache,
  reloadPage,
  getReloadCounter,
  setPageTransition,
  clearPageTransition,
  resetRouteCache
} from '../src/index';

let mountCount = 0;
const About = defineComponent({
  name: 'About',
  setup() {
    mountCount++;
    return () => h('div', { class: 'about-page' }, `about#${mountCount}`);
  }
});
const Home = defineComponent({
  name: 'Home',
  setup: () => () => h('div', { class: 'home-page' }, 'home')
});

function makeRoutes(withTransition: boolean) {
  return [
    { path: '/', name: 'Home', component: Home, meta: { pageName: 'Home' } },
    {
      path: '/about',
      name: 'About',
      component: About,
      meta: withTransition ? { pageName: 'About', cache: true, transition: 'fade' } : { pageName: 'About', cache: true }
    }
  ];
}

async function mountApp(withTransition: boolean) {
  const errorSites: string[] = [];
  const router = createRouter({ history: createMemoryHistory(), routes: makeRoutes(withTransition) as never });
  const app = createApp({ render: () => h('div', [h(PageView)]) });
  app.config.errorHandler = (err, _i, info) => errorSites.push(`${info}: ${String(err)}`);
  app.use(router);
  app.use(ubeanVue, { routes: makeRoutes(withTransition) as never });
  await router.push('/about');
  await nextTick();
  const el = document.createElement('div');
  document.body.appendChild(el);
  app.mount(el);
  return { app, router, el, errorSites };
}

describe('reload × KeepAlive × Transition 回归(happy-dom)', () => {
  beforeEach(() => {
    invalidatePageCache();
    enablePageCache('About');
    resetRouteCache?.();
    mountCount = 0;
  });

  it('reloadPage(缓存页+transition): 全序列零崩溃,页面重挂载,缓存声明保留', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, el, errorSites } = await mountApp(true);

    expect(el.textContent).toContain('about#1');
    expect(isPageCached('About')).toBe(true);

    const before = getReloadCounter().value;
    // 全局过渡 + 路由 meta.transition 都启用的最严苛组合
    setPageTransition('fade');
    await reloadPage('About', 30);

    await nextTick();
    await new Promise(r => setTimeout(r, 60));

    expect(errorSites, `reload 序列崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(getReloadCounter().value).toBe(before + 1);
    expect(el.textContent).toContain('about#2'); // 重挂载的新实例
    expect(isPageCached('About')).toBe(true); // 缓存声明保留

    // reload 后再 reload 一次:连续 reload 仍稳定
    await reloadPage('About', 30);
    await nextTick();
    await new Promise(r => setTimeout(r, 60));
    expect(errorSites, `连续 reload 崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('about#3');

    warnSpy.mockRestore();
    errSpy.mockRestore();
    app.unmount();
  });

  it('reload 后路由视图存活(无过渡): 换页正常渲染', async () => {
    clearPageTransition();
    const { app, router, el, errorSites } = await mountApp(false);

    expect(el.textContent).toContain('about#1');
    await reloadPage('About', 30);
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(errorSites, `reload 崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('about#2');

    await router.push('/');
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(errorSites, `换页崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('home');

    await router.push('/about');
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(el.textContent).toMatch(/about#2|about#3/); // 缓存命中(about#2)或按剪枝语义重挂载
    app.unmount();
  });

  it('per-page reload 计数:A 页 reload 不破坏 B 页的 keep-alive 缓存', async () => {
    clearPageTransition();
    let cacheMounts = 0;
    const CacheDemo = defineComponent({
      name: 'CacheDemo',
      setup() {
        cacheMounts++;
        return () => h('div', { class: 'cache-page' }, `cache#${cacheMounts}`);
      }
    });
    const errorSites: string[] = [];
    const routes = [
      { path: '/', name: 'Home', component: Home, meta: { pageName: 'Home' } },
      { path: '/about', name: 'About', component: About, meta: { pageName: 'About', cache: true } },
      { path: '/cache-demo', name: 'CacheDemo', component: CacheDemo, meta: { pageName: 'CacheDemo', cache: true } }
    ];
    const router = createRouter({ history: createMemoryHistory(), routes: routes as never });
    const app = createApp({ render: () => h('div', [h(PageView)]) });
    app.config.errorHandler = (err, _i, info) => errorSites.push(`${info}: ${String(err)}`);
    app.use(router);
    app.use(ubeanVue, { routes: routes as never });

    await router.push('/cache-demo');
    await nextTick();
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    expect(el.textContent).toContain('cache#1');

    // 离开(进缓存) → reload About(另一页) → 返回 CacheDemo:应缓存命中(cache#1 不变)
    await router.push('/about');
    await nextTick();
    await new Promise(r => setTimeout(r, 30));
    expect(el.textContent).toContain('about#');

    await reloadPage('About', 30);
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(errorSites, `reload 崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('about#2');

    await router.push('/cache-demo');
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(errorSites, `返回崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('cache#1'); // 缓存命中,未被 About 的 reload 影响
    app.unmount();
  });

  it('结构稳定性:不同 transition 声明的页面间切换,无过渡页缓存仍保留', async () => {
    clearPageTransition();
    let cacheMounts = 0;
    const CacheNoTransition = defineComponent({
      name: 'CacheNoTransition',
      setup() {
        cacheMounts++;
        return () => h('div', { class: 'cnt-page' }, `cnt#${cacheMounts}`);
      }
    });
    const errorSites: string[] = [];
    // 关键:About 声明 transition('fade'),CacheNoTransition 不声明 —— 旧实现里
    // Transition 是条件节点,patch 位置类型交替导致 KeepAlive 整棵重建、缓存全失
    const routes = [
      { path: '/about', name: 'About', component: About, meta: { pageName: 'About', cache: true, transition: 'fade' } },
      {
        path: '/plain',
        name: 'CacheNoTransition',
        component: CacheNoTransition,
        meta: { pageName: 'CacheNoTransition', cache: true }
      }
    ];
    const router = createRouter({ history: createMemoryHistory(), routes: routes as never });
    const app = createApp({ render: () => h('div', [h(PageView)]) });
    app.config.errorHandler = (err, _i, info) => errorSites.push(`${info}: ${String(err)}`);
    app.use(router);
    app.use(ubeanVue, { routes: routes as never });

    await router.push('/plain');
    await nextTick();
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    expect(el.textContent).toContain('cnt#1');

    await router.push('/about'); // 进有过渡页
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(el.textContent).toContain('about#1');

    await router.push('/plain'); // 回无过渡页:Transition 结构常驻,缓存应命中
    await nextTick();
    await new Promise(r => setTimeout(r, 50));
    expect(errorSites, `切换崩溃: ${errorSites.join('; ')}`).toEqual([]);
    expect(el.textContent).toContain('cnt#1'); // 缓存命中(而非 cnt#2 全新挂载)
    expect(cacheMounts).toBe(1);
    app.unmount();
  });
});
