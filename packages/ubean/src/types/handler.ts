import type { Context, MiddlewareHandler, Env as HonoEnv, Handler } from 'hono';
import type { RequestIdVariables } from 'hono/request-id';
import type { Input as HonoInput, HandlerResponse } from 'hono/types';
import type { RouteMeta as BaseRouteMeta } from '../core/routing/types';
import type { Span } from '../runtime/observability';

export interface RouteMeta extends BaseRouteMeta {
  rateLimit?: { maxRequests: number; windowSeconds: number };
  cache?: { ttl: number; swr?: boolean };
}

export interface UbeanVariables extends RequestIdVariables {
  route: { meta: RouteMeta; path: string; method: string };
  span?: Span;
  locale?: string;
  pathWithoutLocale?: string;
}

export interface UbeanBindings {}

export interface UbeanEnv extends HonoEnv {
  Variables: UbeanVariables;
  Bindings: UbeanBindings;
}

export type UbeanContext = Context<UbeanEnv>;

export type Input = HonoInput;

export interface GenericSchema<O = unknown> {
  safeParse?(value: unknown): { success: boolean; data?: O; error?: { issues?: Array<{ message?: string }> } };
  parse?(value: unknown): O;
  _output?: O;
}

export type UbeanMiddleware<I extends Input = {}> = MiddlewareHandler<UbeanEnv, any, I>;

export type UbeanHandler<I extends Input = {}, R extends HandlerResponse<any> = HandlerResponse<any>> = Handler<
  UbeanEnv,
  any,
  I,
  R
>;

export type ComposedHandler = MiddlewareHandler<UbeanEnv>;
