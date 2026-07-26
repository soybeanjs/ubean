import type { RoutingConfig, ResolvedRoutingConfig } from './types';

/**
 * `RoutingConfig` 的默认值。仅在 `resolveRoutingConfig()` 中使用,通过
 * spread 与用户配置合并。
 *
 * 注意:`typed-router.d.ts` 的输出路径不在此处配置,固定生成到
 * `.ubean/typed-router.d.ts`(由消费方 `@ubean/build` 计算)。
 */
export const routingConfigDefaults: ResolvedRoutingConfig = {
  mode: 'virtual',
  outputDir: 'src/router/_generated',
  generateBuiltinRoutes: true,
  rootRedirect: '',
  notFoundRouteComponent: '404.vue',
  defaultLayout: 'default',
  routeLazy: true,
  layoutLazy: true,
  watchFile: true,
  fileUpdateDuration: 100
};

/**
 * 将用户提供的 `RoutingConfig`(可能为 `undefined` 或部分填充)合并默认值,
 * 返回完整的 `ResolvedRoutingConfig`。
 *
 * 字段全部为扁平结构(无嵌套对象),所以简单的 spread 即可正确合并,
 * 不需要递归合并嵌套对象。
 *
 * @param userConfig 用户在 `ubean.config.ts` 中的 `routing` 字段(可能为 `undefined`)
 * @returns 解析后的完整 `RoutingConfig`,所有非函数字段均已填充默认值
 */
export function resolveRoutingConfig(userConfig?: RoutingConfig): ResolvedRoutingConfig {
  if (!userConfig) {
    return { ...routingConfigDefaults };
  }

  // 函数字段不参与 spread 合并(避免被默认值覆盖)
  const { getRouteName, getRoutePath, getRouteLayout, getRouteMeta, onGenerated, ...restUserConfig } = userConfig;

  const merged: ResolvedRoutingConfig = {
    ...routingConfigDefaults,
    ...restUserConfig
  };

  // 重新挂载函数字段(仅在用户提供了的情况下)
  if (getRouteName !== undefined) merged.getRouteName = getRouteName;
  if (getRoutePath !== undefined) merged.getRoutePath = getRoutePath;
  if (getRouteLayout !== undefined) merged.getRouteLayout = getRouteLayout;
  if (getRouteMeta !== undefined) merged.getRouteMeta = getRouteMeta;
  if (onGenerated !== undefined) merged.onGenerated = onGenerated;

  return merged;
}
