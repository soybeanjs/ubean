/**
 * Dynamic route matchers (Task 7, P1).
 *
 * 对齐 SvelteKit matchers API:用户通过 `defineMatcher(name, fn)` 注册一个
 * 命名 matcher,然后在文件路由中使用 `[paramName=matcherName]` 约定让框架
 * 在路由匹配时调用 matcher 验证参数。matcher 返回 `false`/`null`/`undefined`
 * 视为不匹配,该路由被跳过(走下一个候选路由或最终 404)。
 *
 * 设计要点:
 * - 注册表为进程内单例(类似 `useRouter()`),server / client 各自维护一份
 * - matcher 函数签名 `(value: string) => boolean | null | undefined`
 *   —— 与 SvelteKit 一致,返回 falsy 表示不匹配
 * - 注册表通过 `defineMatcher` 写入,通过 `getMatcher` / `hasMatcher` 读取
 * - `clearMatchers()` 仅供测试使用,避免单例在测试间状态泄露
 *
 * 集成点:
 * - 路由扫描:解析 `[id=numeric]` 语法 → `ScannedPageRoute.matchers: { id: 'numeric' }`
 * - Hono server:`registerPageRoutes` 在页面 handler 前插入 matcher 验证中间件,
 *   任何 matcher 失败 → 404(不调用 `next`,跳过该路由)
 * - Vue Router client:在 `createUbeanRouter` 的 `setup` 回调中注册 `beforeEach`
 *   守卫,matcher 失败时中断导航并跳转到 404 路由(由消费方在 `defineApp({ router: { setup } })` 配置)
 *
 * 不内置任何 matcher:用户按需在 `src/matchers/<name>.ts` 中定义并通过
 * virtual 模块自动加载(类似 middleware),或在应用入口手动注册。
 */

/**
 * Matcher 函数签名。接收 URL 中的原始字符串参数,返回 falsy 表示不匹配。
 *
 * @example
 * defineMatcher('numeric', (value) => /^\d+$/.test(value));
 * defineMatcher('slug', (value) => /^[a-z0-9-]+$/.test(value));
 */
export type MatcherFunction = (value: string) => boolean | null | undefined;

/**
 * 全局 matcher 注册表(进程单例)。
 *
 * server / client 运行时各自维护一份;dev 模式下 HMR 不会自动清理注册表,
 * 但 `defineMatcher` 同名覆盖,因此重新加载 matcher 文件会自动更新函数引用。
 */
const matcherRegistry = new Map<string, MatcherFunction>();

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
 * import { defineMatcher } from 'ubean';
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
  matcherRegistry.set(name, fn);
  return fn;
}

/**
 * 按名称获取已注册的 matcher。未注册时返回 `undefined`。
 */
export function getMatcher(name: string): MatcherFunction | undefined {
  return matcherRegistry.get(name);
}

/**
 * 判断指定名称的 matcher 是否已注册。
 */
export function hasMatcher(name: string): boolean {
  return matcherRegistry.has(name);
}

/**
 * 获取所有已注册 matcher 的名称列表(主要用于调试 / DevTools)。
 */
export function listMatcherNames(): string[] {
  return [...matcherRegistry.keys()];
}

/**
 * 清空所有已注册的 matcher。
 *
 * **仅供测试使用** —— 应用代码不应调用,避免误删其他模块注册的 matcher。
 */
export function clearMatchers(): void {
  matcherRegistry.clear();
}

/**
 * 校验一组路由参数是否通过对应的 matcher。
 *
 * @param matchers  `ScannedPageRoute.matchers` —— `{ paramName: matcherName }` 映射
 * @param params    当前请求解析出的 `{ paramName: value }`(来自 `c.req.param()` /
 *                  `route.params`)
 * @returns         `true` 表示所有 matcher 通过(或无 matcher 需要校验);
 *                  `false` 表示至少一个 matcher 拒绝,该路由不应匹配
 *
 * 行为细节:
 * - 若 `matchers` 为空 / undefined,直接返回 `true`(无校验需求)
 * - 若 matcher 名对应的函数未注册,**返回 `false`**(保守策略:未注册的 matcher
 *   视为不匹配,避免误将非数字 id 路由到 `[id=numeric]` 页面)
 *   —— 这与 SvelteKit 一致(SvelteKit 在 matcher 未导出时抛出 error)
 * - 若参数不存在于 `params` 中(理论不应发生,因为 matcher 来自同一路由的 path 解析),
 *   视为校验失败返回 `false`
 * - matcher 函数抛异常时,捕获并视为不匹配(避免单个 matcher bug 影响整体路由)
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
      // 未注册的 matcher:保守视为不匹配(对齐 SvelteKit 的 error 行为,
      // 但用 false 而非抛出,避免阻塞路由表初始化)
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

/**
 * 创建 Vue Router `beforeEach` 导航守卫,用于客户端校验动态路由 matchers。
 *
 * 路由记录的 `meta.matchers` 字段(由 route generator 自动注入)记录了
 * `{ paramName: matcherName }` 映射。守卫读取该字段,调用 `validateParams`
 * 校验 `to.params`;失败时取消导航并跳转到 404 路由(若存在)或抛出导航错误。
 *
 * **用法**(在 `defineApp({ router: { setup } })` 中注册):
 *
 * ```ts
 * import { defineApp, createMatcherGuard } from 'ubean';
 *
 * export default defineApp({
 *   router: {
 *     setup(router) {
 *       router.beforeEach(createMatcherGuard());
 *     }
 *   }
 * });
 * ```
 *
 * **设计说明**:
 * - 守卫是**可选的**:不调用 `createMatcherGuard()` 时,客户端不做 matcher 校验,
 *   完全依赖服务端 Hono 中间件拦截(适用于 SSR 应用)。
 * - 对于纯 SPA 应用(`ssr: false`),强烈建议注册此守卫,否则客户端导航到
 *   `/users/abc`(应当被 `[id=numeric]` 拒绝)会渲染页面而非 404。
 * - 失败行为:取消导航(`false`)。若配置了 `notFoundRouteName`,则跳转到该路由;
 *   否则抛出 `[ubean] matcher rejected` 错误,由 vue-router 的错误处理机制接管。
 *
 * @param options  可选配置:
 *   - `notFoundRouteName`: matcher 失败时跳转的路由名(默认 `'NotFound'`)
 *   - `onReject`: 自定义拒绝回调(默认无操作),接收 `(to, matchers, params)`
 *
 * @returns vue-router `NavigationGuard` 函数,可直接传给 `router.beforeEach()`
 */
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
 * vue-router NavigationGuard 兼容类型(避免在此包硬依赖 vue-router)。
 *
 * 守卫签名:`(to, from) => boolean | string | { name: string; params?: object } | void`
 * —— 返回 `false` 取消导航,返回路由 location 跳转,其他值继续导航。
 */
type NavigationGuard = (to: {
  path: string;
  params: Record<string, unknown>;
  meta?: Record<string, unknown> | null;
  name?: unknown;
}) => boolean | string | { name: string; params?: Record<string, unknown> } | void;

export function createMatcherGuard(options: MatcherGuardOptions = {}): NavigationGuard {
  const notFoundRouteName = options.notFoundRouteName ?? 'NotFound';
  const onReject = options.onReject;

  return (to: {
    path: string;
    params: Record<string, unknown>;
    meta?: Record<string, unknown> | null;
    name?: unknown;
  }): boolean | string | { name: string; params?: Record<string, unknown> } | void => {
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
    return;
  };
}
