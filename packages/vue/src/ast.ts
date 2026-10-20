import { babelParse, parse as parseSfc } from 'vue/compiler-sfc';

/**
 * 构建期 AST 基础设施:`definePage(...)` 宏的参数提取与源码区间定位。
 *
 * 为什么用 AST 而不是字符串扫描(替换掉此前两份手写的括号平衡扫描器):
 *
 * 旧实现(`extract-page.ts` 的 `findBalancedCall` + 手写对象字面量解析器、
 * `builder/src/macros.ts` 的 `findBalancedCall` + `stripStatement`)有四个
 * **静默**故障面 —— 不报错、不告警,只是字段消失或源码被改坏:
 *
 * 1. 对象里出现 `//` 或 `/* *\/` 注释 → 整个对象解析成 `{}`;
 * 2. 遇到任何非字面量值(`...base`、`{ name }`、`layout: L`、`{} as any`、
 *    `` `/x/${expr}` ``)→ 从该键起**后面所有字段全部丢失**;
 * 3. 剥宏时把提到宏的字符串/注释一起切掉(`const doc = "definePage(...)"` → `const doc = ""`);
 * 4. 正则字面量里的括号让括号计数错位(`const re = /\(/g`)。
 *
 * 解析器来源:`vue/compiler-sfc`(即 `@vue/compiler-sfc`)。
 * - **零新增依赖** —— `@vue/compiler-sfc` 是 `vue` 自己的依赖,`vue` 是本包的直接依赖;
 * - `parse()` 精确给出各 `<script>` 块的 content 与区间(替掉 `attrs.includes('setup')` 正则);
 * - `babelParse` 原生支持 TS / TSX / `as const` / `satisfies`;
 * - 只在 `@ubean/vue/vite` 子路径可达,不进客户端产物。
 *
 * 不用 `vite` 的 `parseAst`:`vite` 是 peer 依赖(`^5 || ^6 || ^7`),而 5/6/7 的
 * `parseAst` 转发给 `rollup/parseAst`(acorn),实测 `definePage({ name: "C" as const })`
 * 直接抛 `Type assertion expressions can only be used in TypeScript files`。
 * 只有 vite-plus/rolldown 的 `parseAst` 才是 OXC 实现,对外发版不可靠。
 */

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** AST 节点 —— 只声明本模块用到的字段形状,避免把 `@babel/types` 全量类型拖进产物声明。 */
export interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

export interface AstFile {
  type: 'File';
  program: AstNode;
}

/** 字面量转换结果:要么成功拿到值,要么带原因失败(调用方据此 warn,绝不静默丢字段)。 */
export type LiteralResult = { ok: true; value: unknown } | { ok: false; reason: string };

/** SFC 里的一个 `<script>` 块(含纯 JS/TS 文件的整体)。 */
export interface ScriptBlock {
  /** 块内容(不含 `<script>` 标签)。 */
  content: string;
  /** 块内容在**原文件**中的起止偏移(SFC 时用于回写)。 */
  start: number;
  end: number;
  /** `ts` / `tsx` / `js` / `jsx` / 空(未标注)。 */
  lang: string;
  /** 是否为 `<script setup>`。 */
  setup: boolean;
}

// ---------------------------------------------------------------------------
// 脚本块提取
// ---------------------------------------------------------------------------

const SCRIPT_EXT_RE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/i;

/** babel 语言插件名(`ParserPlugin` 的字符串子集)。 */
type LangPlugin = 'typescript' | 'jsx';

/** 由文件名推断 babel 需要的语言插件。 */
function pluginsFor(fileName: string): LangPlugin[] {
  const ext = (/\.([a-z]+)$/i.exec(fileName)?.[1] || 'ts').toLowerCase();
  if (ext === 'tsx') return ['typescript', 'jsx'];
  if (ext === 'jsx') return ['jsx'];
  // `.ts` / `.vue` / 未知:按 TS 解析。TS 是 JS 的超集,纯 JS 也能解析。
  return ['typescript'];
}

/**
 * 取出源码里参与 `definePage` 提取的脚本块。
 *
 * - `.vue`:走 `@vue/compiler-sfc` 的 `parse()`,返回**所有** `<script>` 块。
 *   调用方按「优先 `<script setup>`」自行挑选(此前 `extractScriptContent`
 *   硬编码这个优先级,`scan-pages` 与 `builder` 各自抄了一份)。
 * - 其余脚本文件:整体作为一个块。
 * - 其他扩展名(如 `.md`):返回空数组。
 *
 * SFC 解析本身失败(模板语法错误等)时返回 `null`,调用方降级为「页面无元数据」。
 */
export function extractScriptBlocks(code: string, fileName = 'page.ts'): ScriptBlock[] | null {
  if (!fileName.endsWith('.vue')) {
    if (!SCRIPT_EXT_RE.test(fileName) && fileName !== 'page.ts') return [];
    return [{ content: code, start: 0, end: code.length, lang: langOf(fileName), setup: true }];
  }

  const { descriptor, errors } = parseSfc(code, { filename: fileName });
  if (errors && errors.length > 0) return null;

  const blocks: ScriptBlock[] = [];
  for (const [setup, block] of [
    [false, descriptor.script],
    [true, descriptor.scriptSetup]
  ] as const) {
    if (!block) continue;
    blocks.push({
      content: block.content,
      start: block.loc.start.offset,
      end: block.loc.end.offset,
      lang: block.lang || 'js',
      setup
    });
  }
  return blocks;
}

/** 按「`<script setup>` 优先,其次普通 `<script>`」挑选块(与历史行为一致)。 */
export function pickDefinePageBlock(blocks: ScriptBlock[]): ScriptBlock | null {
  return blocks.find(b => b.setup) ?? blocks[0] ?? null;
}

// ---------------------------------------------------------------------------
// 解析与遍历
// ---------------------------------------------------------------------------

/**
 * 解析脚本源码为 babel AST。
 *
 * 按文件扩展名选语言插件,失败时**按候选顺序重试** —— `parseScriptAst` 也接受
 * 只有源码、没有文件名的调用(测试与 `@ubean/scan` 的 `extractDefinePageFromCode`),
 * 此时无法从扩展名区分 TSX/JSX;退一步用「解析失败即换下一组插件」兜底,
 * 比让调用方猜扩展名可靠。
 *
 * 全部候选都失败返回 `null` —— 宏提取是**尽力而为**的构建期增强,一个真正语法
 * 错误的文件应当由 `@vitejs/plugin-vue` / rolldown 报出真正的错误,而不是在这里
 * 变成一条误导性的 "definePage 提取失败"。
 */
export function parseScriptAst(code: string, fileName = 'page.ts'): AstFile | null {
  const candidates: LangPlugin[][] = [pluginsFor(fileName), ['typescript', 'jsx'], ['typescript'], ['jsx']];
  const tried = new Set<string>();

  for (const plugins of candidates) {
    const key = plugins.join(',');
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      return babelParse(code, {
        sourceType: 'module',
        plugins,
        ranges: true
      }) as unknown as AstFile;
    } catch {
      // 试下一组插件
    }
  }

  return null;
}

/** 文件扩展名 → `<script>` 块的 lang 标注(仅用于诊断信息,不参与解析分支)。 */
function langOf(fileName: string): string {
  const ext = (/\.([a-z]+)$/i.exec(fileName)?.[1] || 'ts').toLowerCase();
  return ext === 'tsx' || ext === 'jsx' ? ext : ext.startsWith('t') ? 'ts' : 'js';
}

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'innerComments']);

/** 深度优先遍历(不依赖 `@babel/traverse`,保持零额外依赖)。 */
export function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  const n = node as AstNode;
  if (typeof n.type !== 'string') return;
  visit(n);
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = n[key];
    if (child && typeof child === 'object') walkAst(child, visit);
  }
}

/** 判断节点是不是对 `name` 的直接调用(`definePage(...)` 形态)。 */
function isCallTo(node: AstNode, name: string): boolean {
  const callee = node.callee as AstNode | undefined;
  return node.type === 'CallExpression' && callee?.type === 'Identifier' && callee.name === name;
}

/** 从语句节点中取出内部调用:支持 `definePage(...)` 与 `export default definePage(...)`。 */
export function statementCall(statement: AstNode, name: string): { call: AstNode; statement: AstNode } | null {
  if (statement.type === 'ExpressionStatement') {
    const expr = statement.expression as AstNode | undefined;
    if (expr && isCallTo(expr, name)) return { call: expr, statement };
    return null;
  }
  if (statement.type === 'ExportDefaultDeclaration') {
    const decl = statement.declaration as AstNode | undefined;
    if (decl && isCallTo(decl, name)) return { call: decl, statement };
  }
  return null;
}

/**
 * 在 AST 里找第一次 `name(...)` 调用。
 *
 * 优先匹配**顶层语句**(`definePage(...)` / `export default definePage(...)`),
 * 其次才做全树遍历 —— 顶层优先能保证 `if (import.meta.hot) definePage(...)`
 * 之类嵌套形状不会抢先于真正的声明。
 */
export function findMacroCall(ast: AstFile, name: string): AstNode | null {
  const body = ast.program.body;
  if (Array.isArray(body)) {
    for (const statement of body as AstNode[]) {
      const hit = statementCall(statement, name);
      if (hit) return hit.call;
    }
  }
  let found: AstNode | null = null;
  walkAst(ast.program, node => {
    if (found) return;
    if (isCallTo(node, name)) found = node;
  });
  return found;
}

// ---------------------------------------------------------------------------
// 字面量转换
// ---------------------------------------------------------------------------

/**
 * AST 节点类型 → 面向用户的原因描述。
 *
 * warn 文本直接出现在用户终端里,`CallExpression` / `SpreadElement` 这类 AST
 * 词汇不解释问题,而且会混进中文句子里。这里说人话 —— 读的人才知道「哦,我该把它
 * 写成字面量」。认不出的节点保留原始类型名,便于按 AST 词汇搜到本文件。
 */
function describeNodeType(type: string): string {
  switch (type) {
    case 'CallExpression':
    case 'NewExpression':
      return '函数调用';
    case 'Identifier':
    case 'MemberExpression':
      return '变量引用(构建期只能读字面量)';
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return '函数值';
    case 'TemplateLiteral':
      return '含插值的模板字符串';
    case 'SpreadElement':
      return '展开语法';
    case 'ConditionalExpression':
    case 'LogicalExpression':
    case 'BinaryExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
      return '运行时表达式';
    default:
      return `不支持的语法: ${type}`;
  }
}

/** `Property` 的键名;`computed` 键、SpreadElement 无法静态求值。 */
function propertyKey(prop: AstNode): string | null {
  if (prop.computed) return null;
  const key = prop.key as AstNode | undefined;
  if (!key) return null;
  if (key.type === 'Identifier') return key.name as string;
  if (key.type === 'StringLiteral' || key.type === 'NumericLiteral') return String(key.value);
  return null;
}

/**
 * 把 babel 表达式节点转成 JS 值 —— **白名单** 转换。
 *
 * 只认静态可求值的形状(字面量 / 无插值模板 / 数组 / 对象 / `as const` / `satisfies` /
 * 括号)。其余(标识符引用、spread、函数、带插值模板、任意表达式)一律返回
 * `{ ok: false, reason }` —— **不回退成标识符名字符串**,那是旧解析器
 * (`parseIdentifier` 把 `layout: L` 变成字符串 `"L"`)的行为,产生的假值比缺值更难查。
 */
export function literalToValue(node: AstNode): LiteralResult {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return { ok: true, value: node.value };

    case 'NullLiteral':
      return { ok: true, value: null };

    case 'TemplateLiteral': {
      const expressions = (node.expressions as AstNode[] | undefined) ?? [];
      if (expressions.length > 0) return { ok: false, reason: 'template literal with expressions' };
      const quasis = (node.quasis as AstNode[] | undefined) ?? [];
      const parts = quasis.map(q => {
        const value = q.value as { cooked?: string } | undefined;
        return value?.cooked ?? '';
      });
      return { ok: true, value: parts.join('') };
    }

    case 'UnaryExpression': {
      const arg = node.argument as AstNode | undefined;
      if (node.operator === '-' && arg?.type === 'NumericLiteral') return { ok: true, value: -(arg.value as number) };
      return { ok: false, reason: `unary expression (${String(node.operator)})` };
    }

    case 'ArrayExpression': {
      const elements = (node.elements as (AstNode | null)[] | undefined) ?? [];
      const out: unknown[] = [];
      for (const element of elements) {
        if (!element || element.type === 'SpreadElement') return { ok: false, reason: 'array spread / hole' };
        const value = literalToValue(element);
        if (!value.ok) return value;
        out.push(value.value);
      }
      return { ok: true, value: out };
    }

    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const prop of (node.properties as AstNode[] | undefined) ?? []) {
        if (prop.type !== 'ObjectProperty') return { ok: false, reason: `${prop.type} in object` };
        const key = propertyKey(prop);
        if (!key) return { ok: false, reason: 'computed / unsupported object key' };
        const value = literalToValue(prop.value as AstNode);
        if (!value.ok) return { ok: false, reason: `${key}: ${value.reason}` };
        out[key] = value.value;
      }
      return { ok: true, value: out };
    }

    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      return literalToValue(node.expression as AstNode);

    case 'ParenthesizedExpression':
      return literalToValue(node.expression as AstNode);

    default:
      return { ok: false, reason: describeNodeType(node.type) };
  }
}

/**
 * 取 `definePage(...)` 调用的对象字面量参数,逐字段做白名单转换。
 *
 * 与旧 `extractCallObject` 的关键差异:**不支持的字段只丢它自己**,
 * 其余字段照常返回;`dropped` 带出原因,调用方可以 warn。
 */
export interface ExtractMacroResult {
  parsed: Record<string, unknown>;
  /** 携带无法静态求值的字段(键名 + 原因),供调用方 warn。 */
  dropped: Array<{ key: string; reason: string }>;
  /** 调用在脚本块内的起始偏移(`call.start`),供调用方换算行号。 */
  start: number;
}

export function extractMacroArgument(call: AstNode): ExtractMacroResult | null {
  const args = (call.arguments as AstNode[] | undefined) ?? [];
  const first = args[0];
  const start = typeof call.start === 'number' ? call.start : 0;
  if (!first) return { parsed: {}, dropped: [], start };
  if (first.type !== 'ObjectExpression') return null;

  const parsed: Record<string, unknown> = {};
  const dropped: Array<{ key: string; reason: string }> = [];

  for (const prop of (first.properties as AstNode[] | undefined) ?? []) {
    if (prop.type !== 'ObjectProperty') {
      dropped.push({ key: '*', reason: describeNodeType(prop.type) });
      continue;
    }
    const key = propertyKey(prop);
    if (!key) {
      dropped.push({ key: '*', reason: '计算属性名' });
      continue;
    }
    const value = literalToValue(prop.value as AstNode);
    if (value.ok) {
      parsed[key] = value.value;
    } else {
      dropped.push({ key, reason: value.reason });
    }
  }

  return { parsed, dropped, start };
}
