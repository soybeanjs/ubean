import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { GenericSchema } from './types';

interface GlobalWithProcess {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

export type EnvSchema = Record<string, EnvFieldDef>;

/**
 * 环境变量的**归属维度**（借用 Astro `astro:env` 的模型，见 docs/contracts/env-v1.md）。
 *
 * - `context`: 值在哪一侧可用。`client` → 构建期内联进客户端产物（服务端同样可读）；
 *   `server` → 只在服务端运行时读取。
 * - `access`: 值是否敏感。`secret` 永不进客户端产物；`public` 可以（但 `client` 侧的
 *   public 才会被内联）。
 *
 * 合法组合只有三种：`client+public`、`server+public`、`server+secret`。
 * `client+secret` 在建 schema 时直接抛错 —— 这是 Astro 的硬约束，也是本设计里唯一
 * 「配置期就失败」的规则。
 */
export type EnvContext = 'client' | 'server';
export type EnvAccess = 'public' | 'secret';

export interface EnvFieldMeta<T = unknown> {
  /** 判别标记：把 `envField.*()` 的产物与 legacy 三形态区分开。 */
  readonly __ubeanEnvField: true;
  readonly type: 'string' | 'number' | 'boolean' | 'enum';
  readonly context: EnvContext;
  readonly access: EnvAccess;
  /** 仅 `type: 'enum'` 有值。 */
  readonly values?: readonly string[];
  readonly optional?: boolean;
  readonly default?: T;
  /** 纯类型标记(运行时不写),让 `InferEnvOutput` 能推出字面量联合。 */
  readonly _output?: T;
}

/**
 * 一个 schema 字段：新形态（`envField.*()`）或 legacy 形态。
 *
 * legacy 形态保留是为了不破坏既有 `defineEnv({ server, public })` 调用 —— 现有仓库
 * 与示例都在用，`0.6.x` 内不能变语义。
 */
export type EnvFieldDef =
  | StandardSchemaV1
  | GenericSchema
  | EnvFieldMeta
  | { type: StringConstructor | NumberConstructor | BooleanConstructor; default?: unknown; required?: boolean };

interface EnvFieldBase {
  context: EnvContext;
  access: EnvAccess;
  optional?: boolean;
}

export interface EnvStringFieldOptions extends EnvFieldBase {
  default?: string;
}

export interface EnvNumberFieldOptions extends EnvFieldBase {
  default?: number;
}

export interface EnvBooleanFieldOptions extends EnvFieldBase {
  default?: boolean;
}

export interface EnvEnumFieldOptions<V extends readonly string[]> extends EnvFieldBase {
  values: V;
  default?: V[number];
}

function assertEnvFieldCombo(options: { context: EnvContext; access: EnvAccess }): void {
  if (options.context === 'client' && options.access === 'secret') {
    throw new Error(
      "Invalid env field: context 'client' cannot be combined with access 'secret'. " +
        "Secrets are never sent to the client; use `{ context: 'server', access: 'secret' }`."
    );
  }
}

/**
 * 声明一个环境变量字段（Astro `envField` 的等价物）。
 *
 * @example
 * ```ts
 * // ubean.config.ts
 * export default defineConfig({
 *   env: {
 *     schema: {
 *       PUBLIC_API_BASE: envField.string({ context: 'client', access: 'public', default: '/api' }),
 *       DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
 *       PORT: envField.number({ context: 'server', access: 'public', default: 9527 })
 *     }
 *   }
 * });
 * ```
 */
export const envField = {
  string(options: EnvStringFieldOptions): EnvFieldMeta<string> {
    assertEnvFieldCombo(options);
    return { __ubeanEnvField: true, type: 'string', ...options };
  },
  number(options: EnvNumberFieldOptions): EnvFieldMeta<number> {
    assertEnvFieldCombo(options);
    return { __ubeanEnvField: true, type: 'number', ...options };
  },
  boolean(options: EnvBooleanFieldOptions): EnvFieldMeta<boolean> {
    assertEnvFieldCombo(options);
    return { __ubeanEnvField: true, type: 'boolean', ...options };
  },
  enum<const V extends readonly string[]>(options: EnvEnumFieldOptions<V>): EnvFieldMeta<V[number]> {
    assertEnvFieldCombo(options);
    return { __ubeanEnvField: true, type: 'enum', ...options };
  }
};

export function isEnvFieldMeta(value: unknown): value is EnvFieldMeta {
  return typeof value === 'object' && value !== null && (value as EnvFieldMeta).__ubeanEnvField === true;
}

export type InferEnvOutput<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<S[K]>
    : S[K] extends GenericSchema<infer O>
      ? O
      : S[K] extends EnvFieldMeta<infer O>
        ? O
        : S[K] extends { type: StringConstructor }
          ? string
          : S[K] extends { type: NumberConstructor }
            ? number
            : S[K] extends { type: BooleanConstructor }
              ? boolean
              : string;
};

/**
 * 规范化后的字段：把 legacy 的 `server:` / `public:` 分组糖与显式 `context`/`access`
 * 统一成同一形状。codegen 与虚拟模块都只消费这个形状。
 */
export interface NormalizedEnvField {
  key: string;
  context: EnvContext;
  access: EnvAccess;
  def: EnvFieldDef;
}

/**
 * legacy 分组 → 维度映射。
 *
 * `server:` 组历史语义是「只在服务端读」→ `server + secret`。
 * `public:` 组历史语义是「不敏感、客户端也能拿」→ `client + public`（`client` 侧在服务端
 * 同样可读，所以 examples 里在 API handler 中读 `env.API_BASE_URL` 的行为不变）。
 */
const LEGACY_GROUP_DIMENSIONS = {
  server: { context: 'server', access: 'secret' },
  public: { context: 'client', access: 'public' }
} as const;

export interface EnvConfig<S extends EnvSchema = EnvSchema> {
  /**
   * 扁平 schema —— 每个字段自带 `context` / `access`（`envField.*()` 声明）。
   * 这是新写法，也是 `ubean.config.ts` 的 `env.schema` 直通入口。
   */
  schema?: S;
  /**
   * @deprecated 用 `schema` + `envField.*()` 代替。
   *
   * 分组糖：组内字段默认 `context: 'server', access: 'secret'`。
   */
  server?: S;
  /**
   * @deprecated 用 `schema` + `envField.*()` 代替。
   *
   * 分组糖：组内字段默认 `context: 'client', access: 'public'`。
   */
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

  if (isEnvFieldMeta(schema)) {
    return parseEnvFieldValue(schema, rawValue, key);
  }

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

/** 缺失判定用内联比较而非 `isMissing()` 谓词函数 —— 后者是 boolean 返回，
 * TypeScript 不会据此收窄 `string | undefined`，下游的 `values.includes()` 就会报错。 */

/**
 * 解析 `envField.*()` 声明的字段。
 *
 * 三种类型各自的行为与 legacy 形态保持一致（缺失 → `default` → `optional` 放行 → 报错），
 * 多出来的是 `enum` 的成员校验：值不在 `values` 里直接失败，不做静默回落 ——
 * 枚举变量的拼写错误在启动期暴露比在运行期暴露便宜得多。
 */
function parseEnvFieldValue(
  meta: EnvFieldMeta,
  rawValue: string | undefined,
  key: string
): { ok: boolean; value?: unknown; error?: string } {
  if (rawValue === undefined || rawValue === '') {
    if (meta.default !== undefined) return { ok: true, value: meta.default };
    if (meta.optional === true) return { ok: true, value: undefined };
    return { ok: false, error: `Missing required env: ${key}` };
  }

  if (meta.type === 'string') return { ok: true, value: rawValue };

  if (meta.type === 'number') {
    const n = Number(rawValue);
    if (Number.isNaN(n)) return { ok: false, error: `Env ${key} must be a number, got ${rawValue}` };
    return { ok: true, value: n };
  }

  if (meta.type === 'boolean') {
    return { ok: true, value: rawValue === 'true' || rawValue === '1' };
  }

  const values = meta.values ?? [];
  if (!values.includes(rawValue)) {
    return { ok: false, error: `Env ${key} must be one of ${values.join(' | ')}, got ${rawValue}` };
  }
  return { ok: true, value: rawValue };
}

/**
 * 把用户 schema（含 legacy 分组糖）摊平成 `NormalizedEnvField[]`。
 *
 * 字段自带的 `context`/`access` 优先于分组默认值 —— 这样用户可以在 legacy 的
 * `server:` 组里单独把一个字段标成 `public`，不必整体重写。
 */
export function normalizeEnvSchema(schema: EnvSchema | EnvConfig): NormalizedEnvField[] {
  const fields: NormalizedEnvField[] = [];

  const push = (key: string, def: EnvFieldDef, fallback: { context: EnvContext; access: EnvAccess }) => {
    const explicit = isEnvFieldMeta(def) ? { context: def.context, access: def.access } : null;
    const dimensions = explicit ?? fallback;
    if (dimensions.context === 'client' && dimensions.access === 'secret') {
      throw new Error(`Invalid env field "${key}": context 'client' cannot be combined with access 'secret'.`);
    }
    fields.push({ key, context: dimensions.context, access: dimensions.access, def });
  };

  const record = schema as Record<string, unknown>;

  // 扁平 schema（`{ schema: {...} }` 或裸 schema）：`mode` 是配置键不是字段，显式跳过。
  if (!('server' in record) && !('public' in record)) {
    const flat = ('schema' in record ? record.schema : record) as EnvSchema;
    if (!flat || typeof flat !== 'object') return fields;
    for (const [key, def] of Object.entries(flat)) {
      if (!isEnvFieldMeta(def)) {
        // 扁平形式下的 legacy 三形态缺维度信息：按「最保守」处理 —— 当服务端 secret，
        // 绝不进客户端产物。要跨侧可见就显式用 `envField.*()` 声明维度。
        push(key, def, LEGACY_GROUP_DIMENSIONS.server);
        continue;
      }
      push(key, def, { context: def.context, access: def.access });
    }
    return fields;
  }

  const grouped = schema as EnvConfig;
  for (const [key, def] of Object.entries(grouped.server ?? {})) push(key, def, LEGACY_GROUP_DIMENSIONS.server);
  for (const [key, def] of Object.entries(grouped.public ?? {})) push(key, def, LEGACY_GROUP_DIMENSIONS.public);
  return fields;
}

/**
 * 服务端运行时校验：按规范化字段读 `source`（默认 `process.env`），产出强类型对象。
 *
 * 与 `defineEnv()` 的区别：这里只处理「已经归好维度」的字段，不碰 legacy 分组糖 ——
 * 虚拟模块 `ubean:env/server` 的运行时校验走它。
 */
export function resolveEnvSchema(
  schema: EnvSchema | EnvConfig,
  source?: Record<string, string | undefined>
): { success: boolean; errors: EnvValidationError[]; data: Record<string, unknown> } {
  const fields = normalizeEnvSchema(schema);
  const resolvedSource = source ?? readProcessEnv();
  const errors: EnvValidationError[] = [];
  const data: Record<string, unknown> = {};

  for (const field of fields) {
    const rawValue = resolvedSource[field.key];
    const result = parseEnvFieldOrLegacy(field.def, rawValue, field.key);
    if (!result.ok) {
      errors.push({ key: field.key, message: result.error || 'invalid', value: rawValue });
    } else {
      data[field.key] = result.value;
    }
  }

  return { success: errors.length === 0, errors, data };
}

function parseEnvFieldOrLegacy(
  def: EnvFieldDef,
  rawValue: string | undefined,
  key: string
): { ok: boolean; value?: unknown; error?: string } {
  return parseSchemaValue(def, rawValue, key);
}

function readProcessEnv(): Record<string, string | undefined> {
  if (typeof process !== 'undefined' && process.env) return process.env;
  return (globalThis as GlobalWithProcess).process?.env || {};
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
  const serverSource = readProcessEnv();

  // legacy 分组糖与扁平 schema 在这里合并成同一份扁平表 —— 输出对象一律是「扁平键」形状，
  // 与旧行为一致（旧代码 `{ server: { PORT }, public: { API } }` 读 `env.PORT` / `env.API`）。
  const mergedSchema = { ...config.public, ...config.server, ...config.schema } as S;

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

/**
 * 当前是否运行在 Node 系运行时（Node / Bun / Deno 的 node 兼容层）上。
 *
 * 用途：**把 Node 专用能力挡在动态 import 里**。Cloudflare Workers 这类运行时没有 `node:fs`
 * （即使开 `nodejs_compat` 也不支持），而打包器会把「静态 import 的 node 内建」留在产物里 ——
 * workerd 在**模块实例化**阶段就会失败（`No such module "node:fs/promises"`），根本轮不到分支
 * 判断。因此判据必须是运行时的，且 `import()` 必须写在分支内部（动态 import 只在执行时才解析）。
 *
 * 判定用 `process.versions.node` 而不是 `typeof process`：bundler 常会把 `process` 替身注入浏览器
 * 产物，只看 `process` 会在 worker/browser 里误判为真。
 */
export function isNodeRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string; bun?: string; deno?: string } } }).process;
  return typeof proc?.versions?.node === 'string' || typeof proc?.versions?.bun === 'string';
}
