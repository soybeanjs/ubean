import type {
  Input,
  ComposedHandler,
  RouteMeta,
  UbeanHandler,
  UbeanMiddleware,
  ValidatorSlots,
  ValidatorInput,
  UbeanContext
} from '../types/handler';

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function convertReturnValue(value: unknown): Response {
  if (isResponse(value)) return value;
  if (typeof value === 'string')
    return new Response(value, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

async function runValidator(
  c: UbeanContext,
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
          response: c.json({ error: 'Validation failed', slot, issues: result.issues }, 400)
        };
      }
      data[slot] = result.data;
    }
  } catch (err) {
    return {
      ok: false,
      response: c.json({ error: 'Invalid request', message: err instanceof Error ? err.message : String(err) }, 400)
    };
  }

  return { ok: true, data };
}

async function parseSchema(
  schema: NonNullable<ValidatorSlots[keyof ValidatorSlots]>,
  value: unknown
): Promise<{ success: boolean; data?: unknown; issues?: unknown[] }> {
  if (!schema) return { success: true, data: value };

  if ('~standard' in schema && typeof schema['~standard'] === 'object' && schema['~standard']) {
    const result = await schema['~standard'].validate(value);
    if (result.issues) return { success: false, issues: result.issues as unknown[] };
    return { success: true, data: result.value };
  }

  if (typeof (schema as { safeParse?: Function }).safeParse === 'function') {
    const result = await (schema as { safeParseAsync: Function }).safeParseAsync(value);
    if (!result.success) return { success: false, issues: result.error.issues };
    return { success: true, data: result.data };
  }

  return { success: true, data: value };
}

function isMetaHandler(h: unknown): h is { __brand: 'meta'; meta: RouteMeta } {
  return typeof h === 'function' && (h as { __brand?: string }).__brand === 'meta';
}

function isValidatorHandler(h: unknown): h is { __brand: 'validator'; validators: ValidatorSlots } {
  return typeof h === 'function' && (h as { __brand?: string }).__brand === 'validator';
}

function defineHandlerImpl(...handlers: Function[]): ComposedHandler {
  if (handlers.length === 0) {
    throw new Error('defineHandler requires at least one handler');
  }

  const metaList: Partial<RouteMeta>[] = [];
  const validatorList: ValidatorSlots[] = [];
  const middlewares: UbeanMiddleware<Input>[] = [];
  let finalHandler: UbeanHandler<Input> = handlers[handlers.length - 1] as UbeanHandler<Input>;

  for (let i = 0; i < handlers.length; i++) {
    const h = handlers[i] as UbeanMiddleware<Input> | UbeanHandler<Input>;
    if (isMetaHandler(h)) {
      metaList.push(h.meta);
      continue;
    }
    if (isValidatorHandler(h)) {
      validatorList.push(h.validators);
      middlewares.push(h as unknown as UbeanMiddleware<Input>);
      continue;
    }
    if (i === handlers.length - 1) {
      finalHandler = h as UbeanHandler<Input>;
    } else {
      middlewares.push(h as UbeanMiddleware<Input>);
    }
  }

  const mergedMeta: RouteMeta = Object.assign({ public: true }, ...metaList);
  const mergedValidators: ValidatorSlots = Object.assign({}, ...validatorList);

  const composed: ComposedHandler = async (c: UbeanContext, next) => {
    const ctx = c as UbeanContext & { _validatedData: Record<string, unknown> };
    ctx._validatedData = ctx._validatedData || {};
    c.set('route', { meta: mergedMeta, path: c.req.path, method: c.req.method });
    Object.defineProperty(c.req, 'valid', {
      value<T extends keyof Input>(slot: T): Input[T] {
        return ctx._validatedData[slot as string] as Input[T];
      },
      configurable: true
    });

    const validationResult =
      validatorList.length > 0 ? await runValidator(c, mergedValidators) : { ok: true as const, data: {} };

    if (!validationResult.ok) return validationResult.response;

    Object.assign(ctx._validatedData, validationResult.data || {});

    let index = 0;
    const dispatch = async (): Promise<Response | undefined> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        if (isValidatorHandler(mw)) return dispatch();
        const result = await mw(
          c as UbeanContext & { req: { valid: <K extends keyof Input>(slot: K) => Input[K] } },
          dispatch
        );
        if (isResponse(result)) return result;
        if (result !== undefined && !(c as unknown as { res: unknown }).res) {
          return convertReturnValue(result);
        }
        return undefined;
      }
      const result = await finalHandler(
        c as UbeanContext & { req: { valid: <K extends keyof Input>(slot: K) => Input[K] } }
      );
      return convertReturnValue(result);
    };

    const result = await dispatch();
    if (isResponse(result)) return result;
    if (next) return next();
    return (c as unknown as { res?: Response }).res || result;
  };

  Object.assign(composed, { __ubeanHandler: true, __meta: mergedMeta, __validators: mergedValidators });
  return composed;
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
  const fn = async (_c: UbeanContext, next: () => Promise<unknown>) => next();
  Object.assign(fn, { __brand: 'meta' as const, meta });
  return fn;
}

export function defineValidator<V extends ValidatorSlots>(validators: V) {
  const fn = async (_c: UbeanContext, next: () => Promise<unknown>) => next();
  Object.assign(fn, { __brand: 'validator' as const, validators });
  return fn as unknown as UbeanMiddleware<ValidatorInput<V>>;
}

export function defineMiddleware<I extends Input>(handler: UbeanMiddleware<I>): UbeanMiddleware<I> {
  return handler;
}
