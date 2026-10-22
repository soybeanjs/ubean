/**
 * 内置全局路由（Root / NotFound）的**唯一身份来源**。
 *
 * 这两条路由不靠文件名识别，而靠「路由名」这个稳定契约：
 *
 * - `Index`（Root）—— 路径 `/`。任何映射到 `/` 的页面都归它，无论声明形态是
 *   `pages/index.vue`、`pages/root.vue` 还是 `pages/index/index.vue`。
 * - `NotFound`（全局捕获）—— 路径 `/:pathMatch(.*)*`。声明形态是
 *   `pages/404.vue` / `pages/not-found.vue`（也含各自的 `index.*` 目录形态）。
 *
 * 名字被保留：其他页面若派生或显式声明同名，扫描期会警告并跳过注册（见
 * `scan-pages.ts` 的保留名 post-pass），而不是产出两条同名路由让 vue-router
 * 静默覆盖其中一条。
 *
 * 本模块**零依赖**（只导出常量与纯函数），因此 `@ubean/vue` 主入口、
 * `@ubean/routes` 的服务端运行时图都能安全引用它。
 */

/** Root 路由的固定名（`/`）。 */
export const ROOT_ROUTE_NAME = 'Index';

/** 全局捕获路由的固定名（`/:pathMatch(.*)*`）。 */
export const NOT_FOUND_ROUTE_NAME = 'NotFound';

/**
 * vue-router 的全局捕获路径。
 *
 * 用 vue-router 自己的内部约定拼写，客户端路由表 / dev SSR 路由表 / 类型生成
 * 三处共用同一个字面量 —— 以前它在三处各写一遍。
 */
export const NOT_FOUND_ROUTE_PATH = '/:pathMatch(.*)*';

/** 框架保留的路由名。 */
export const RESERVED_ROUTE_NAMES: readonly string[] = [ROOT_ROUTE_NAME, NOT_FOUND_ROUTE_NAME];

export function isReservedRouteName(name: string): boolean {
  return RESERVED_ROUTE_NAMES.includes(name);
}

/** 页面是否承载全局捕获路由（`pages/404.vue` 等形态扫描出的那一条）。 */
export function isGlobalCatchAllPage(page: { isGlobalCatchAll?: boolean }): boolean {
  return page.isGlobalCatchAll === true;
}

/**
 * 路由注册顺序：**全局捕获路由永远最后**。
 *
 * vue-router 的 catch-all 是「注册顺序优先」而非「特异性优先」——实测
 * `[AllSlug, NotFound]` 与 `[NotFound, AllSlug]` 会命中不同的记录。所以用户显式写的
 * `[...slug].vue` 必须排在框架内置的 404 之前，否则 404 会吞掉用户的 catch-all 页面。
 *
 * `Array.prototype.sort` 是稳定排序，因此其余页面的相对顺序不变。
 */
export function sortPagesForRouting<T extends { isGlobalCatchAll?: boolean }>(pages: readonly T[]): T[] {
  return [...pages].sort((a, b) => Number(isGlobalCatchAllPage(a)) - Number(isGlobalCatchAllPage(b)));
}
