// @vitest-environment happy-dom
/**
 * 真机链路复现:虚拟模块 routes(异步 ESM loader)+ SFC 页面 + PageView DOM 挂载。
 * 真机上 cache-demo 页缓存失效(离开再返回重挂载);本测试用同一链路复现/验证。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ubeanVue, PageView } from '@ubean/vue';
import { routes } from 'virtual:ubean-vue-routes';

describe('虚拟模块路由 × KeepAlive 缓存(DOM)', () => {
  it('CacheDemo 离开再返回:缓存命中,页面状态保持', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const router = createRouter({ history: createMemoryHistory(), routes: routes as never });
    const app = createApp({ render: () => h('div', [h(PageView)]) });
    app.use(router);
    app.use(ubeanVue, { routes: routes as never });
    app.mount(el);

    await router.push('/cache-demo');
    await nextTick();
    await new Promise(r => setTimeout(r, 100)); // 异步页面解析

    const firstMount = el.querySelector('.card')?.textContent ?? '';
    expect(firstMount).toContain('count'); // 页面已渲染

    await router.push('/');
    await nextTick();
    await new Promise(r => setTimeout(r, 50));

    await router.push('/cache-demo');
    await nextTick();
    await new Promise(r => setTimeout(r, 100));

    const secondMount = el.querySelector('.card')?.textContent ?? '';
    process.stdout.write(`\n=== first: ${firstMount.slice(0, 60)}\n=== second: ${secondMount.slice(0, 60)}\n`);
    // 缓存命中:setup 不重跑(mountedAt 时间不变)
    const timeA = firstMount.match(/执行于 (\S+)/)?.[1];
    const timeB = secondMount.match(/执行于 (\S+)/)?.[1];
    expect(timeB).toBe(timeA);

    app.unmount();
  });
});
