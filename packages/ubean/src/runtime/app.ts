/**
 * ubean/runtime/app — 服务端 Hono 应用入口
 *
 * 纯 re-export `@ubean/app`,提供:
 * - `createUbeanApp(options)` — 创建 Hono 应用(对应原 ubean `runtime/app.ts`)
 * - `defineServer(options)` — 定义服务端配置(对应原 ubean `runtime/define-server.ts`)
 * - `applyServerConfig(app, config)` — 应用服务端配置
 *
 * 注意:`createUbeanApp` 在此子路径专指 Hono 工厂(ADR-0001)。
 * `@ubean/runtime` 主入口的 Vue 应用工厂已重命名为 `createUbeanClientApp`。
 *
 * ```ts
 * import { createUbeanApp, defineServer, applyServerConfig } from 'ubean/runtime/app';
 * ```
 */
export * from '@ubean/app';
