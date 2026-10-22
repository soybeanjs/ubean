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
  routeLazy: true,
  layoutLazy: true
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
  const { getRouteMeta, onGenerated, ...restUserConfig } = userConfig;

  const merged: ResolvedRoutingConfig = {
    ...routingConfigDefaults,
    ...restUserConfig
  };

  // 重新挂载函数字段(仅在用户提供了的情况下)
  if (getRouteMeta !== undefined) merged.getRouteMeta = getRouteMeta;
  if (onGenerated !== undefined) merged.onGenerated = onGenerated;

  return merged;
}

/** `RoutingConfig` 的已知字段(用于未知字段告警)。 */
const ROUTING_KEYS = new Set<string>([...Object.keys(routingConfigDefaults), 'getRouteMeta', 'onGenerated']);

/**
 * 告警 `routing` 里已删除或拼错的字段。
 *
 * 顶层 `warnUnknownConfigKeys` 只看得见 `routing` 这个 key 本身,里面的字段
 * 由 `resolveRoutingConfig` 的 spread 静默吞掉 —— 曾经可配的 `rootRedirect`
 * / `generateBuiltinRoutes` 等已被删除,写它们的用户只会看到「配了没反应」。
 *
 * 与顶层同样不抛出:未知字段多为笔误或升级残留,不该阻断构建。
 */
export function warnUnknownRoutingKeys(routing: Record<string, unknown> | undefined): void {
  if (!routing || typeof routing !== 'object') return;

  const unknown = Object.keys(routing).filter(key => !ROUTING_KEYS.has(key));
  if (unknown.length === 0) return;

  console.warn(
    `[ubean] Unknown routing option${unknown.length > 1 ? 's' : ''} in ubean.config: ${unknown
      .map(key => `\`${key}\``)
      .join(', ')}. These are ignored — root redirects are now \`definePage({ redirect })\` on the route itself.`
  );
}
