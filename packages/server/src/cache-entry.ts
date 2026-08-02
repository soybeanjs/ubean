/**
 * @ubean/server/cache — 缓存能力聚合入口 (ADR-0003 OPT-06)
 *
 * 聚合路由级缓存 (cache.ts) + 组件级缓存 (cache-directive.ts)。
 * 文件名带 `-entry` 后缀以避免与现有 `cache.ts` 冲突；子路径 `./cache` 在
 * `package.json` `exports` 中映射到此文件。
 *
 * 主入口 `@ubean/server` 仍 re-export 全部符号（便利入口）。
 */
export * from './cache';
export type * from './cache';
export * from './cache-directive';
export type * from './cache-directive';
