// oxlint-disable no-unused-vars
import type { RouteMeta } from 'vue-router';
import type { PageHead } from './types';

/**
 * `definePage` —— 客户端页面声明宏(纯客户端能力子集)。
 *
 * 在 SFC 的 `<script setup>` 顶层调用,声明本页的路由元信息:
 *
 * ```vue
 * <script setup lang="ts">
 * import { definePage } from '@ubean/vue';
 *
 * definePage({
 *   name: 'UserProfile',           // 覆盖文件派生的路由名
 *   path: '/u/:id',                // 覆盖文件派生的路径
 *   cache: true,                   // keep-alive 页面缓存
 *   transition: 'fade',            // 页面级过渡名(PageView)
 *   layout: 'admin',               // 布局标记(由宿主布局层消费)
 *   requiresAuth: true,            // 鉴权标记(由导航守卫消费)
 *   head: { title: '用户主页' },    // 页面级 head(需 /vite 插件 head: true)
 *   meta: { custom: 'any' }        // 任意扩展 meta(RouteMeta)
 * });
 * </script>
 * ```
 *
 * 双重语义:
 * - **构建期**(推荐):`@ubean/vue/vite` 插件在编译时提取参数对象,合并进
 *   `virtual:ubean-vue-routes` 生成的路由表,并把调用从产物中剥除
 *   (零运行时开销)。
 * - **运行时兜底**:无插件环境下本函数是 no-op —— 不报错、不产生副作用,
 *   页面仍以文件派生的路径/名称注册。`cache` 等声明可通过
 *   `enablePageCache(name)` 运行时补齐。
 *
 * 与全栈版 `definePage`(`@ubean/pages` 协议)的差异:此处保留客户端字段
 * (`head` 为 opt-in,需 `/vite` 插件开启);`middleware` 已移除 —— 此前
 * 该字段从未被任何运行时消费,按路由声明守卫请用 `meta` 透传。
 */
export interface DefineClientPageOptions {
  /** 覆盖文件派生的路由名(同时作为 keep-alive 匹配的 pageName)。 */
  name?: string;
  /** 覆盖文件派生的路由路径(需以 `/` 开头,支持 `:param` 动态段)。 */
  path?: string;
  /**
   * 重定向目标 —— 本路由不渲染组件,访问时跳到目标路径。
   *
   * 典型用法是根路由:`src/pages/index.vue` 就是 `/`,在其中声明
   * `definePage({ redirect: '/home' })` 即可,不需要任何路由配置字段。
   *
   * ```vue
   * <!-- src/pages/index.vue -->
   * <script setup lang="ts">
   * definePage({ redirect: '/home' });
   * </script>
   * ```
   *
   * **构建期只支持字符串字面量**(与 `definePage` 其他字段一致)。函数形式的
   * 目标(例如按参数拼接 URL)无法静态求值,会被提取器忽略并告警。
   *
   * 带语言前缀的站点**不要写 `/:locale(zh)?/home` 这种字符串** —— 字符串重定向
   * 是静态路径,vue-router 不会插值参数。请写不带前缀的路径(`/home`),框架会在
   * 生成路由表时按当前 locale 策略补前缀。
   *
   * 外链(`https://…`)不受支持:vue-router 会把它当路径。需要外链请用导航守卫。
   */
  redirect?: string;
  /**
   * 布局标记:布局名、外→内嵌套布局名数组,或 `false` 禁用。
   * 精简内核只把该值写入 `route.meta.layout`,渲染由宿主的布局层
   * (`LayoutChainRenderer` / 框架运行时)消费。
   */
  layout?: string | string[] | false;
  /** 声明式开启 keep-alive 页面缓存(等价于运行时 `enablePageCache(name)`)。 */
  cache?: boolean;
  /** 页面级过渡名,`<PageView>` 渲染 `<Transition :name>`;空串禁用本页过渡。 */
  transition?: string;
  /** 鉴权标记,写入 `route.meta.requiresAuth`,由用户导航守卫消费。 */
  requiresAuth?: boolean;
  /**
   * reuse 路由目标页名(仅 `.reuse.ts` / `.reuse.js` 元数据文件使用):
   * 本路由复用目标页的组件实现,仅注入独立的路由元数据(路径/名称等)。
   */
  reuse?: string;
  /**
   * 是否参与路由注册,默认 `true`。
   *
   * 设为 `false` 时,本页只出现在扫描结果的页面清单里,**不生成路由记录**,
   * 也不进 `RouteNamedMap`。用于声明「不是路由的页面」:菜单目录、外链入口、
   * 只需要在构建期被读到元数据的条目。
   *
   * `.meta.ts` / `.meta.js` 元数据文件(只有 `definePage`、没有组件实现)
   * **文件名本身就等价于 `routable: false`**,可以省略;写 `true` 会报错。
   * 框架不认识「目录 / 外链」这些业务词,只认这个布尔值 —— 怎么解释是应用层的事。
   *
   * ```ts
   * // src/pages/plugin/index.meta.ts —— 省略 routable,文件后缀已说明一切
   * definePage({
   *   meta: { menuType: 'directory', title: '插件', icon: 'mdi:puzzle' }
   * });
   * ```
   */
  routable?: boolean;
  /**
   * 页面级静态 head(SEO title/meta 等)。仅当 `/vite` 插件 `head: true`
   * (默认 false)时写入 `route.meta.head`;SPA 端配合
   * `setupPageHeadGuard()` 应用,SSR 链路经服务端扫描结果消费。
   */
  head?: PageHead;
  /**
   * Per-page select SSR (`false` | `'data-only'` | `true` | `'streaming'`).
   * Consumed by the server router; also written to `route.meta.ssr`.
   */
  ssr?: boolean | 'streaming' | 'data-only';
  /** 任意扩展 meta,浅合并进 `route.meta`(类型上扩展 vue-router RouteMeta)。 */
  meta?: RouteMeta;
}

/**
 * Macro to declare a client page.
 *
 * used in `<script setup>` of SFC.
 *
 * @param options Page options.
 *
 * @example
 * ```ts
 * definePage({
 *   name: 'UserProfile',
 *   path: '/u/:id',
 *   cache: true,
 *   transition: 'fade',
 *   layout: 'admin',
 *   requiresAuth: true,
 *   meta: { custom: 'any' }
 * });
 * ```
 */
export function definePage(options?: DefineClientPageOptions): void {
  // 构建期由 `@ubean/vue/vite` 剥除;运行时兜底为 no-op。
}
