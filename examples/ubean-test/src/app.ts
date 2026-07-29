import { defineApp, hydrateIslands } from 'ubean/runtime/vue';

// Locales are auto-loaded by ubean:locales virtual module on the server,
// and auto-hydrated on the client via SSR-injected __UBEAN_LOCALE__ data.
// No manual defineLocale() needed here.
//
// Island components (IslandCounter, IslandClock, etc.) are auto-registered
// by `ubeanIslandsPlugin` — it scans `client:xxx` directives in .vue files,
// resolves the corresponding imports, and generates `virtual:ubean-islands-registry`.
// `hydrateIslands` (imported above from `ubean/runtime/vue`) automatically
// consumes that registry, so no manual `components` map is needed here.

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
  },
  onClientReady: app => {
    // Islands 在 SSR 时输出 <ubean-island v-once ...> 占位元素。
    // onClientReady 在 app.mount() 完成后触发。
    // 使用 requestAnimationFrame 两次将水合推迟到 Vue 的渲染循环之后,
    // 确保异步组件解析和 patch 过程完全结束后再水合 islands,
    // 避免 Vue 的 re-render 覆盖已水合的 island 内容。
    // (setTimeout(0) 不够,nextTick 也不够——它们与 Vue 的 patch 在同一任务队列)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hydrateIslands({ appContext: app });
      });
    });
  }
});
