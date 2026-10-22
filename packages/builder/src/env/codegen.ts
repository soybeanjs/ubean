/**
 * `.ubean/env.d.ts` 生成器。
 *
 * 两个职责：
 * 1. 给 `ubean:env/client` / `ubean:env/server` 两个虚拟模块补类型（否则用户 import 时 TS2307）
 * 2. 从 Vite 解析好的 `import.meta.env` 自动生成 `ImportMetaEnv`，替掉用户手写的那份
 *
 * 第 2 点顺手修掉一类漂移：手写 `ImportMetaEnv` 会漏 key。本仓库的实例是
 * `src/env.ts` 读了 `import.meta.env.VITE_API_PROXY_KEYS`，而 `src/typings/env.d.ts`
 * 里没有对应声明 —— 手写清单没有东西能提醒它过期。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'pathe';
import type { EnvFieldSpec } from './types';

export interface EnvTypesOptions {
  outDir: string;
  fileName?: string;
  /** `env.schema` 规范化后的两个模块字段。 */
  modules: { client: EnvFieldSpec[]; server: EnvFieldSpec[] };
  /**
   * Vite 解析后的 `import.meta.env` 快照（`ResolvedConfig.env`）。
   *
   * 用它生成 `ImportMetaEnv`：只保留 `VITE_` 前缀的 key，其余（`.env` 里的服务端变量）**不进**
   * 客户端类型面。Vite 内建刻意**不**声明，见 `renderImportMetaEnv()`。
   */
  importMetaEnv?: Record<string, unknown>;
}

/**
 * 产物文件名（单一来源：`generateEnvTypes()` 的默认值与 `CODEGEN_NON_CONTRACT_FILES`
 * 都用它，免得改了一处漏另一处）。
 */
export const ENV_TYPES_FILE_NAME = 'env.d.ts';

function tsTypeOfLiteral(value: unknown): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/**
 * 把 `envField.*({ description })` 渲染成 JSDoc 行。
 *
 * 转义行内注释终止符：说明文字里出现它就提前闭合注释，后面的声明会变成语法错误 ——
 * 而报错位置指向生成的 `.d.ts`（用户不该去改的文件），完全看不出根因。
 * 多行说明逐行加 ` * ` 前缀，否则第二行会跑到注释外面。
 */
function renderJsDoc(description: string): string[] {
  const safe = description.replaceAll('*/', '*\\/');
  const lines = safe.split(/\r?\n/).map(line => line.trimEnd());
  if (lines.length === 1) return [`  /** ${lines[0]} */`];
  return ['  /**', ...lines.map(line => `   * ${line}`.trimEnd()), '   */'];
}

function renderModuleTypes(moduleId: string, fields: EnvFieldSpec[], extraLines: string[] = []): string {
  const lines = fields.flatMap(f => {
    // 可选字段写成 `string | undefined`，不能写成 `key?: T` —— 环境模块的成员是
    // `export const`，而 `export const X?: T` 不是合法语法（在 `.d.ts` 的
    // `declare module` 块里也不行，tsc 直接 TS1005）。值缺失时导出的是 `undefined`，
    // 所以 `| undefined` 也正是运行期真实形状。
    const decl = `  export const ${f.key}: ${f.type}${f.optional ? ' | undefined' : ''};`;
    return f.description ? [...renderJsDoc(f.description), decl] : [decl];
  });

  const body = [...lines, ...(lines.length > 0 && extraLines.length > 0 ? [''] : []), ...extraLines];
  if (body.length === 0) {
    return `declare module '${moduleId}' {\n  // env.schema is empty\n}\n`;
  }
  return `declare module '${moduleId}' {\n${body.join('\n')}\n}\n`;
}

/**
 * 从 `import.meta.env` 快照生成 `ImportMetaEnv`，只声明 `VITE_` 前缀的 key。
 *
 * 值同时用于**类型**：字符串字面量能收窄成具体字符串 —— 但只在值是字面量时。这里选择
 * 宽化到 `string` / `number` / `boolean`，因为 `.env` 里的值一律是字符串，写成裸字面量
 * 会让 `VITE_API_ENV` 被推成 `"local"` 这种过窄类型，赋值时报错。
 *
 * **Vite 内建（`MODE` / `DEV` / `PROD` / `BASE_URL` / `SSR`）刻意不声明。** 它们已经由
 * `vite/client`（`dist/vite/types/importMeta.d.ts`）声明，且那边**没有** `readonly` 修饰符 ——
 * 重复声明会报 `TS2687: All declarations of 'MODE' must have identical modifiers`（实测
 * soybean-admin-v3：`--skipLibCheck false` 下 8 条）。默认的 `skipLibCheck: true` 会把它吞掉，
 * 于是这个冲突只对关掉 skipLibCheck 的项目可见。不声明就不冲突，而且那 5 个 key 是 Vite 常量，
 * 没有漂移可言。
 *
 * 没有 `VITE_*` key 时返回 `undefined`，整个 `interface ImportMetaEnv` 块都不产出 —— 只留一个
 * `readonly [key: string]: …` 兜底索引签名会反向削弱 `vite/client` 的声明（`strictImportMetaEnv`
 * 关掉时它自带 `Record<string, any>`；我们那份索引签名把 `import.meta.env.X` 从 `any` 收窄成
 * `string | boolean | undefined`，看着更严，实则是把 Vite 的类型面往下拉）。
 */
function renderImportMetaEnv(importMetaEnv: Record<string, unknown>): string | undefined {
  const keys = Object.keys(importMetaEnv)
    .filter(key => key.startsWith('VITE_'))
    .sort();

  if (keys.length === 0) return undefined;

  const lines = keys.map(key => `  readonly ${key}: ${tsTypeOfLiteral(importMetaEnv[key])};`);
  return `interface ImportMetaEnv {\n${lines.join('\n')}\n}\n`;
}

/**
 * `renderEnvServerModule()` 生成的源码除了字段还会 `export function getSecret(key)`
 * （`packages/builder/src/env/types.ts`），但早先这里只声明字段 —— 用户按
 * `docs/contracts/env-v1.md` 的指引去 import 它，`tsc` 直接报 TS2305。
 *
 * 源码里还有一个 `__env`，它是生成代码的内部聚合对象，刻意**不**声明：声明了就等于
 * 把它纳入公开 API，而它有更好的具名导出可用。
 */
const ENV_SERVER_EXTRA_EXPORTS = [
  '  /** 读取未在 `env.schema` 里声明的变量（动态 / per-request 场景）。 */',
  '  export function getSecret(key: string): string | undefined;'
];

/**
 * 生成 `.ubean/env.d.ts`。
 *
 * 顶层**不能**出现 `export {}`：`ImportMetaEnv` 的声明必须留在全局作用域，一旦文件变成
 * 模块，TypeScript 的类型增强就失效（Vite 官方文档专门警告过这一点）。
 * `declare module '...'` 块本身不需要文件是模块。
 */
export async function generateEnvTypes(options: EnvTypesOptions): Promise<string> {
  const { outDir, fileName = ENV_TYPES_FILE_NAME, modules, importMetaEnv = {} } = options;

  const importMetaEnvBlock = renderImportMetaEnv(importMetaEnv);
  // 没有 `VITE_*` key 时整块省略。`interface ImportMeta { readonly env }` 留着无害
  // （与 `vite/client` 的同名声明逐字一致，合并即可），但它单独存在没有意义。
  const importMetaBlock = importMetaEnvBlock
    ? `\n${importMetaEnvBlock}interface ImportMeta {\n  readonly env: ImportMetaEnv;\n}\n`
    : '';

  const contents = `// Auto-generated by ubean from \`env.schema\` in ubean.config.ts — do not edit manually.
// Provides typed access to \`ubean:env/client\` / \`ubean:env/server\` and declares ImportMetaEnv.
/* eslint-disable */
/// <reference types="vite/client" />
${importMetaBlock}
${renderModuleTypes('ubean:env/client', modules.client)}${renderModuleTypes('ubean:env/server', modules.server, ENV_SERVER_EXTRA_EXPORTS)}`;

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, fileName);
  await writeFile(outPath, contents, 'utf8');
  return outPath;
}
