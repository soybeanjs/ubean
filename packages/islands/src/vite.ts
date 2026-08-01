import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { Plugin, ResolvedConfig as ViteResolvedConfig } from 'vite';
import { legacyDirectiveToStrategy, strategyToLegacyDirective } from './directive';

export type ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only';

/**
 * `v-client.*` 指令属性名(Phase 4: 唯一支持的客户端 island 语法)。
 *
 * 旧的 `client:*` attribute 语法已移除 — 请迁移至 `v-client.*`,
 * 或使用运行时 `defineIsland()` 包装组件。
 */
const V_CLIENT_DIRECTIVES: string[] = [
  'v-client.load',
  'v-client.idle',
  'v-client.visible',
  'v-client.media',
  'v-client.only'
];

/**
 * Matches `v-client.*` (用于客户端 island 检测)。
 *
 * Phase 4 起 `client:*` legacy 语法不再支持,正则只匹配 `v-client.*`。
 */
const ANY_CLIENT_DIRECTIVE_RE = /\bv-client\.(?:load|idle|visible|media|only)\b/;

/** Matches `v-client.*` (用于快速跳过非 island SFC) */
const ANY_DIRECTIVE_RE = /\bv-client\.(?:load|idle|visible|media|only)\b/;

function isVueSfc(id: string): boolean {
  return /\.vue(?:\?.*)?$/.test(id) && !id.includes('&type=');
}

// ============== Server Components (Task 9.1 / 9.2): .server.vue / .client.vue ==============

/**
 * 判断 id 是否为 `.server.vue` 文件 (Task 9.1)。
 *
 * 仅检查路径部分(忽略 `?query`),避免 `?vue&type=template` 子查询误匹配。
 */
export function isServerComponentFile(id: string): boolean {
  return id.split('?')[0].endsWith('.server.vue');
}

/**
 * 判断 id 是否为 `.client.vue` 文件 (Task 9.2)。
 *
 * 仅检查路径部分(忽略 `?query`)。注意:从虚拟包装模块内部对真实文件的
 * import 不会被此函数拦截(由 `resolveId` 中的 importer 检查排除)。
 */
export function isClientComponentFile(id: string): boolean {
  return id.split('?')[0].endsWith('.client.vue');
}

/** `.server.vue` 在 client 构建中的通用虚拟 stub 模块 ID */
export const SERVER_COMPONENT_STUB_VIRTUAL_ID = 'virtual:ubean-server-component-stub';
const SERVER_COMPONENT_STUB_RESOLVED_ID = `\0${SERVER_COMPONENT_STUB_VIRTUAL_ID}`;

/** `.client.vue` 在 SSR 构建中的通用占位符虚拟模块 ID */
export const CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID = 'virtual:ubean-client-component-placeholder';
const CLIENT_COMPONENT_PLACEHOLDER_RESOLVED_ID = `\0${CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID}`;

/** `.client.vue` 在 client 构建中文件级包装虚拟模块 ID 前缀 */
const CLIENT_COMPONENT_WRAPPER_PREFIX = '\0virtual:ubean-client-component:';

/**
 * Task 9.3: 配对组件 (`Foo.vue` 同时存在 `.server.vue` + `.client.vue`) 在
 * SSR / client 构建中生成的虚拟包装模块 ID 前缀。
 *
 * 后缀格式: `${serverPath}|${clientPath}` (两个绝对路径用 `|` 分隔)。
 *
 * - SSR `load`: 仅 `import ServerComp from serverPath; export default ServerComp;`
 *   (导入真实 `.server.vue`,经现有规则解析为真实文件 + 模板包裹)
 * - client `load`: 同时导入 `.server.vue` (→ stub) 与 `.client.vue` (→ 真实文件,
 *   通过 importer 检查跳过 `defineClientComponent` 包装),调用 `definePairedComponent`
 *   实现初始渲染 ServerComp(stub) → onMounted 后切换为 ClientComp。
 */
const PAIRED_COMPONENT_WRAPPER_PREFIX = '\0virtual:ubean-paired-component:';

/** `|` 在文件路径中几乎不会出现,用作 `serverPath` 与 `clientPath` 的分隔符。 */
const PAIRED_PATH_SEPARATOR = '|';

/**
 * 将 `.server.vue` SFC 的 `<template>` 内容包裹在 `<ubean-server-only v-once>` 中。
 *
 * SSR 渲染输出 `<ubean-server-only v-once>真实内容</ubean-server-only>`,
 * 客户端 stub 渲染 `<ubean-server-only></ubean-server-only>` (无子节点)。
 * `v-once` 标记内容为静态,Vue 水合时保留 SSR HTML 不清除。
 *
 * 仅在 SSR 上下文运行(client 构建中 `.server.vue` 被 `resolveId` 重定向到 stub,
 * 真实文件不会被加载/转换)。
 */
export function wrapServerComponentTemplate(code: string): string | null {
  const tpl = extractTemplateBlock(code);
  if (!tpl) return null;
  // 已包裹则跳过(幂等)
  if (tpl.content.trim().startsWith('<ubean-server-only')) return null;
  const newContent = `<ubean-server-only v-once>${tpl.content}</ubean-server-only>`;
  return `${code.slice(0, tpl.start)}<template${tpl.attrs}>${newContent}</template>${code.slice(tpl.end)}`;
}

/**
 * 判断 id 是否为 SFC 主模块（非 `?vue&type=...` 子查询）。
 *
 * 收集 island 组件时需要同时访问 `<script setup>` 与 `<template>` 块，
 * 因此只对 SFC 主模块运行；模板子查询只含模板内容，无法解析 import。
 */
function isMainVueSfc(id: string): boolean {
  return id.split('?')[0].endsWith('.vue');
}

// ============== Islands 自动注册：组件收集与 registry 生成 ==============

/**
 * 一个 island 组件的注册条目。
 *
 * - `name`：模板中使用的标签名（如 `<IslandCounter client:load />` 中的 `IslandCounter`）
 * - `importPath`：组件文件的绝对路径或 bare specifier（来自 `<script setup>` 的 import）
 * - `sourceFile`：发现该 island 的源文件绝对路径，用于调试与 HMR 失效
 */
export interface IslandComponentEntry {
  name: string;
  importPath: string;
  sourceFile: string;
}

/** Plugin 内部的 island 组件收集表：组件名 → 条目 */
export type IslandComponentMap = Map<string, IslandComponentEntry>;

/**
 * 从 `<script setup>` / `<script>` 内容中解析 default import 与 `default as` 别名，
 * 建立 { 局部名 → import 路径 } 映射。
 *
 * 仅处理静态 import 语句；动态 import、re-export 不在识别范围内
 * （这类用法无法静态分析 → 由运行时 `getComponent` 兜底或用户手动注册）。
 *
 * 支持形式：
 *   import Foo from './Foo.vue'
 *   import Foo from "some-lib"
 *   import Foo, { bar } from './Foo.vue'
 *   import { default as Foo, bar } from './Foo.vue'
 *   import { default as Foo } from './Foo.vue'
 */
export function parseScriptImports(scriptContent: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!scriptContent) return map;

  // 1) default import: import Foo from '...'
  //    也匹配 `import Foo, { bar } from '...'` 与 `import Foo, * as ns from '...'`
  const defaultRe =
    /import\s+([A-Za-z_$][\w$]*)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*))?\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = defaultRe.exec(scriptContent)) !== null) {
    const localName = m[1];
    const importPath = m[2];
    if (!map.has(localName)) map.set(localName, importPath);
  }

  // 2) named default-as: import { default as Foo } from '...'
  //    也匹配 `import { bar, default as Foo } from '...'`
  const namedDefaultRe = /import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = namedDefaultRe.exec(scriptContent)) !== null) {
    const clause = m[1];
    const importPath = m[2];
    // 在 named clause 中查找 `default as Foo`
    const asMatch = clause.match(/\bdefault\s+as\s+([A-Za-z_$][\w$]*)/);
    if (asMatch) {
      const localName = asMatch[1];
      if (!map.has(localName)) map.set(localName, importPath);
    }
  }

  return map;
}

/* -------------------------------------------------------------------------- */
/* Task 9.4: defineServerIsland 调用注入组件路径                                */
/* -------------------------------------------------------------------------- */

const DEFINE_SERVER_ISLAND_RE = /\bdefineServerIsland\s*\(/g;

/**
 * 预扫描代码,返回所有"非代码"区间 `[start, end)`:注释(块/行)和字符串字面量。
 *
 * 用于跳过注释/字符串内的 `defineServerIsland(` 匹配(如 JSDoc 示例或说明性字符串)。
 * 复用 `@ubean/actions` Vite 插件的成熟模式 (见 lessons #P-lessons)。
 */
function findNonCodeRanges(code: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const len = code.length;
  let i = 0;

  while (i < len) {
    // 块注释
    if (code[i] === '/' && code[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      ranges.push([start, Math.min(i, len)]);
      continue;
    }
    // 行注释
    if (code[i] === '/' && code[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < len && code[i] !== '\n') i++;
      ranges.push([start, i]);
      continue;
    }
    // 字符串字面量
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const start = i;
      const quote = code[i];
      i++;
      while (i < len) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && code[i] === '$' && code[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < len && depth > 0) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') depth--;
            i++;
          }
          continue;
        }
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      ranges.push([start, i]);
      continue;
    }
    i++;
  }
  return ranges;
}

function isInsideRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}

/**
 * 从 `startIdx` 开始查找匹配的闭合括号(支持字符串/模板字面量/注释跳过)。
 * `startIdx` 应指向 `(` 后的第一个字符。返回 `)` 的索引,或 `null`。
 */
function findBalanced(code: string, openChar: string, closeChar: string, startIdx: number): number | null {
  let depth = 1;
  let i = startIdx;
  let inString: string | null = null;
  let escaped = false;
  let inTemplateExpr = 0;

  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (escaped) { escaped = false; i++; continue; }
    if (ch === '\\') { escaped = true; i++; continue; }
    if (inString) {
      if (inString === '`' && ch === '$' && code[i + 1] === '{') { inTemplateExpr++; i += 2; continue; }
      if (inString === '`' && ch === '}' && inTemplateExpr > 0) { inTemplateExpr--; i++; continue; }
      if (ch === inString) inString = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i++; continue; }
    if (ch === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2; continue;
    }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return null;
}

/**
 * 在 `[argStart, end)` 区间内查找顶层逗号(深度 0)位置数组。
 */
function findTopLevelCommas(code: string, argStart: number, end: number): number[] {
  const commas: number[] = [];
  let depth = 0;
  let i = argStart;
  let inString: string | null = null;
  let escaped = false;
  let inTemplateExpr = 0;

  while (i < end) {
    const ch = code[i];
    if (escaped) { escaped = false; i++; continue; }
    if (ch === '\\') { escaped = true; i++; continue; }
    if (inString) {
      if (inString === '`' && ch === '$' && code[i + 1] === '{') { inTemplateExpr++; i += 2; continue; }
      if (inString === '`' && ch === '}' && inTemplateExpr > 0) { inTemplateExpr--; i++; continue; }
      if (ch === inString) inString = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; i++; continue; }
    if (ch === '/' && code[i + 1] === '/') { while (i < end && code[i] !== '\n') i++; continue; }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < end && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2; continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) commas.push(i);
    i++;
  }
  return commas;
}

interface DefineServerIslandCall {
  /** `defineServerIsland` 标识符起始位置。 */
  start: number;
  /** `(` 后第一个字符位置(参数区起点)。 */
  argStart: number;
  /** 匹配的 `)` 位置。 */
  end: number;
  /** 顶层参数文本数组(已 trim)。 */
  args: string[];
}

/**
 * 提取源码中所有 `defineServerIsland(...)` 调用信息。
 *
 * 跳过注释/字符串内的匹配(如 JSDoc 示例)和函数声明(`function defineServerIsland(`)。
 */
function findDefineServerIslandCalls(code: string): DefineServerIslandCall[] {
  const results: DefineServerIslandCall[] = [];
  const nonCodeRanges = findNonCodeRanges(code);

  let m: RegExpExecArray | null;
  DEFINE_SERVER_ISLAND_RE.lastIndex = 0;
  while ((m = DEFINE_SERVER_ISLAND_RE.exec(code)) !== null) {
    const start = m.index;
    if (isInsideRanges(start, nonCodeRanges)) continue;

    // 跳过函数声明: `function defineServerIsland(`
    const before = code.slice(0, start);
    if (/\bfunction\s+$/.test(before)) continue;

    const argStart = start + m[0].length;
    const end = findBalanced(code, '(', ')', argStart);
    if (end === null) continue;

    const commas = findTopLevelCommas(code, argStart, end);
    const argRanges: Array<[number, number]> = [];
    let prev = argStart;
    for (const comma of commas) {
      argRanges.push([prev, comma]);
      prev = comma + 1;
    }
    argRanges.push([prev, end]);

    const args = argRanges.map(([s, e]) => code.slice(s, e).trim());
    results.push({ start, argStart, end, args });
  }
  return results;
}

/**
 * 提取 SFC 中 `<script setup>` 或 `<script>` 块的内容及其位置区间。
 *
 * 返回 `{ content, contentStart, contentEnd }` 或 `null`。`contentStart`/`contentEnd`
 * 是内容在原 code 中的起止位置(不含开闭标签)。
 */
function extractScriptBlockWithPositions(
  code: string
): { content: string; contentStart: number; contentEnd: number } | null {
  const setupOpenRe = /<script\s+[^>]*setup[^>]*>/;
  const setupMatch = code.match(setupOpenRe);
  if (setupMatch && setupMatch.index !== undefined) {
    const openTagEnd = setupMatch.index + setupMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) {
      return { content: code.slice(openTagEnd, closeIdx), contentStart: openTagEnd, contentEnd: closeIdx };
    }
  }

  const plainOpenRe = /<script(?!\s[^>]*setup)[^>]*>/;
  const plainMatch = code.match(plainOpenRe);
  if (plainMatch && plainMatch.index !== undefined) {
    const openTagEnd = plainMatch.index + plainMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) {
      return { content: code.slice(openTagEnd, closeIdx), contentStart: openTagEnd, contentEnd: closeIdx };
    }
  }
  return null;
}

/**
 * Task 9.4: 扫描代码中的 `defineServerIsland(Identifier, { ... rerenderOnPropsChange: true ... })`
 * 调用,解析 `Identifier` 的 import 路径,将其作为第 3 个参数注入:
 *
 * ```ts
 * defineServerIsland(Comp, { rerenderOnPropsChange: true }, "/abs/path.server.vue")
 * ```
 *
 * ## 工作机制
 *
 * 1. 提取 `<script>` 块内容(`.vue` 文件)或整个代码(`.ts` 文件)
 * 2. 查找所有 `defineServerIsland(...)` 调用,跳过注释/字符串/函数声明
 * 3. 对每个调用:
 *    - 参数 < 2 → 跳过(至少需要 Component + options)
 *    - 参数 ≥ 3 → 跳过(已有路径,幂等)
 *    - options 对象不含 `rerenderOnPropsChange: true` → 跳过(非 props 重渲染场景)
 *    - 通过 `parseScriptImports` 解析 identifier 的 import 路径,相对路径解析为绝对路径
 *    - 在 `)` 前注入 `, "/abs/path"`
 *
 * ## 幂等性
 *
 * 已注入的调用(参数 ≥ 3)不会被再次处理。
 *
 * @param code 完整源码(`.vue` SFC 或 `.ts` 文件)
 * @param sourceFile 源文件绝对路径(用于解析相对 import)
 * @returns 修改后的源码,或 `null` 表示无修改
 */
export function injectServerComponentPath(code: string, sourceFile: string): string | null {
  const isVue = sourceFile.endsWith('.vue');

  if (isVue) {
    const scriptBlock = extractScriptBlockWithPositions(code);
    if (!scriptBlock) return null;
    const newContent = _doInject(scriptBlock.content, sourceFile);
    if (newContent === null) return null;
    return code.slice(0, scriptBlock.contentStart) + newContent + code.slice(scriptBlock.contentEnd);
  }

  return _doInject(code, sourceFile);
}

function _doInject(scriptContent: string, sourceFile: string): string | null {
  const calls = findDefineServerIslandCalls(scriptContent);
  if (calls.length === 0) return null;

  const importMap = parseScriptImports(scriptContent);

  let result = scriptContent;
  let changed = false;

  // 从后向前处理以保留索引
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    if (call.args.length < 2) continue;
    if (call.args.length >= 3) continue; // 幂等:已有第 3 参数

    const optionsText = call.args[1];
    if (!optionsText.startsWith('{')) continue;
    // 简单检测 `rerenderOnPropsChange: true` (顶层或嵌套均可,近似处理)
    if (!/\brerenderOnPropsChange\s*:\s*true\b/.test(optionsText)) continue;

    const identifier = call.args[0].trim();
    const importPath = importMap.get(identifier);
    if (!importPath) continue;

    const absolutePath = resolveIslandImportPath(importPath, sourceFile);

    // 在 `)` 前注入 `, "/abs/path"`
    const insertPos = call.end;
    const insertText = `, ${JSON.stringify(absolutePath)}`;
    result = result.slice(0, insertPos) + insertText + result.slice(insertPos);
    changed = true;
  }

  return changed ? result : null;
}

/**
 * Find the `v-client.*` directive on a tag.
 *
 * Returns the legacy directive name (e.g. `'client:load'`) for internal
 * consistency with `<ubean-island data-directive="...">` format consumed by
 * `hydrateIslands()`, or `null` if no client directive is present.
 *
 * Also returns the media query value for `v-client.media`.
 *
 * Phase 4: 旧的 `client:*` attribute 语法已移除,仅识别 `v-client.*`。
 */
function findClientDirectiveOnTag(
  attrs: Map<string, string | true>
): { directive: ClientDirective; mediaQuery?: string } | null {
  for (const vcd of V_CLIENT_DIRECTIVES) {
    if (attrs.has(vcd)) {
      const strategy = legacyDirectiveToStrategy(vcd) || 'load';
      const legacyName = strategyToLegacyDirective(strategy) as ClientDirective;
      const mediaQuery = strategy === 'media' ? extractMediaQuery(attrs.get(vcd)) : undefined;
      return { directive: legacyName, mediaQuery };
    }
  }

  return null;
}

/**
 * Extract a media query string from a directive value.
 *
 * For `v-client.media="'(max-width: 768px)'"` the value is a Vue expression
 * (string literal), so we strip surrounding quotes.
 */
function extractMediaQuery(raw: string | true | undefined): string | undefined {
  if (raw === undefined || raw === true) return undefined;
  // Strip surrounding quotes from Vue expression (e.g. "'(max-width: 768px)" → "(max-width: 768px)")
  let value = String(raw).trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  return value || undefined;
}

/**
 * 扫描模板内容，返回所有带 `v-client.*` 指令的组件标签名集合。
 *
 * 复用 `findTagAt` 的标签解析逻辑，确保与 `transformTemplate` 的识别规则一致
 * （仅匹配首字母大写的组件标签）。
 *
 * 与 `transformTemplate` 对称：非 island 标签会递归扫描其 innerHTML，
 * island 标签不递归（其子内容属于该 island 的 SSR 输出，不作为独立 island）。
 *
 * Phase 4: 仅识别 `v-client.*`(旧的 `client:*` 语法已移除)。
 */
export function scanIslandDirectiveNames(template: string): Set<string> {
  const names = new Set<string>();
  scan(template);
  return names;

  function scan(t: string): void {
    let pos = 0;
    while (pos < t.length) {
      const lt = t.indexOf('<', pos);
      if (lt === -1) break;
      if (t[lt + 1] === '/' || t[lt + 1] === '!' || t[lt + 1] === '?') {
        pos = lt + 1;
        continue;
      }
      const tag = findTagAt(t, lt);
      if (!tag) {
        pos = lt + 1;
        continue;
      }
      const hasDirective = findClientDirectiveOnTag(tag.attrs) !== null;
      if (hasDirective) {
        names.add(tag.tagName);
      }
      // 递归扫描 innerHTML 以发现嵌套的 island（无论当前标签是否为 island）。
      // 即使嵌套在另一个 island 内的组件在 SSR 时不会被单独转换为 <ubean-island>,
      // 仍需将其收集到 registry 中,确保组件可被解析（如作为 slot 内容渲染时）。
      // 过度收集（注册未实际使用的组件）只会带来微量 bundle 开销,
      // 而遗漏收集会导致 island 静默不水合。
      if (!tag.selfClosing) {
        scan(tag.innerHTML);
      }
      pos = tag.end;
    }
  }
}

/**
 * 将相对 import 路径解析为绝对路径；bare specifier（如 `vue`、`some-lib`）原样返回。
 */
export function resolveIslandImportPath(importPath: string, sourceFile: string): string {
  if (importPath.startsWith('.')) {
    return resolve(dirname(sourceFile), importPath);
  }
  return importPath;
}

/**
 * 从 Vue SFC 源码中收集 island 组件信息。
 *
 * 步骤：
 * 1. 提取 `<script setup>` / `<script>` 内容
 * 2. 解析 import 语句，建立 { 局部名 → import 路径 } 映射
 * 3. 扫描模板中的 `<Comp v-client.* />` 指令，得到组件名集合
 * 4. 交集：既在 import 映射中、又在 island 指令集合中的组件
 * 5. 将相对 import 路径解析为绝对路径
 *
 * 对未在 import 映射中的 island 组件（如全局注册、动态 import、defineAsyncComponent），
 * 输出警告，提示用户手动注册。
 */
export function collectIslandComponents(code: string, sourceFile: string): IslandComponentEntry[] {
  const scriptContent = extractScriptBlock(code);
  const templateContent = extractTemplateBlock(code)?.content ?? '';

  if (!templateContent) return [];
  if (!ANY_CLIENT_DIRECTIVE_RE.test(templateContent)) return [];

  const importMap = parseScriptImports(scriptContent);
  const islandNames = scanIslandDirectiveNames(templateContent);

  const entries: IslandComponentEntry[] = [];
  for (const name of islandNames) {
    const importPath = importMap.get(name);
    if (!importPath) {
      // 组件可能是全局注册、来自 unplugin-vue-components 自动导入、或 defineAsyncComponent 包装
      // 这类用法无法静态分析 → 记录警告，留待用户手动注册或通过 getComponent 兜底
      // eslint-disable-next-line no-console
      console.warn(
        `[ubean:islands] Component "${name}" used with v-client.* directive in ${sourceFile} has no corresponding static import in <script setup>. ` +
          `It will not be auto-registered. Add it manually via hydrateIslands({ components: { ${name}: YourComp } }) or pass a getComponent() resolver.`
      );
      continue;
    }
    const absolutePath = resolveIslandImportPath(importPath, sourceFile);
    entries.push({ name, importPath: absolutePath, sourceFile });
  }
  return entries;
}

/**
 * 提取 SFC 中 `<script setup>` 或 `<script>` 块的内容。
 *
 * 优先返回 `<script setup>`；若不存在则返回普通 `<script>`；都没有则返回空字符串。
 * 与 `extractTemplateBlock` 对称，使用简单字符串匹配避免引入 SFC 编译器依赖。
 */
function extractScriptBlock(code: string): string {
  // 优先 <script setup>
  const setupOpenRe = /<script\s+[^>]*setup[^>]*>/;
  const setupMatch = code.match(setupOpenRe);
  if (setupMatch && setupMatch.index !== undefined) {
    const openTagEnd = setupMatch.index + setupMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) return code.slice(openTagEnd, closeIdx);
  }

  // 退回普通 <script>（排除带 setup 的，已处理过）
  const plainOpenRe = /<script(?!\s[^>]*setup)[^>]*>/;
  const plainMatch = code.match(plainOpenRe);
  if (plainMatch && plainMatch.index !== undefined) {
    const openTagEnd = plainMatch.index + plainMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) return code.slice(openTagEnd, closeIdx);
  }

  return '';
}

/**
 * 生成 `virtual:ubean-islands-registry` 模块内容。
 *
 * 输出示例：
 * ```ts
 * import __island_0 from '/src/components/IslandCounter.vue';
 * import __island_1 from '/src/components/IslandMedia.vue';
 *
 * export const islands = {
 *   "IslandCounter": __island_0,
 *   "IslandMedia": __island_1
 * };
 * ```
 *
 * 当 map 为空时，返回 `export const islands = {};` 保证下游 import 不会因模块缺失而报错。
 */
export function generateRegistryModule(components: IslandComponentMap): string {
  if (components.size === 0) {
    return 'export const islands = {};';
  }

  const imports: string[] = [];
  const entries: string[] = [];

  let idx = 0;
  for (const [name, entry] of components) {
    const varName = `__island_${idx++}`;
    imports.push(`import ${varName} from ${JSON.stringify(entry.importPath)};`);
    entries.push(`  ${JSON.stringify(name)}: ${varName},`);
  }

  return [...imports, '', 'export const islands = {', ...entries, '};'].join('\n');
}

/**
 * 提取 SFC 中顶层的 `<template>` 块。
 *
 * 处理嵌套 `<template>` 标签:Vue SFC 的 `<template>` 块内部可能包含
 * `<template #slot>` 等嵌套 template 标签(如作用域插槽、`v-if`/`v-for`
 * 包装)。简单 `indexOf('</template>')` 会错误匹配到嵌套关闭标签,因此用
 * 深度计数找到匹配的顶层关闭标签。
 *
 * 仅匹配小写 `<template`(SFC 块标签),不会误匹配 `<Template>` 组件。
 */
function extractTemplateBlock(
  code: string
): { start: number; end: number; content: string; attrs: string; openTagEnd: number } | null {
  const openMatch = code.match(/<template([^>]*)>/);
  if (!openMatch) return null;
  const openTagEnd = openMatch.index! + openMatch[0].length;
  const closeTag = '</template>';
  const openRe = /<template[\s>]/g;
  const closeRe = /<\/template>/g;
  openRe.lastIndex = openTagEnd;
  closeRe.lastIndex = openTagEnd;
  let depth = 1;
  let closeIdx = -1;
  while (depth > 0) {
    const nextOpen = openRe.exec(code);
    const nextClose = closeRe.exec(code);
    if (!nextClose) return null; // unbalanced — no closing tag
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        closeIdx = nextClose.index;
        break;
      }
      openRe.lastIndex = nextClose.index + nextClose[0].length;
    }
  }
  if (closeIdx === -1) return null;
  return {
    start: openMatch.index!,
    end: closeIdx + closeTag.length,
    content: code.slice(openTagEnd, closeIdx),
    attrs: openMatch[1] || '',
    openTagEnd
  };
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

interface TagMatch {
  tagName: string;
  fullOpenTag: string;
  selfClosing: boolean;
  attrs: Map<string, string | true>;
  attrsStr: string;
  start: number;
  openTagEnd: number;
  end: number;
  innerHTML: string;
}

function findTagAt(template: string, pos: number): TagMatch | null {
  const lt = template.indexOf('<', pos);
  if (lt === -1 || lt !== pos) return null;
  if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') return null;

  const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
  if (!nameMatch) return null;
  const tagName = nameMatch[1];

  const gt = findClosingAngleBracket(template, lt + 1 + tagName.length);
  if (gt === -1) return null;

  const openTagContent = template.slice(lt, gt + 1);
  const selfClosing = template[gt - 1] === '/';
  const attrsStr = template.slice(lt + 1 + tagName.length, selfClosing ? gt - 1 : gt).trim();
  const attrs = parseAttrs(attrsStr);
  const openTagEnd = gt + 1;

  let end = openTagEnd;
  let innerHTML = '';

  if (!selfClosing) {
    const closeTag = `</${tagName}>`;
    const closePos = findMatchingClose(template, lt, tagName);
    if (closePos === -1) return null;
    innerHTML = template.slice(openTagEnd, closePos);
    end = closePos + closeTag.length;
  }

  return {
    tagName,
    fullOpenTag: openTagContent,
    selfClosing,
    attrs,
    attrsStr,
    start: lt,
    openTagEnd,
    end,
    innerHTML
  };
}

function findClosingAngleBracket(str: string, start: number): number {
  let inQuote: string | null = null;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      else if (ch === '>') return i;
    }
  }
  return -1;
}

function findMatchingClose(template: string, openLt: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}[\\s/>]`, 'g');
  const closeRe = new RegExp(`</${tagName}>`, 'g');
  openRe.lastIndex = openLt + 1;
  closeRe.lastIndex = openLt + 1;
  let depth = 1;

  while (depth > 0) {
    const nextOpen = openRe.exec(template);
    const nextClose = closeRe.exec(template);

    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + tagName.length + 2;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      openRe.lastIndex = nextClose.index + tagName.length + 3;
    }
  }
  return -1;
}

function parseAttrs(str: string): Map<string, string | true> {
  const map = new Map<string, string | true>();
  const re = /(?:^|\s)([:@a-zA-Z_][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\{[^}]*\}|[^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const name = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : true;
    map.set(name, val);
  }
  return map;
}

function collectStaticProps(attrs: Map<string, string | true>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, val] of attrs) {
    // Exclude `v-client.*` directives — must check before the
    // generic `v-` exclusion below, since `v-client.*` is a `v-` attribute
    if (key.startsWith('v-client.')) continue;
    if (key.startsWith('v-') || key.startsWith('@') || key.startsWith(':')) continue;
    if (key === 'key' || key === 'ref') continue;
    if (val === true) {
      props[key] = true;
    } else {
      props[key] = val;
    }
  }
  return props;
}

function transformTemplate(template: string, islandCounter: { count: number }, filePath: string): string {
  let out = '';
  let pos = 0;

  while (pos < template.length) {
    const lt = template.indexOf('<', pos);
    if (lt === -1) {
      out += template.slice(pos);
      break;
    }
    out += template.slice(pos, lt);

    if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
    if (!nameMatch) {
      const gt = findClosingAngleBracket(template, lt + 1);
      if (gt === -1) {
        out += template.slice(lt);
        break;
      }
      out += template.slice(lt, gt + 1);
      pos = gt + 1;
      continue;
    }

    const tag = findTagAt(template, lt);
    if (!tag) {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const clientDirectiveInfo = findClientDirectiveOnTag(tag.attrs);
    if (!clientDirectiveInfo) {
      const inner = tag.selfClosing ? '' : transformTemplate(tag.innerHTML, islandCounter, filePath);
      out += tag.fullOpenTag;
      out += inner;
      if (!tag.selfClosing) out += `</${tag.tagName}>`;
      pos = tag.end;
      continue;
    }

    const { directive, mediaQuery } = clientDirectiveInfo;
    islandCounter.count++;
    const islandId = `island-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}-${islandCounter.count}`;

    let mediaStr = '';
    if (directive === 'client:media' && mediaQuery) {
      mediaStr = ` data-media="${escapeAttr(mediaQuery)}"`;
    }

    // Collect static props, excluding `v-client.*` directive attributes
    const props = collectStaticProps(tag.attrs);
    const propsJson = escapeAttr(JSON.stringify(props));

    // v-once: prevent Vue from patching <ubean-island> children during re-render.
    // Without v-once, when an async page component resolves and Vue re-renders,
    // it would clear the hydrated island content (since the vDOM has no children
    // for the custom element). v-once makes Vue render the element once and skip
    // it in all subsequent patches, preserving the hydrated island content.
    out += `<ubean-island v-once data-island-id="${islandId}" data-component="${tag.tagName}" data-directive="${directive}" data-props="${propsJson}"${mediaStr}>`;
    out += tag.selfClosing ? '' : tag.innerHTML;
    out += `</ubean-island>`;

    pos = tag.end;
  }

  return out;
}

export function transformVueSfcIslands(code: string, filePath: string): { code: string; islandCount: number } {
  const tpl = extractTemplateBlock(code);
  if (!tpl) return { code, islandCount: 0 };
  if (!ANY_DIRECTIVE_RE.test(tpl.content)) return { code, islandCount: 0 };

  const counter = { count: 0 };
  const newContent = transformTemplate(tpl.content, counter, filePath);
  const result = `${code.slice(0, tpl.start)}<template${tpl.attrs}>${newContent}</template>${code.slice(tpl.end)}`;
  return { code: result, islandCount: counter.count };
}

export interface UbeanIslandsPluginOptions {
  enabled?: boolean;
}

/** virtual:ubean-islands-registry 的虚拟模块 ID（遵循 AGENTS.md §8 教训 #7：用 `virtual:ubean-` 前缀） */
export const ISLANDS_REGISTRY_VIRTUAL_ID = 'virtual:ubean-islands-registry';
/** Vite 内部解析后的虚拟模块 ID（`\0` 前缀防止其他插件处理） */
const ISLANDS_REGISTRY_RESOLVED_ID = `\0${ISLANDS_REGISTRY_VIRTUAL_ID}`;

export function ubeanIslandsPlugin(_options: UbeanIslandsPluginOptions = {}): Plugin {
  let viteConfig: ViteResolvedConfig;
  let enabled = true;
  // dev 模式下的 ViteDevServer 实例（在 configureServer 中捕获）
  let devServer: import('vite').ViteDevServer | undefined;

  // island 组件收集表：组件名 → 条目（首次发现的 import 路径为准）
  const islandComponents: IslandComponentMap = new Map();
  // 源文件 → 该文件贡献的组件名集合（用于 HMR 重新扫描时清理过期条目）
  const entriesByFile = new Map<string, Set<string>>();
  // 已转换过的 SFC 文件集合（用于区分「首次加载」与「HMR 更新」，避免首次加载触发 full-reload）
  const transformedFiles = new Set<string>();

  /**
   * 用某次扫描结果更新 island 组件注册表。
   *
   * - 先清理该源文件之前贡献、现已不再使用的组件条目（若其他文件未引用）
   * - 再添加新条目；同名组件若 import 路径不同 → 警告（首次发现的路径优先）
   * - 返回 registry 是否发生变化（用于决定是否触发 HMR）
   */
  function updateRegistry(entries: IslandComponentEntry[], sourceFile: string): boolean {
    let changed = false;

    const oldNames = entriesByFile.get(sourceFile) ?? new Set<string>();
    const newNames = new Set(entries.map(e => e.name));

    // 1) 仅清理该源文件之前贡献、且新扫描结果中已不再使用的组件条目。
    //    保留新旧交集的条目,避免「先删后加」导致每次重新转换都误报 changed=true,
    //    进而触发无限 full-reload。
    for (const name of oldNames) {
      if (newNames.has(name)) continue; // 仍在本文件使用,保留
      // 检查其他文件是否还在使用该组件
      let stillUsed = false;
      for (const [otherFile, names] of entriesByFile) {
        if (otherFile === sourceFile) continue;
        if (names.has(name)) {
          stillUsed = true;
          break;
        }
      }
      if (!stillUsed && islandComponents.has(name)) {
        islandComponents.delete(name);
        changed = true;
      }
    }

    // 2) 添加新条目(仅添加 registry 中不存在的)
    for (const entry of entries) {
      const existing = islandComponents.get(entry.name);
      if (!existing) {
        islandComponents.set(entry.name, entry);
        changed = true;
      } else if (existing.importPath !== entry.importPath) {
        // 同名组件在不同文件 import 路径不同 → 警告，首次发现的路径优先
        // eslint-disable-next-line no-console
        console.warn(
          `[ubean:islands] Component "${entry.name}" is imported from different paths:\n` +
            `  existing: "${existing.importPath}" (in ${existing.sourceFile})\n` +
            `  new:      "${entry.importPath}" (in ${sourceFile})\n` +
            `Using the first-seen path. To fix, ensure all imports use the same path.`
        );
      }
    }

    entriesByFile.set(sourceFile, newNames);
    return changed;
  }

  return {
    name: 'ubean:islands',
    enforce: 'pre',

    configResolved(config) {
      viteConfig = config;
      enabled = _options.enabled !== false;
    },

    configureServer(server) {
      devServer = server;
    },

    async resolveId(id, importer, options) {
      // Islands registry 虚拟模块
      if (id === ISLANDS_REGISTRY_VIRTUAL_ID) return ISLANDS_REGISTRY_RESOLVED_ID;

      if (!enabled) return undefined;

      // --- Task 9.1: .server.vue → client 构建重定向到通用 stub ---
      // SSR 构建时正常解析到真实文件 (return undefined 走默认解析)
      if (!options?.ssr && isServerComponentFile(id)) {
        return SERVER_COMPONENT_STUB_RESOLVED_ID;
      }

      // --- Task 9.2: .client.vue → SSR 构建重定向到通用占位符 ---
      // client 构建时重定向到文件级包装模块 (import 真实组件 + defineClientComponent)
      // 排除从包装模块内部对真实文件的 import (通过 importer 前缀检查)。
      // Task 9.3: 同样排除从配对组件包装模块内部的 import — 配对 wrapper 直接
      // 导入真实 `.client.vue`,不需要 `defineClientComponent` 二次包装。
      if (
        isClientComponentFile(id) &&
        !importer?.startsWith(CLIENT_COMPONENT_WRAPPER_PREFIX) &&
        !importer?.startsWith(PAIRED_COMPONENT_WRAPPER_PREFIX)
      ) {
        if (options?.ssr) {
          // SSR: 通用占位符,不导入真实组件 (避免浏览器 API 在服务端报错)
          return CLIENT_COMPONENT_PLACEHOLDER_RESOLVED_ID;
        }
        // client: 解析真实路径,生成文件级包装虚拟模块
        const resolved = await this.resolve(id, importer, { skipSelf: true });
        if (!resolved) return undefined;
        return `${CLIENT_COMPONENT_WRAPPER_PREFIX}${resolved.id}`;
      }

      // --- Task 9.3: 配对组件解析 — 普通 .vue 导入检查 .server.vue / .client.vue 兄弟文件 ---
      // 仅处理相对导入 (id 以 `.` 开头),且 importer 存在且非虚拟模块。
      // 当同时存在 .server.vue 与 .client.vue 时,重定向到配对 wrapper 虚拟模块;
      // 仅存在一个兄弟时,重定向到该兄弟 (由现有 .server.vue / .client.vue 规则处理)。
      if (
        importer &&
        !importer.startsWith('\0') &&
        id.endsWith('.vue') &&
        !isServerComponentFile(id) &&
        !isClientComponentFile(id) &&
        id.startsWith('.')
      ) {
        const importerDir = dirname(resolve(importer));
        const baseVuePath = resolve(importerDir, id);
        const baseName = baseVuePath.slice(0, -'.vue'.length); // 去掉 .vue 后缀
        const serverSibling = `${baseName}.server.vue`;
        const clientSibling = `${baseName}.client.vue`;

        const hasServer = existsSync(serverSibling);
        const hasClient = existsSync(clientSibling);

        if (hasServer && hasClient) {
          // 配对:重定向到虚拟 wrapper 模块 (load 钩子根据 ssr 选项生成不同内容)
          return `${PAIRED_COMPONENT_WRAPPER_PREFIX}${serverSibling}${PAIRED_PATH_SEPARATOR}${clientSibling}`;
        }
        if (hasServer) {
          // 仅存在 .server.vue:重定向 (SSR=真实文件, client=stub)
          return serverSibling;
        }
        if (hasClient) {
          // 仅存在 .client.vue:重定向 (SSR=占位符, client=wrapper)
          return clientSibling;
        }
        // 无兄弟文件:走默认解析
      }

      return undefined;
    },

    load(id, options) {
      // Islands registry 虚拟模块
      if (id === ISLANDS_REGISTRY_RESOLVED_ID) {
        return generateRegistryModule(islandComponents);
      }

      // Task 9.1: .server.vue client stub — 导出 ServerComponentStub
      if (id === SERVER_COMPONENT_STUB_RESOLVED_ID) {
        return `import { ServerComponentStub } from '@ubean/islands/runtime';\nexport default ServerComponentStub;`;
      }

      // Task 9.2: .client.vue SSR placeholder — 导出 ClientComponentPlaceholder
      if (id === CLIENT_COMPONENT_PLACEHOLDER_RESOLVED_ID) {
        return `import { ClientComponentPlaceholder } from '@ubean/islands/runtime';\nexport default ClientComponentPlaceholder;`;
      }

      // Task 9.2: .client.vue client wrapper — import 真实组件 + defineClientComponent
      if (id.startsWith(CLIENT_COMPONENT_WRAPPER_PREFIX)) {
        const realPath = id.slice(CLIENT_COMPONENT_WRAPPER_PREFIX.length);
        return (
          `import RealComp from ${JSON.stringify(realPath)};\n` +
          `import { defineClientComponent } from '@ubean/islands/runtime';\n` +
          `export default defineClientComponent(RealComp);`
        );
      }

      // Task 9.3: 配对组件 wrapper — SSR 直接 re-export .server.vue (真实文件);
      // client 同时导入 .server.vue (→ stub) 与 .client.vue (→ 真实文件,通过 importer
      // 检查跳过 defineClientComponent 包装),调用 definePairedComponent 切换。
      if (id.startsWith(PAIRED_COMPONENT_WRAPPER_PREFIX)) {
        const payload = id.slice(PAIRED_COMPONENT_WRAPPER_PREFIX.length);
        const sepIdx = payload.indexOf(PAIRED_PATH_SEPARATOR);
        if (sepIdx === -1) return undefined;
        const serverPath = payload.slice(0, sepIdx);
        const clientPath = payload.slice(sepIdx + PAIRED_PATH_SEPARATOR.length);

        if (options?.ssr) {
          // SSR: 直接 re-export .server.vue (由现有规则解析为真实文件,transform 包裹模板)
          return `import ServerComp from ${JSON.stringify(serverPath)};\nexport default ServerComp;`;
        }
        // client: .server.vue → stub, .client.vue → 真实文件 (importer 检查跳过 wrapper)
        return (
          `import ServerComp from ${JSON.stringify(serverPath)};\n` +
          `import ClientComp from ${JSON.stringify(clientPath)};\n` +
          `import { definePairedComponent } from '@ubean/islands/runtime';\n` +
          `export default definePairedComponent(ServerComp, ClientComp);`
        );
      }

      return undefined;
    },

    transform(code, id) {
      if (!enabled) return null;

      // --- Task 9.4: defineServerIsland 调用注入组件路径 ---
      // 对 .vue SFC (主模块) 和 .ts 文件运行;跳过 ?vue&type= 子查询。
      const normalizedId = id.split('?')[0];
      const isVue = isVueSfc(id);
      const isTs = normalizedId.endsWith('.ts') && !id.includes('?');
      const originalCode = code;
      if (isVue || isTs) {
        const injected = injectServerComponentPath(code, normalizedId);
        if (injected !== null) code = injected;
      }

      // 后续处理仅对 .vue SFC 主模块运行
      if (!isVue) {
        // .ts 文件仅做 defineServerIsland 注入,无其他转换
        return isTs && code !== originalCode ? { code } : null;
      }

      // --- Task 9.1: .server.vue 模板包裹 (仅 SSR 上下文执行) ---
      // client 构建中 .server.vue 被 resolveId 重定向到 stub,真实文件不会被加载
      let serverWrapped = false;
      if (isServerComponentFile(id)) {
        const wrapped = wrapServerComponentTemplate(code);
        if (wrapped !== null) {
          code = wrapped;
          serverWrapped = true;
        }
      }

      // --- 现有: v-client.* 指令转换 + 组件收集 ---
      if (!ANY_DIRECTIVE_RE.test(code) && !serverWrapped) {
        // 仍可能因 9.4 注入而修改了 code — 返回修改后的 code
        return code !== originalCode ? { code } : null;
      }

      const absolutePath = id.split('?')[0];
      const filePath = absolutePath.replace(viteConfig.root, '').replace(/^[/\\]/, '');

      // 仅当存在 v-client.* 指令时才运行 islands 模板转换
      let result = { code, islandCount: 0 };
      if (ANY_DIRECTIVE_RE.test(code)) {
        result = transformVueSfcIslands(code, filePath);
      }

      // 仅对 SFC 主模块运行收集逻辑（?vue&type=template 等子查询只有模板片段，无 <script>）
      if (isMainVueSfc(id) && ANY_DIRECTIVE_RE.test(code)) {
        const collected = collectIslandComponents(code, absolutePath);
        const registryChanged = updateRegistry(collected, absolutePath);

        // 仅在 HMR 更新时触发 full-reload，避免首次加载时的重载循环。
        const isHmrUpdate = transformedFiles.has(absolutePath);
        transformedFiles.add(absolutePath);

        if (registryChanged && devServer && isHmrUpdate) {
          const mod = devServer.moduleGraph.getModuleById(ISLANDS_REGISTRY_RESOLVED_ID);
          if (mod) {
            devServer.moduleGraph.invalidateModule(mod);
            devServer.ws.send({ type: 'full-reload' });
          }
        }
      }

      return result;
    }
  };
}
