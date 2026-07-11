import type { PageMeta, DefineMetaResult, DefineValidatorResult } from '../../core/routing/define-page';
import type { RouteMeta, ValidatorSlots, Input } from '../../types/handler';

export function definePage(_meta: PageMeta): void {}

export function defineMeta(_meta: Partial<RouteMeta>): DefineMetaResult | void {}

export function defineValidator<V extends ValidatorSlots>(_validators: V): DefineValidatorResult | void {}

export function defineMiddleware<_I extends Input>(_handler: any): void {}
