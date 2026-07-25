import type { PageMeta, DefineMetaResult } from '@ubean/routing';
import type { RouteMeta, Input } from '@ubean/types';

export function definePage(_meta: PageMeta): void {}

export function defineMeta(_meta: Partial<RouteMeta>): DefineMetaResult | void {}

export function defineMiddleware<_I extends Input>(_handler: any): void {}
