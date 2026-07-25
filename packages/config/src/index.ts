/**
 * @ubean/config - Configuration loader and types for ubean
 *
 * 此包提供:
 * - `defineConfig(config)` — 定义 ubean.config.ts 配置
 * - `loadUbeanConfig(cwd)` — 加载配置(从 `ubean.config.ts`、环境变量、默认值合并)
 * - `getConfig()` / `tryGetConfig()` — 获取已加载的配置
 * - `resolveRoutingConfig(userConfig?)` — 解析 `RoutingConfig` 默认值
 * - 完整的类型定义:`UbeanConfig`、`ResolvedConfig`、`RoutingConfig`、`RouteRule` 等
 */

export { defineConfig, loadUbeanConfig, getConfig, tryGetConfig } from './loader';
export { resolveRoutingConfig, routingConfigDefaults } from './routing';

export type {
  UbeanConfig,
  ResolvedConfig,
  RouteRule,
  RoutingConfig,
  ResolvedRoutingConfig,
  RouteGenMode,
  ModuleConfiguration,
  ModuleDefinition,
  ModuleFactory,
  ResolvedModule,
  BuiltinModuleOptions,
  PrerenderConfig,
  PrerenderRoute,
  PrerenderResult
} from './types';
