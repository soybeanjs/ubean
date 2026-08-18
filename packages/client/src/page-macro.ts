import type { PageMeta } from '@ubean/vue';
import type { RouteMeta, Input } from '@ubean/shared';

/**
 * 服务端 handler meta 提取结果(与 `@ubean/scan` 的 `DefineMetaResult`
 * 结构一致)。`@ubean/client` 不依赖聚合层,此处内联保持类型独立。
 */
export interface DefineMetaResult {
  meta?: Record<string, unknown>;
  requiresAuth?: boolean;
}

export function definePage(_meta: PageMeta): void {}

export function defineMeta(_meta: Partial<RouteMeta>): DefineMetaResult | void {}

export function defineMiddleware<_I extends Input>(_handler: any): void {}
