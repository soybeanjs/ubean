/**
 * Dynamic route matchers(`[param=matcher]` 文件路由语法的运行时注册表)。
 *
 * 对齐 SvelteKit matchers API:用户通过 `defineMatcher(name, fn)` 注册一个
 * 命名 matcher,然后在文件路由中使用 `[paramName=matcherName]` 约定让框架
 * 在路由匹配时调用 matcher 验证参数。matcher 返回 falsy 视为不匹配,
 * 该路由被跳过(走下一个候选路由或最终 404)。
 *
 * 所有权:`@ubean/vue`(客户端内核,server / client 各自维护一份进程单例)。
 * `@ubean/scan` 聚合层 re-export 本文件的全部导出保持向后兼容。
 *
 * 集成点:
 * - 路由扫描(`@ubean/vue/vite`):解析 `[id=numeric]` 语法 → `matchers` 映射,
 *   注入 `route.meta.matchers`
 * - Hono server:`registerPageRoutes` 在页面 handler 前插入 matcher 验证
 * - Vue Router client:`createMatcherGuard()` 注册 `beforeEach` 守卫,
 *   matcher 失败时跳转 404 路由
 *
 * 不内置任何 matcher:用户按需在 `src/matchers/<name>.ts` 中定义并通过
 * virtual 模块自动加载(类似 middleware),或在应用入口手动注册。
 */

/**
 * vue-router NavigationGuard(直接引用官方类型,保证 `router.beforeEach()`
 * 装配处的可赋值性 —— 本地结构化别名在消费方启用 typed RouteNamedMap
 * 增强后不再兼容)。
 */
import type { NavigationGuard } from 'vue-router';

/**
 * Matcher 函数签名。接收 URL 中的原始字符串参数,返回 falsy 表示不匹配。
 *
 * @example
 * defineMatcher('numeric', (value) => /^\d+$/.test(value));
 * defineMatcher('slug', (value) => /^[a-z0-9-]+$/.test(value));
 */
export type MatcherFunction = (value: string) => boolean | null | undefined;

/**
 * matcher 注册表 —— **真·进程单例**（挂在 `globalThis` 上）。
 *
 * 为什么不能用模块级 `Map`：模块级状态只在**同一个模块实例**内共享，而同一个进程里常常有第二份
 * `@ubean/vue`（dev 的 SSR 图会把 `ubean` 内联、却把 `@ubean/vue` 外部化；pnpm 也可能装出两份）。
 * 那样「用户注册」与「router 校验」读的是两个 Map，表现为**所有 `[id=numeric]` 路由一律 404**
 * （实测：`validateParams` 对未注册名保守返回 false）。i18n 的 ALS 与 `@ubean/build` 的模块注册表
 * 都出于同一理由挂在 `globalThis` 上（见 `packages/builder/src/registry.ts`）。
 *
 * 同名重复注册会覆盖 —— HMR 重新求值 matcher 文件时因此能拿到最新函数引用。
 */
const MATCHERS_KEY = '__ubean_route_matchers__';

function getMatcherRegistry(): Map<string, MatcherFunction> {
  const store = globalThis as unknown as Record<string, unknown>;
  const existing = store[MATCHERS_KEY];
  if (existing instanceof Map) return existing as Map<string, MatcherFunction>;
  const created = new Map<string, MatcherFunction>();
  store[MATCHERS_KEY] = created;
  return created;
}

/**
 * 定义并注册一个命名 route matcher。
 *
 * @param name matcher 名称,对应 `[paramName=name]` 中的 `name`
 * @param fn   matcher 函数,接收参数字符串值,返回 falsy 表示不匹配
 * @returns 传入的 `fn`,便于链式/导出使用
 *
 * @example
 * ```ts
 * // src/matchers/numeric.ts
 * import { defineMatcher } from '@ubean/vue';
 * export default defineMatcher('numeric', (value) => /^\d+$/.test(value));
 * ```
 */
export function defineMatcher(name: string, fn: MatcherFunction): MatcherFunction {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(`[ubean] defineMatcher: name must be a non-empty string, got: ${typeof name}`);
  }
  if (typeof fn !== 'function') {
    throw new TypeError(`[ubean] defineMatcher: fn must be a function, got: ${typeof fn}`);
  }
  getMatcherRegistry().set(name, fn);
  return fn;
}

/**
 * 按名称获取已注册的 matcher。未注册时返回 `undefined`。
 */
export function getMatcher(name: string): MatcherFunction | undefined {
  return getMatcherRegistry().get(name);
}

/**
 * 判断指定名称的 matcher 是否已注册。
 */
export function hasMatcher(name: string): boolean {
  return getMatcherRegistry().has(name);
}

/**
 * 获取所有已注册 matcher 的名称列表(主要用于调试 / DevTools)。
 */
export function listMatcherNames(): string[] {
  return [...getMatcherRegistry().keys()];
}

/**
 * 清空所有已注册的 matcher。
 *
 * **仅供测试使用** —— 应用代码不应调用,避免误删其他模块注册的 matcher。
 */
export function clearMatchers(): void {
  getMatcherRegistry().clear();
}

/**
 * 校验一组路由参数是否通过对应的 matcher。
 *
 * @param matchers  `ScannedPage.matchers` —— `{ paramName: matcherName }` 映射
 * @param params    当前请求解析出的 `{ paramName: value }`
 * @returns         `true` 表示所有 matcher 通过(或无 matcher 需要校验);
 *                  `false` 表示至少一个 matcher 拒绝,该路由不应匹配
 *
 * 行为细节:
 * - 若 `matchers` 为空 / undefined,直接返回 `true`(无校验需求)
 * - 若 matcher 名对应的函数未注册,**返回 `false`**(保守策略)
 * - 若参数不存在于 `params` 中,视为校验失败返回 `false`
 * - matcher 函数抛异常时,捕获并视为不匹配
 */
export function validateParams(
  matchers: Record<string, string> | undefined,
  params: Record<string, string | string[] | undefined>
): boolean {
  if (!matchers || Object.keys(matchers).length === 0) return true;

  for (const [paramName, matcherName] of Object.entries(matchers)) {
    const value = params[paramName];
    // 参数缺失:理论上不应发生(matcher 名来自路由 path 解析),保守视为不匹配
    if (value === undefined || value === null) return false;
    // 数组参数(如 `:path*`):逐个元素校验,任一失败则整体失败
    const values = Array.isArray(value) ? value : [value];

    const matcherFn = getMatcher(matcherName);
    if (!matcherFn) {
      // 未注册的 matcher:保守视为不匹配
      return false;
    }

    for (const v of values) {
      try {
        const result = matcherFn(v);
        if (!result) return false;
      } catch {
        // matcher 抛异常:视为不匹配,不影响其他路由
        return false;
      }
    }
  }

  return true;
}

export interface MatcherGuardOptions {
  /**
   * matcher 校验失败时跳转的路由名。默认 `'NotFound'`。
   *
   * 若该路由不存在,守卫返回 `false`(取消导航),用户停留在当前页面。
   */
  notFoundRouteName?: string;
  /**
   * 自定义拒绝回调,在跳转 404 之前调用。可用于日志、监控、自定义错误页等。
   */
  onReject?: (to: { path: string; params: Record<string, unknown>; matchers: Record<string, string> }) => void;
}

/**
 * 创建 Vue Router `beforeEach` 导航守卫,用于客户端校验动态路由 matchers。
 *
 * 路由记录的 `meta.matchers` 字段(由 route generator 自动注入)记录了
 * `{ paramName: matcherName }` 映射。守卫读取该字段,调用 `validateParams`
 * 校验 `to.params`;失败时跳转到 404 路由(若存在)或取消导航。
 *
 * **用法**:
 *
 * ```ts
 * import { createMatcherGuard } from '@ubean/vue';
 *
 * const router = createRouter({ history: createWebHistory(), routes });
 * router.beforeEach(createMatcherGuard());
 * ```
 *
 * **设计说明**:
 * - 守卫是**可选的**:不调用 `createMatcherGuard()` 时,客户端不做 matcher
 *   校验,完全依赖服务端 Hono 中间件拦截(适用于 SSR 应用)。
 * - 对于纯 SPA 应用(`ssr: false`),强烈建议注册此守卫,否则客户端导航到
 *   `/users/abc`(应当被 `[id=numeric]` 拒绝)会渲染页面而非 404。
 */
export function createMatcherGuard(options: MatcherGuardOptions = {}): NavigationGuard {
  const notFoundRouteName = options.notFoundRouteName ?? 'NotFound';
  const onReject = options.onReject;

  return to => {
    // 读取 route meta 中的 matchers(由 route generator 注入)
    const matchers = (to.meta as { matchers?: Record<string, string> } | null | undefined)?.matchers;
    if (!matchers || Object.keys(matchers).length === 0) {
      return; // 无 matchers,放行
    }

    // vue-router 的 params 值类型为 `string | string[] | undefined`
    const params = to.params as Record<string, string | string[] | undefined>;
    if (!validateParams(matchers, params)) {
      onReject?.({ path: to.path, params: to.params, matchers });
      // 跳转到 404 路由(若存在);否则取消导航
      return { name: notFoundRouteName };
    }
    // 校验通过,放行
  };
}
