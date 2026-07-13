import type { MiddlewareHandler, Context, Next } from 'hono';
import type { Input, HandlerResponse, H } from 'hono/types';
import type { UbeanEnv, RouteMeta } from '../types/handler';

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function convertReturnValue(value: unknown): Response {
  if (isResponse(value)) return value;
  if (typeof value === 'string')
    return new Response(value, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function isMetaHandler(h: unknown): h is { __brand: 'meta'; meta: Partial<RouteMeta> } {
  return typeof h === 'function' && (h as { __brand?: string }).__brand === 'meta';
}

export function defineHandler<I extends Input = {}, R extends HandlerResponse<any> = any>(
  handler1: H<UbeanEnv, any, I, R>
): [H<UbeanEnv, any, I, R>];

export function defineHandler<
  I extends Input = {},
  I2 extends Input = I,
  R extends HandlerResponse<any> = any,
  R2 extends HandlerResponse<any> = any
>(
  handler1: H<UbeanEnv, any, I, R>,
  handler2: H<UbeanEnv, any, I & I2, R2>
): [H<UbeanEnv, any, I, R>, H<UbeanEnv, any, I & I2, R2>];

export function defineHandler<
  I extends Input = {},
  I2 extends Input = I,
  I3 extends Input = I & I2,
  R extends HandlerResponse<any> = any,
  R2 extends HandlerResponse<any> = any,
  R3 extends HandlerResponse<any> = any
>(
  handler1: H<UbeanEnv, any, I, R>,
  handler2: H<UbeanEnv, any, I2, R2>,
  handler3: H<UbeanEnv, any, I3, R3>
): [H<UbeanEnv, any, I, R>, H<UbeanEnv, any, I2, R2>, H<UbeanEnv, any, I3, R3>];

export function defineHandler<
  I extends Input = {},
  I2 extends Input = I,
  I3 extends Input = I & I2,
  I4 extends Input = I & I2 & I3,
  R extends HandlerResponse<any> = any,
  R2 extends HandlerResponse<any> = any,
  R3 extends HandlerResponse<any> = any,
  R4 extends HandlerResponse<any> = any
>(
  handler1: H<UbeanEnv, any, I, R>,
  handler2: H<UbeanEnv, any, I2, R2>,
  handler3: H<UbeanEnv, any, I3, R3>,
  handler4: H<UbeanEnv, any, I4, R4>
): [H<UbeanEnv, any, I, R>, H<UbeanEnv, any, I2, R2>, H<UbeanEnv, any, I3, R3>, H<UbeanEnv, any, I4, R4>];

export function defineHandler<
  I extends Input = {},
  I2 extends Input = I,
  I3 extends Input = I & I2,
  I4 extends Input = I & I2 & I3,
  I5 extends Input = I & I2 & I3 & I4,
  R extends HandlerResponse<any> = any,
  R2 extends HandlerResponse<any> = any,
  R3 extends HandlerResponse<any> = any,
  R4 extends HandlerResponse<any> = any,
  R5 extends HandlerResponse<any> = any
>(
  handler1: H<UbeanEnv, any, I, R>,
  handler2: H<UbeanEnv, any, I2, R2>,
  handler3: H<UbeanEnv, any, I3, R3>,
  handler4: H<UbeanEnv, any, I4, R4>,
  handler5: H<UbeanEnv, any, I5, R5>
): [
  H<UbeanEnv, any, I, R>,
  H<UbeanEnv, any, I2, R2>,
  H<UbeanEnv, any, I3, R3>,
  H<UbeanEnv, any, I4, R4>,
  H<UbeanEnv, any, I5, R5>
];

export function defineHandler(...handlers: any[]): MiddlewareHandler[] {
  if (handlers.length === 0) {
    throw new Error('defineHandler requires at least one handler');
  }

  const metaList: Partial<RouteMeta>[] = [];
  const middlewares: MiddlewareHandler[] = [];
  const finalHandler = handlers[handlers.length - 1] as MiddlewareHandler;

  for (let i = 0; i < handlers.length - 1; i++) {
    const h = handlers[i] as any;
    if (isMetaHandler(h)) {
      metaList.push(h.meta);
    } else {
      middlewares.push(h);
    }
  }

  const routeMeta: RouteMeta = Object.assign({ requiresAuth: true }, ...metaList) as RouteMeta;

  const wrappedFinal: MiddlewareHandler = async (c: any) => {
    const result = await finalHandler(c, async () => {});
    return convertReturnValue(result);
  };

  const allHandlers: MiddlewareHandler[] = [...middlewares, wrappedFinal];

  Object.defineProperty(allHandlers, '__routeMeta', {
    value: routeMeta,
    enumerable: false,
    configurable: false
  });

  return allHandlers;
}

export function isHandlerChain(obj: unknown): obj is MiddlewareHandler[] {
  return Array.isArray(obj) && (obj as any).__routeMeta !== undefined;
}

export function extractRouteMeta(handlers: MiddlewareHandler[]): RouteMeta {
  return (handlers as any).__routeMeta ?? { requiresAuth: true };
}

export function defineHandlerMeta(meta: Partial<RouteMeta>) {
  const fn = async (_c: Context<UbeanEnv>, next: Next) => next();
  Object.assign(fn, { __brand: 'meta' as const, meta });
  return fn;
}

export function defineMiddleware(handler: MiddlewareHandler<UbeanEnv>) {
  return handler;
}
