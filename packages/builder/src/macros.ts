import type { AstNode, ScriptBlock } from '@ubean/vue/vite';
import { extractScriptBlocks, parseScriptAst, statementCall } from '@ubean/vue/vite';

/**
 * 宏剥除(`definePage` 等编译期宏从产物中移除)。
 *
 * 实现方式:解析成 AST 后,按节点 `start` / `end` 区间**删除整条语句**。
 *
 * 此前是手写的括号平衡扫描 + 字符串切片,有两个静默故障面:
 *
 * 1. 提到宏的字符串/注释被一起切掉 —— `const doc = "definePage({...})"`
 *    变成 `const doc = ""`,`// 用法：definePage({...})` 变成 `// 用法：`;
 * 2. 正则字面量里的括号让括号计数错位(`const re = /\\(/g`)。
 *
 * 区间删除天然不会碰到这两种情况:拼接出的字符串里不存在 `definePage` 这个词,
 * 注释与正则都只存在于 AST 之外。
 *
 * 解析器来自 `@ubean/vue/vite`(基于 `vue/compiler-sfc` 的 `babelParse`),与
 * `definePage` 元数据提取共用同一份实现 —— 一处解析,两个消费者。
 */

const MACRO_NAMES = ['definePage'] as const;

/**
 * 判断一条**顶层语句**是否需要整条删除,返回其源码区间。
 *
 * 支持三种形状:
 * - `definePage({...});`            → `ExpressionStatement`
 * - `export default definePage({...});` → `ExportDefaultDeclaration`
 *   (`.reuse.ts` / `.meta.ts` 的写法;只删 `definePage(...)` 会留下悬空的
 *   `export default`,语法错误)
 * - 语句外的包裹(如 `if (x) definePage(...)`)不删 —— 那意味着宏写在条件分支里,
 *   属于用户错误,整条删掉会连带删掉条件本身。
 */
function macroStatementRange(statement: AstNode, macro: string): { start: number; end: number } | null {
  const hit = statementCall(statement, macro);
  if (!hit) return null;

  const start = statement.start;
  const end = statement.end;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return { start, end };
}

/**
 * 删除源码中给定区间,额外吞掉紧邻的空白与一个尾随分号。
 *
 * 之所以要吞分号:`ExpressionStatement` 的 `end` 在 babel 里**不含**尾随
 * 分号(它属于 `statement.start`..`expression.end` 之外的 extra 信息),
 * 不吞就会在产物里留下一个孤立的 `;`。
 */
function spliceOut(code: string, ranges: Array<{ start: number; end: number }>): string {
  // 倒序处理:前面的删除不动后面的偏移。
  const sorted = [...ranges].sort((a, b) => b.start - a.start);

  let result = code;
  for (const { start, end } of sorted) {
    let from = start;
    let to = end;

    // 吞掉行尾分号
    let cursor = to;
    while (cursor < result.length && (result[cursor] === ' ' || result[cursor] === '\t')) cursor++;
    if (result[cursor] === ';') to = cursor + 1;

    // 吞掉行首缩进(整条语句被删掉时,不该留下空白符)
    while (from > 0 && (result[from - 1] === ' ' || result[from - 1] === '\t')) from--;

    // 吞掉 `export default` 前面的空白(否则留下 `\n\n`)
    result = result.slice(0, from) + result.slice(to);
  }

  return result;
}

/** 在单个脚本块内剥除宏。 */
function stripMacrosFromCode(code: string, macros: readonly string[], fileName = 'page.ts'): string {
  if (macros.length === 0) return code;

  const ast = parseScriptAst(code, fileName);
  // 解析失败:保持原样。真正的语法错误由 plugin-vue / rolldown 报,不在这里换成一条误导性错误。
  if (!ast) return code;

  const body = (ast.program.body as AstNode[] | undefined) ?? [];
  const ranges: Array<{ start: number; end: number }> = [];

  for (const statement of body) {
    for (const macro of macros) {
      const range = macroStatementRange(statement, macro);
      if (range) ranges.push(range);
    }
  }

  return ranges.length > 0 ? spliceOut(code, ranges) : code;
}

export function stripMacros(code: string, macros: readonly string[] = MACRO_NAMES): string {
  return stripMacrosFromCode(code, macros);
}

export function transformMacros(code: string, id: string): string | null {
  const isInSrc = id.includes('/src/pages/') || id.includes('/src/routes/') || id.includes('/src/middleware/');
  if (!isInSrc) return null;

  if (id.endsWith('.vue')) {
    return transformVueMacros(code);
  }

  if (/\.(ts|js|mjs|mts|tsx|jsx)$/.test(id)) {
    return stripMacros(code);
  }

  return null;
}

/** 仅 `<script>`（非 setup）块——用于判断组件是否把默认导出交给普通脚本块。 */
const PLAIN_SCRIPT_RE = /<script(?![^>]*\bsetup\b)[^>]*>/;

/**
 * 剥离宏后为空的 `<script setup>` 块保留一个注释，避免整个块「消失」。
 *
 * `@vue/compiler-sfc` 把**只有空白**的 `<script setup>` 视为没有 setup 块；此时若组件另有一个
 * 普通 `<script>` 块，编译产物就只剩那个脚本块的内容 —— 没有 `export default`，而
 * `@vitejs/plugin-vue` 的主模块仍然按「有脚本块就有默认导出」去 import it，
 * 于是生产构建报 `MISSING_EXPORT "default"`（dev 下则是浏览器链接期报同样的错）。
 *
 * 这不是稀奇形状：页面约定就是「`loader` 写在 `<script>`，`definePage` 写在 `<script setup>`」，
 * 而 `definePage` 是宏、必被剥掉 —— 一个只有 loader 的页面正好落在坑里。
 */
const EMPTY_SETUP_KEEP_ALIVE = '\n// ubean: 宏已剥离，保留此块以维持组件的默认导出（见 builder/src/macros.ts）\n';

/**
 * SFC 宏剥除。
 *
 * 用 `extractScriptBlocks`(即 `@vue/compiler-sfc` 的 `parse`)拿到每个 `<script>`
 * 块在**原文件**中的精确区间,逐块删除后按偏移倒序回写 —— 而不是用
 * `/<script([^>]*)>([\s\S]*?)<\/script>/g` 猜标签边界(该正则在 `<script>` 出现在
 * 字符串或注释里时会错位)。
 */
function transformVueMacros(code: string): string {
  const blocks = extractScriptBlocks(code, 'page.vue');
  if (!blocks || blocks.length === 0) return code;

  const hasPlainScript = PLAIN_SCRIPT_RE.test(code);

  // 逐块计算替换文本,再按偏移倒序写回。
  const edits: Array<{ start: number; end: number; text: string }> = [];

  for (const block of blocks) {
    const stripped = stripMacrosFromCode(block.content, MACRO_NAMES, `page.${block.lang || 'ts'}`);
    const keepAlive = block.setup && hasPlainScript && !stripped.trim() ? EMPTY_SETUP_KEEP_ALIVE : stripped;
    if (keepAlive !== block.content) {
      edits.push({ start: block.start, end: block.end, text: keepAlive });
    }
  }

  if (edits.length === 0) return code;

  let result = code;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

export type { ScriptBlock };
