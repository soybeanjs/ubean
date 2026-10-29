/**
 * 运行环境判据。
 *
 * 全仓统一从 `@ubean/shared` 取（主包 `ubean` 主入口 re-export），不要在业务代码里散写
 * `typeof window` —— 把 `!==` / `===` 写反不会有任何报错，只会让某条分支永远不执行。
 */

/** 是否运行在浏览器（DOM）环境。SSR / Node / worker 均为 `false`。 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/** 是否运行在服务端（无 DOM）环境。SSR / Node / worker 均为 `true`。 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}
