/**
 * @ubean/server/middleware — 请求生命周期中间件聚合入口 (ADR-0003 OPT-06)
 *
 * 聚合 CORS、限流、after() 回调、fetch memoization、draft mode、single-flight
 * 等请求生命周期中间件。这些中间件不属于特定能力域（cache/db/realtime 等），
 * 而是横切关注点，统一归入 `./middleware` 子路径。
 *
 * 主入口 `@ubean/server` 仍 re-export 全部符号（便利入口）。
 */
export * from './cors';
export type * from './cors';
export * from './rate-limit';
export type * from './rate-limit';
export * from './after';
export type * from './after';
export * from './fetch-memo';
export type * from './fetch-memo';
export * from './draft-mode';
export type * from './draft-mode';
export * from './single-flight';
export type * from './single-flight';
