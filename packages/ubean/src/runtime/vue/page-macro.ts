import type { PageMeta, DefineMetaResult } from '../../core/routing/define-page';
import type { RouteMeta, Input } from '../../types/handler';

export function definePage(_meta: PageMeta): void {}

export function defineMeta(_meta: Partial<RouteMeta>): DefineMetaResult | void {}

export function defineMiddleware<_I extends Input>(_handler: any): void {}
