import { defineApp } from 'ubean/runtime/vue';

// Locales are auto-loaded by ubean:locales virtual module on the server,
// and auto-hydrated on the client via SSR-injected __UBEAN_LOCALE__ data.
// No manual defineLocale() needed here.
//
// Island components (IslandCounter, IslandClock, etc.) are auto-registered
// by `ubeanIslandsPlugin` and auto-hydrated by the framework after mount.
// No manual hydrateIslands() call needed.

export default defineApp({
  head: {
    title: 'ubean测试',
    meta: [
      { name: 'description', content: 'ubean framework functional test project' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app',
  // 路由钩子示例 — 在 Client 和 SSR 都会执行。
  // 守卫必须同步注册(函数体本身可以返回 Promise)。
  router: {
    setup(router) {
      // 全局前置守卫:打印每次导航
      router.beforeEach((to, from) => {
        // eslint-disable-next-line no-console
        console.log(`[router] ${from.fullPath} → ${to.fullPath}`);
      });

      // 全局后置钩子:可在此处做埋点
      router.afterEach(to => {
        // 实际场景:发送到 analytics / 设置页面标题等
        if (typeof document !== 'undefined' && to.meta?.title) {
          document.title = String(to.meta.title);
        }
      });
    }
  }
});
