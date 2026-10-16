/**
 * `env.schema` → 两个虚拟模块（`ubean:env/client` / `ubean:env/server`）的规范化与取值。
 *
 * 这一层刻意与 Vite 无耦合（纯函数 + 显式入参），因为同一个产物要服务两个环境：
 * - **client 模块**：字段被内联成字面量，取值来自 Vite 已解析好的 `import.meta.env`（构建期）
 * - **server 模块**：字段从 `process.env` 读（运行期），并在 `mode: 'throw'` 时于 import 期抛错
 *
 * 维度规则照抄 Astro `astro:env`：`client+public` / `server+public` / `server+secret` 三种合法，
 * `client+secret` 在**规范化阶段**就抛错（配置期失败，比构建期失败早）。
 */

import { isEnvFieldMeta } from '@ubean/shared';
import type { EnvFieldMeta } from '@ubean/shared';

/**
 * schema 条目的类型。
 *
 * `ResolvedConfig.env.schema` 对外是 `Record<string, unknown>`（配置经过 `defu` 合并与 JSON 化，
 * 类型已经丢了），所以在归一化边界上接 `unknown` 并在内部收窄：所有取值路径都要先过
 * `isEnvFieldMeta()`，非 meta 的 legacy 形态（`{ type: String, default }`）在 `typeOfField()` /
 * `dimensionsOf()` 里自己窄化。
 */
type EnvFieldDef = unknown;

export type EnvContext = 'client' | 'server';
export type EnvAccess = 'public' | 'secret';

export interface EnvFieldSpec {
  key: string;
  context: EnvContext;
  access: EnvAccess;
  /** TypeScript 字面量类型，直接写进 `.ubean/env.d.ts`。 */
  type: string;
  optional: boolean;
  /**
   * 已解析的值：
   * - `context: 'client'` → 构建期内联用的字面量（来自 `import.meta.env` / `.env`，已含 default 回退）
   * - `context: 'server'` → **`default` 的回退值**（`process.env` 里没值时用）。
   *   服务端的真实取值发生在运行期，这里只把回退值送到生成代码里。
   *   字段没写 `default` 时保持 `undefined`，生成代码便能区分「有回退」与「无回退」。
   */
  value?: unknown;
  /** 生成代码里表达「值来自 process.env 的哪个键」——恒等于 `key`（保留字段便于日后加 alias）。 */
  sourceKey: string;
}

export interface ResolveEnvModulesInput {
  /** 归一化 schema（`ResolvedConfig.env.schema`）。 */
  schema: Record<string, unknown>;
  /** Vite 解析后的 `import.meta.env`（`ResolvedConfig.env`），用于 client 字段取值。 */
  importMetaEnv?: Record<string, unknown>;
  /**
   * `.env` 文件的原始内容（`loadEnv(mode, envDir, '')`）。
   *
   * 与 `importMetaEnv` 的分工：`import.meta.env` 只含 Vite 注入的 key（`VITE_*` + 内建），
   * 而 `.env` 里有全量。优先 `importMetaEnv`，缺了才回落这里 —— 这样 `MODE` 这类构建期
   * 派生值不会因为 `.env` 里也写了同名 key 被盖掉。
   */
  dotEnv?: Record<string, string>;
  /** 服务端侧来源，默认 `process.env`。测试可注入。 */
  serverEnv?: Record<string, string | undefined>;
}

export interface EnvModules {
  client: EnvFieldSpec[];
  server: EnvFieldSpec[];
}

function typeOfField(def: EnvFieldDef): string {
  if (isEnvFieldMeta(def)) {
    if (def.type === 'enum') return (def.values ?? []).map(v => JSON.stringify(v)).join(' | ') || 'string';
    if (def.type === 'number') return 'number';
    if (def.type === 'boolean') return 'boolean';
    return 'string';
  }
  const legacy = def as { type?: unknown; default?: unknown };
  if (legacy.type === Number) return 'number';
  if (legacy.type === Boolean) return 'boolean';
  if (legacy.type === String) return 'string';
  // StandardSchemaV1 / GenericSchema：从纯类型标记取，取不到就退化成 unknown。
  return 'unknown';
}

function dimensionsOf(def: EnvFieldDef): { context: EnvContext; access: EnvAccess } {
  if (isEnvFieldMeta(def)) return { context: def.context, access: def.access };
  // 扁平无维度的 legacy 形态按最保守处理：服务端私有（与 `normalizeEnvSchema` 一致）。
  return { context: 'server', access: 'secret' };
}

/**
 * 规范化 schema → 两个模块各自的字段清单。
 *
 * 值解析失败（缺必填、类型不符、枚举越界）**不在这里报错** —— 那是运行时校验（`resolveEnvSchema()`
 * 与生成的 server 模块）的职责。这里只负责把维度与类型摊平，缺值时留 `undefined` 让下游决定。
 */
export function resolveEnvModules(input: ResolveEnvModulesInput): EnvModules {
  const { schema, importMetaEnv = {}, dotEnv = {}, serverEnv = process.env as Record<string, string | undefined> } = input;

  const client: EnvFieldSpec[] = [];
  const server: EnvFieldSpec[] = [];

  for (const [key, def] of Object.entries(schema)) {
    const { context, access } = dimensionsOf(def);
    if (context === 'client' && access === 'secret') {
      throw new Error(
        `Invalid env field "${key}": context 'client' cannot be combined with access 'secret'. ` +
          "Secrets never reach the client — use `{ context: 'server', access: 'secret' }`."
      );
    }

    const meta = isEnvFieldMeta(def) ? (def as EnvFieldMeta) : null;
    const optional = meta ? meta.optional === true : false;
    const spec: EnvFieldSpec = {
      key,
      context,
      access,
      type: typeOfField(def),
      optional,
      sourceKey: key
    };

    if (context === 'client') {
      // `import.meta.env`（Vite 注入）优先，回落 `.env` 原始值 —— 后者覆盖没写 `VITE_` 前缀、
      // 因而不会被 Vite 注入的 client 字段。
      const raw = importMetaEnv[key] ?? dotEnv[key];
      const resolved = raw === undefined || raw === '' ? meta?.default : raw;
      if (resolved !== undefined) spec.value = resolved;
      client.push(spec);
    } else {
      // 服务端值不在这里解析：生成代码在运行期读 `process.env[key]`。
      // 但类型和默认值要在这里定下来 —— 有 `default` 时就不是 optional，且生成代码
      // 要在运行期缺值时回退到它（`spec.value` 就是回退值）。
      const hasDefault = meta ? meta.default !== undefined : (def as { default?: unknown }).default !== undefined;
      const rawServer = serverEnv[key];
      spec.optional = optional || (!hasDefault && (rawServer === undefined || rawServer === ''));
      if (hasDefault) spec.value = meta ? meta.default : (def as { default?: unknown }).default;
      server.push(spec);
    }
  }

  return { client, server };
}

/** 生成客户端虚拟模块源码：每个字段一个具名导出的字面量。 */
export function renderEnvClientModule(fields: EnvFieldSpec[]): string {
  const lines = [
    '// Generated by ubean from `env.schema` in ubean.config.ts — do not edit.',
    '// Values are inlined at build time from Vite-resolved `import.meta.env`.'
  ];
  for (const field of fields) {
    if (field.value === undefined) {
      lines.push(`// ${field.key}: no value resolved at build time${field.optional ? ' (optional)' : ''}`);
      lines.push(`export const ${field.key} = undefined;`);
      continue;
    }
    lines.push(`export const ${field.key} = ${JSON.stringify(field.value)};`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 生成服务端虚拟模块源码。
 *
 * 语义是 **static**（借 SvelteKit 的术语）：模块求值时读一次 `process.env`，之后固定。
 * 与 Astro `astro:env/server` 一致 —— 需要 per-request 动态读取时用 `getSecret()`（见下）。
 *
 * 校验失败时：`mode: 'throw'` 直接抛，`'warn'`（默认）打 warn 并把缺值放行。
 * 选择在 import 期抛而不是返回 `undefined`：缺一个必填 secret 却静默跑下去，
 * 会把「部署忘了配环境变量」拖到第一次请求才炸。
 */
export function renderEnvServerModule(fields: EnvFieldSpec[], mode: 'warn' | 'throw' = 'warn'): string {
  const specs = fields.map(f => ({
    key: f.key,
    type: f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string',
    optional: f.optional,
    // `default` 必须一起带过去：早先漏了它，于是「写了 `default` 的必填字段」在 `.env`
    // 缺失时得到 `Missing required env` 而非取默认值 —— 声明里写了默认值、运行期却
    // 把默认值当不存在，与 `client` 侧行为不一致（同一个 schema，两种语义）。
    // `JSON.stringify` 会丢掉值为 `undefined` 的 default，生成代码里该字段即缺失。
    default: f.value
  }));

  return `// Generated by ubean from \`env.schema\` in ubean.config.ts — do not edit.
// Reads \`process.env\` once, at module evaluation time (static semantics).

const __specs = ${JSON.stringify(specs)};
const __source = typeof process !== 'undefined' && process.env ? process.env : {};
const __errors = [];
const __values = {};

for (const spec of __specs) {
  const raw = __source[spec.key];
  if (raw === undefined || raw === '') {
    if (spec.default !== undefined) {
      __values[spec.key] = spec.default;
      continue;
    }
    if (!spec.optional) __errors.push(\`  - \${spec.key}: Missing required env\`);
    __values[spec.key] = undefined;
    continue;
  }
  if (spec.type === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      __errors.push(\`  - \${spec.key}: must be a number, got \${raw}\`);
      __values[spec.key] = undefined;
      continue;
    }
    __values[spec.key] = n;
    continue;
  }
  if (spec.type === 'boolean') {
    __values[spec.key] = raw === 'true' || raw === '1';
    continue;
  }
  __values[spec.key] = raw;
}

if (__errors.length > 0) {
  const message = 'Environment validation failed:\\n' + __errors.join('\\n');
  if (${JSON.stringify(mode)} === 'throw') throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn('[ubean:env/server] ' + message);
}

export const __env = __values;
${fields.map(f => `export const ${f.key} = __values[${JSON.stringify(f.key)}];`).join('\n')}

/** 读取未在 \`env.schema\` 里声明的变量（动态 / per-request 场景）。 */
export function getSecret(key) {
  return __source[key];
}
`;
}
