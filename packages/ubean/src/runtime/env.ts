import type { ZodSchema } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export type EnvSchema = Record<
  string,
  | StandardSchemaV1
  | ZodSchema
  | { type: StringConstructor | NumberConstructor | BooleanConstructor; default?: unknown; required?: boolean }
>;

export type InferEnvOutput<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<S[K]>
    : S[K] extends ZodSchema<infer O>
      ? O
      : S[K] extends { type: StringConstructor }
        ? string
        : S[K] extends { type: NumberConstructor }
          ? number
          : S[K] extends { type: BooleanConstructor }
            ? boolean
            : string;
};

export interface EnvConfig<S extends EnvSchema = EnvSchema> {
  /** Server-only env variables (not exposed to client) */
  server?: S;
  /** Public env variables (exposed to client via import.meta.env) */
  public?: S;
  /** Validation mode - 'warn' logs errors, 'throw' throws on validation failure */
  mode?: 'warn' | 'throw';
}

export interface DefineEnvResult<S extends EnvSchema> {
  readonly env: InferEnvOutput<S>;
  validate(source?: Record<string, string | undefined>): {
    success: boolean;
    errors: EnvValidationError[];
    data: InferEnvOutput<S>;
  };
}

export interface EnvValidationError {
  key: string;
  message: string;
  value: unknown;
}

function parseSchemaValue(
  schema: any,
  rawValue: string | undefined,
  key: string
): { ok: boolean; value?: unknown; error?: string } {
  if (!schema) return { ok: true, value: rawValue };

  if ('~standard' in schema && typeof schema['~standard'] === 'object' && schema['~standard']) {
    return { ok: false, error: 'Standard schema validation requires async validate, use validate() instead' };
  }

  if (typeof schema.safeParse === 'function') {
    const result = schema.safeParse(rawValue);
    if (!result.success) return { ok: false, error: result.error?.issues?.[0]?.message || 'invalid' };
    return { ok: true, value: result.data };
  }

  if (schema.type === String) {
    if (rawValue === undefined || rawValue === '') {
      if (schema.default !== undefined) return { ok: true, value: schema.default };
      if (schema.required === false) return { ok: true, value: undefined };
      return { ok: false, error: `Missing required env: ${key}` };
    }
    return { ok: true, value: rawValue };
  }

  if (schema.type === Number) {
    if (rawValue === undefined || rawValue === '') {
      if (schema.default !== undefined) return { ok: true, value: schema.default };
      if (schema.required === false) return { ok: true, value: undefined };
      return { ok: false, error: `Missing required env: ${key}` };
    }
    const n = Number(rawValue);
    if (Number.isNaN(n)) return { ok: false, error: `Env ${key} must be a number, got ${rawValue}` };
    return { ok: true, value: n };
  }

  if (schema.type === Boolean) {
    if (rawValue === undefined || rawValue === '') {
      if (schema.default !== undefined) return { ok: true, value: schema.default };
      if (schema.required === false) return { ok: true, value: undefined };
      return { ok: false, error: `Missing required env: ${key}` };
    }
    return { ok: true, value: rawValue === 'true' || rawValue === '1' };
  }

  return { ok: true, value: rawValue };
}

function validateSchemaSync<S extends EnvSchema>(
  schema: S,
  source: Record<string, string | undefined>
): { success: boolean; errors: EnvValidationError[]; data: Record<string, unknown> } {
  const errors: EnvValidationError[] = [];
  const data: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const rawValue = source[key];
    const result = parseSchemaValue(def, rawValue, key);
    if (!result.ok) {
      errors.push({ key, message: result.error || 'invalid', value: rawValue });
    } else {
      data[key] = result.value;
    }
  }

  return { success: errors.length === 0, errors, data: data as InferEnvOutput<S> };
}

export function defineEnv<S extends EnvSchema>(config: EnvConfig<S>): DefineEnvResult<S> {
  const serverSource = typeof process !== 'undefined' ? process.env : (globalThis as any).process?.env || {};

  const mergedSchema = { ...config.public, ...config.server } as S;

  const initial = validateSchemaSync(mergedSchema, serverSource as Record<string, string | undefined>);

  if (!initial.success && config.mode === 'throw') {
    const messages = initial.errors.map(e => `  - ${e.key}: ${e.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }

  const envProxy = new Proxy(initial.data, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return target[prop];
      }
      return undefined;
    }
  }) as InferEnvOutput<S>;

  return {
    env: envProxy,
    validate(source?: Record<string, string | undefined>) {
      return validateSchemaSync(mergedSchema, source || (serverSource as Record<string, string | undefined>)) as {
        success: boolean;
        errors: EnvValidationError[];
        data: InferEnvOutput<S>;
      };
    }
  };
}

let _runtimeEnv: Record<string, unknown> = {};

export function setRuntimeEnv(env: Record<string, unknown>) {
  _runtimeEnv = { ..._runtimeEnv, ...env };
}

export function useRuntimeEnv<T = string>(key: string, defaultValue?: T): T {
  return (_runtimeEnv[key] ?? defaultValue) as T;
}
