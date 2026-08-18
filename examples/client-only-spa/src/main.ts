import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import {
  ubeanVue,
  defineMatcher,
  createMatcherGuard,
  createPageHead,
  setupPageHeadGuard,
  LOADING_KEY,
  ERROR_KEY
} from '@ubean/vue';
import { routes, loadingComponent, errorComponent } from 'virtual:ubean-vue-routes';
import App from './App.vue';

/**
 * 独立 SPA 引导 —— @ubean/vue 精简内核 + 文件式路由(全能力):
 * 1. 路由表来自 `virtual:ubean-vue-routes`(@ubean/vue/vite 扫描 src/pages
 *    并编译期提取 definePage/frontmatter 生成);内核不产出 router 工厂,
 *    直接用 vue-router 原生 createRouter 自行创建实例。
 * 2. `app.use(ubeanVue, { routes })` 一次完成:
 *    全局组件(Link/PageView/SlotView)注册 + keep-alive 缓存播种。
 * 3. 动态参数 matcher:`[id=numeric]` 文件语法把 matchers 写进 route.meta,
 *    这边注册校验函数 + 挂守卫;校验失败重定向 NotFound(404.vue)。
 * 4. 特殊页注入协议:loading/error 组件经 LOADING_KEY/ERROR_KEY 接入
 *    PageView 的 <Suspense>/<ErrorBoundary>(框架运行时默认提供,精简内核自行 provide)。
 * 5. 页面级 head(opt-in):@unhead/vue 为 optional peer,createPageHead
 *    懒加载;守卫在每次导航后 push route.meta.head。
 *
 * 无应用工厂、无 i18n、无自动引入 —— 全部显式导入。
 */

// matcher 注册:`[id=numeric]` 文件语法的运行时校验函数
defineMatcher('numeric', value => /^\d+$/.test(value));

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (_to.hash) return { el: _to.hash, behavior: 'smooth' };
    return { top: 0 };
  }
});

// matcher 守卫:meta.matchers 校验失败 → NotFound(/users/abc 会被拦截)
router.beforeEach(createMatcherGuard());

const app = createApp(App);
app.use(router);
app.use(ubeanVue, { routes });

// 特殊页注入(PageView 的 Suspense fallback / ErrorBoundary 渲染)
app.provide(LOADING_KEY, loadingComponent);
app.provide(ERROR_KEY, errorComponent);

// 页面级 head(@unhead/vue 懒加载;失败静默 —— head 是纯增强)
createPageHead()
  .then(head => setupPageHeadGuard(router, head))
  .catch(() => {
    /* @unhead/vue 未安装时跳过 */
  });

app.mount('#app');
