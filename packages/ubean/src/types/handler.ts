import type { Context, MiddlewareHandler, Env as HonoEnv } from 'hono';
import type { ZodSchema } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { RouteMeta as BaseRouteMeta } from '../core/routing/types';

export type ValidatorSlot = 'json' | 'form' | 'query' | 'param' | 'header' | 'cookie';

export type StandardSchema = StandardSchemaV1 | ZodSchema;

export interface ValidatorSlots {
  json?: StandardSchema;
  form?: StandardSchema;
  query?: StandardSchema;
  param?: StandardSchema;
  header?: StandardSchema;
  cookie?: StandardSchema;
}

export interface RouteMeta extends BaseRouteMeta {
  rateLimit?: { maxRequests: number; windowSeconds: number };
  cache?: { ttl: number; swr?: boolean };
}

export interface UbeanEnv extends HonoEnv {
  Variables: {
    route: { meta: RouteMeta; path: string; method: string };
    [key: string]: unknown;
  };
  Bindings: Record<string, unknown>;
}

export type UbeanContext = Context<UbeanEnv>;

export type InferSchemaOutput<T> = T extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<T>
  : T extends ZodSchema<infer O>
    ? O
    : never;

export type ValidatorInput<V extends ValidatorSlots> = {
  [K in keyof V as V[K] extends StandardSchema ? K : never]: InferSchemaOutput<V[K]>;
};

export type Input = {
  json?: unknown;
  form?: unknown;
  query?: unknown;
  param?: unknown;
  header?: unknown;
  cookie?: unknown;
};

export type IntersectNonAnyTypes<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? First extends any
    ? IntersectNonAnyTypes<Rest>
    : First & IntersectNonAnyTypes<Rest>
  : unknown;

export type UbeanMiddleware<I extends Input = {}> = (
  c: UbeanContext & { req: { valid: <K extends keyof I>(slot: K) => I[K] } },
  next: () => Promise<unknown>
) => unknown | Response | Promise<unknown | Response>;

export type UbeanHandler<I extends Input = {}, R = unknown> = (
  c: UbeanContext & { req: { valid: <K extends keyof I>(slot: K) => I[K] } }
) => R | Response | Promise<R | Response>;

export type ComposedHandler = MiddlewareHandler<UbeanEnv>;
