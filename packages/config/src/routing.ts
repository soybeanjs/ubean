import type { RoutingConfig, ResolvedRoutingConfig } from './types';

/**
 * `RoutingConfig` 的默认值。仅在 `resolveRoutingConfig()` 中使用,通过
 * `defu()` 与用户配置合并,而非直接覆盖用户的字段。
 */
export const routingConfigDefaults: ResolvedRoutingConfig = {
  mode: 'virtual',
  outputDir: 'router/_generated',
  dtsDir: 'router/_generated',
  pageInclude: ['**/*'],
  pageExclude: ['**/_*/**/*', '**/_*', '**/*.test.*', '**/*.spec.*'],
  generateBuiltinRoutes: true,
  rootRedirect: '',
  notFoundRouteComponent: '404.vue',
  defaultReuseRouteComponent: '',
  reuseRoutes: [],
  layouts: {
    defaultLayout: 'default',
    layoutLazy: true
  },
  routeLazy: true,
  layoutLazy: true,
  watchFile: true,
  fileUpdateDuration: 100
};

/**
 * 将用户提供的 `RoutingConfig`(可能为 `undefined` 或部分填充)合并默认值,
 * 返回完整的 `ResolvedRoutingConfig`。
 *
 * 使用 `defu()` 而非 spread,确保嵌套对象(如 `layouts`)被递归合并。
 *
 * @param userConfig 用户在 `ubean.config.ts` 中的 `routing` 字段(可能为 `undefined`)
 * @returns 解析后的完整 `RoutingConfig`,所有非函数字段均已填充默认值
 */
export function resolveRoutingConfig(userConfig?: RoutingConfig): ResolvedRoutingConfig {
  if (!userConfig) {
    return { ...routingConfigDefaults };
  }

  // 函数字段不参与 defu 合并(避免被默认值覆盖)
  const { getRouteName, getRoutePath, getRouteLayout, getRouteMeta, onGenerated, ...restUserConfig } = userConfig;

  // 手动递归合并(避免引入 defu 在 types-only 文件中造成运行时依赖)
  const merged: ResolvedRoutingConfig = {
    ...routingConfigDefaults,
    ...restUserConfig,
    layouts: {
      ...routingConfigDefaults.layouts,
      ...userConfig.layouts
    },
    reuseRoutes: userConfig.reuseRoutes ? [...userConfig.reuseRoutes] : [...routingConfigDefaults.reuseRoutes],
    pageInclude: userConfig.pageInclude ? [...userConfig.pageInclude] : [...routingConfigDefaults.pageInclude],
    pageExclude: userConfig.pageExclude ? [...userConfig.pageExclude] : [...routingConfigDefaults.pageExclude]
  };

  // 重新挂载函数字段(仅在用户提供了的情况下)
  if (getRouteName !== undefined) merged.getRouteName = getRouteName;
  if (getRoutePath !== undefined) merged.getRoutePath = getRoutePath;
  if (getRouteLayout !== undefined) merged.getRouteLayout = getRouteLayout;
  if (getRouteMeta !== undefined) merged.getRouteMeta = getRouteMeta;
  if (onGenerated !== undefined) merged.onGenerated = onGenerated;

  return merged;
}
