/**
 * ubean/server — 服务端运行时聚合入口
 *
 * 按能力域聚合服务端子包,服务端代码(API 路由 / middleware / `src/server.ts`)
 * 推荐从此处导入;与 isomorphic 主入口相对,此入口包含 Hono、`node:*` 内建等
 * 服务端依赖,禁止在浏览器代码中导入:
 * - `@ubean/app` — Hono 应用工厂(`createUbeanApp`)+ `defineServer` + `applyServerConfig`
 * - `@ubean/routes` — API 路由运行时(`defineHandler`/`defineAction`/ISR/route-rules/OpenAPI)
 * - `@ubean/server` — 服务端能力域(cache/db/queue/cron/ws/sse/storage/middleware…)
 * - `@ubean/shared/node` — Node-only 工具(端口探测 / vite 配置探测)
 * - `hono-openapi` — `validator`/`describeRoute` 等(原主入口重导出,随服务端域迁入)
 * - `@ubean/shared/logger/hono` — Hono 请求日志中间件
 *
 * 注意:`createUbeanApp` 在此子路径专指 Hono 工厂(ADR-0001)。
 * `@ubean/client` 的 Vue 应用工厂为 `createUbeanClientApp`(从 `ubean/client` 导入)。
 *
 * ```ts
 * import { createUbeanApp, defineServer, defineHandler, validator } from 'ubean/server';
 * ```
 */
export * from '@ubean/app';
export * from '@ubean/server';
export * from '@ubean/routes';
export * from '@ubean/shared/node';

// ============== hono-openapi 重导出(对齐原 ubean 主入口行为,随服务端域迁入)==============
export { validator, describeRoute, resolver, openAPIRouteHandler } from 'hono-openapi';

// ============== Hono 请求日志中间件 ==============
export { createRequestLoggerMiddleware } from '@ubean/shared/logger/hono';

// ============== 数据库别名(对齐原 ubean 的 `raw as sqlRawAlias`)==============
export { rawSql as sqlRawAlias } from '@ubean/server';
