import { defineMatcher, hasMatcher } from 'ubean';

/**
 * 动态路由 matcher 注册（Task 7）：`[id=numeric]` 这样的语法引用这里的名字。
 *
 * **注册表是「进程/图内单例」，两侧都要注册**：
 * - 服务端：`@ubean/routes` 的 router 在匹配到该路由后按名字校验参数，失败返回 404
 *   （`src/server.ts` 里 import 本模块 —— 服务端图与客户端图是两份模块实例，所以必须在两边都执行）；
 * - 客户端：`router.beforeEach(createMatcherGuard())` 用同一注册表校验 SPA 导航，失败跳 404
 *   （见 `src/app.ts`）。
 *
 * 用 `hasMatcher` 做幂等：模块被重复求值（HMR / 多次 import）时不会重复注册。
 */
export function registerMatchers(): void {
  if (!hasMatcher('numeric')) {
    defineMatcher('numeric', value => /^\d+$/.test(value));
  }
}
