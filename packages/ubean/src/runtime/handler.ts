import type {
  Input,
  ComposedHandler,
  RouteMeta,
  UbeanHandler,
  UbeanMiddleware,
  ValidatorSlots,
  ValidatorInput
} from '../types/handler';

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function convertReturnValue(value: unknown): Response {
  if (isResponse(value)) return value;
  if (typeof value === 'string') return new Response(value, { headers: { 'Content-Type': 'text/plain' } });
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
}

async function runValidator(
  c: any,
  validators: ValidatorSlots
): Promise<{ ok: boolean; response?: Response; data?: Record<string, unknown> }> {
  const data: Record<string, unknown> = {};

  try {
    for (const [slot, schema] of Object.entries(validators) as [
      keyof ValidatorSlots,
      NonNullable<ValidatorSlots[keyof ValidatorSlots]>
    ][]) {
      let value: unknown;

      switch (slot) {
        case 'json':
          value = await c.req.json().catch(() => undefined);
          break;
        case 'form':
          value = await c.req.parseBody().catch(() => undefined);
          break;
        case 'query':
          value = Object.fromEntries(new URL(c.req.url).searchParams);
          break;
        case 'param':
          value = c.req.param();
          break;
        case 'header':
          value = Object.fromEntries(c.req.raw.headers);
          break;
        default:
          continue;
      }

      const result = await parseSchema(schema, value);
      if (!result.success) {
        return {
          ok: false,
          response: new Response(JSON.stringify({ error: 'Validation failed', slot, issues: result.issues }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        };
      }
      data[slot] = result.data;
    }
  } catch (err) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid request', message: err instanceof Error ? err.message : String(err) }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  return { ok: true, data };
}

async function parseSchema(
  schema: any,
  value: unknown
): Promise<{ success: boolean; data?: unknown; issues?: unknown[] }> {
  if (!schema) return { success: true, data: value };

  if ('~standard' in schema && typeof schema['~standard'] === 'object' && schema['~standard']) {
    const result = await (schema as any)['~standard'].validate(value);
    if (result.issues) return { success: false, issues: result.issues };
    return { success: true, data: result.value };
  }

  if (typeof schema.safeParse === 'function') {
    const result = await schema.safeParseAsync(value);
    if (!result.success) return { success: false, issues: result.error.issues };
    return { success: true, data: result.data };
  }

  return { success: true, data: value };
}

function isMetaHandler(h: unknown): h is { __brand: 'meta'; meta: RouteMeta } {
  return typeof h === 'function' && (h as any).__brand === 'meta';
}

function isValidatorHandler(h: unknown): h is { __brand: 'validator'; validators: ValidatorSlots } {
  return typeof h === 'function' && (h as any).__brand === 'validator';
}

function defineHandlerImpl(...handlers: Function[]): ComposedHandler {
  if (handlers.length === 0) {
    throw new Error('defineHandler requires at least one handler');
  }

  const metaList: Partial<RouteMeta>[] = [];
  const validatorList: ValidatorSlots[] = [];
  const middlewares: Function[] = [];
  let finalHandler: Function = handlers[handlers.length - 1];

  for (let i = 0; i < handlers.length; i++) {
    const h = handlers[i];
    if (isMetaHandler(h)) {
      metaList.push(h.meta);
      continue;
    }
    if (isValidatorHandler(h)) {
      validatorList.push(h.validators);
      middlewares.push(h);
      continue;
    }
    if (i === handlers.length - 1) {
      finalHandler = h;
    } else {
      middlewares.push(h);
    }
  }

  const mergedMeta: RouteMeta = Object.assign({ public: true }, ...metaList);
  const mergedValidators: ValidatorSlots = Object.assign({}, ...validatorList);

  const composed = async (c: any, next?: any) => {
    (c as any)._validatedData = (c as any)._validatedData || {};
    c.set('route', { meta: mergedMeta, path: c.req.path, method: c.req.method });
    Object.defineProperty(c.req, 'valid', {
      value(slot: string) {
        return (c as any)._validatedData[slot];
      },
      configurable: true
    });

    const validationResult =
      validatorList.length > 0 ? await runValidator(c, mergedValidators) : { ok: true, data: {} };

    if (!validationResult.ok) return validationResult.response;

    Object.assign((c as any)._validatedData, validationResult.data || {});

    let index = 0;
    const dispatch = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        if (isValidatorHandler(mw)) return dispatch();
        const result = await mw(c, dispatch);
        if (isResponse(result)) return result;
        if (result !== undefined && !(c as any).res) {
          return convertReturnValue(result);
        }
        return undefined;
      }
      const result = await finalHandler(c);
      return convertReturnValue(result);
    };

    const result = await dispatch();
    if (isResponse(result)) return result;
    if (next) return next();
    return c.res || result;
  };

  Object.assign(composed, { __ubeanHandler: true, __meta: mergedMeta, __validators: mergedValidators });
  return composed as ComposedHandler;
}

export function defineHandler(handler: UbeanHandler<Input>): ComposedHandler;
export function defineHandler<I1 extends Input, I2 extends Input>(
  h1: UbeanMiddleware<I1>,
  h2: UbeanHandler<I1 & I2>
): ComposedHandler;
export function defineHandler<I1 extends Input, I2 extends Input, I3 extends Input>(
  h1: UbeanMiddleware<I1>,
  h2: UbeanMiddleware<I1 & I2>,
  h3: UbeanHandler<I1 & I2 & I3>
): ComposedHandler;
export function defineHandler<I1 extends Input, I2 extends Input, I3 extends Input, I4 extends Input>(
  h1: UbeanMiddleware<I1>,
  h2: UbeanMiddleware<I1 & I2>,
  h3: UbeanMiddleware<I1 & I2 & I3>,
  h4: UbeanHandler<I1 & I2 & I3 & I4>
): ComposedHandler;
export function defineHandler(...handlers: Function[]): ComposedHandler {
  return defineHandlerImpl(...handlers);
}

export function defineMeta(meta: Partial<RouteMeta>) {
  const fn: any = async (_c: any, next: () => Promise<any>) => next();
  fn.__brand = 'meta';
  fn.meta = meta;
  return fn;
}

export function defineValidator<V extends ValidatorSlots>(validators: V) {
  const fn: any = async (_c: any, next: () => Promise<any>) => next();
  fn.__brand = 'validator';
  fn.validators = validators;
  return fn as unknown as UbeanMiddleware<ValidatorInput<V>>;
}

export function defineMiddleware<I extends Input>(handler: UbeanMiddleware<I>): UbeanMiddleware<I> {
  return handler;
}
