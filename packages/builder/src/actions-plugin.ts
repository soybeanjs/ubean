/**
 * Vite plugin for Server Actions (P9-02).
 *
 * Detects `defineAction()` call expressions in source code and handles the
 * client/server split automatically:
 *
 *  - **Server** (SSR / Node): injects `filePath` (and `name` when inferable)
 *    into the `defineAction()` options so the generated action ID is stable
 *    across dev / build. The `defineAction()` call runs for real and
 *    registers the action in the global registry.
 *  - **Client** (browser): replaces each `defineAction(...)` call with
 *    `createActionStub('<id>')`, where `<id>` is computed from the file
 *    path + inferred name (matching the server). The stub performs an RPC
 *    POST to `/__actions` when invoked via `useAction()`.
 *
 * ## Name inference
 *
 * The action name is resolved in priority order:
 *  1. The `name` property in the call's options object (if present).
 *  2. The variable / property name the result is assigned to:
 *     - `export const login = defineAction(...)` → `'login'`
 *     - `const login = defineAction(...)`        → `'login'`
 *     - `{ login: defineAction(...) }`           → `'login'`
 *  3. Fallback: `'anonymous'`.
 *
 * ## Detection
 *
 * The plugin scans `.ts` / `.js` / `.mts` / `.mjs` / `.tsx` / `.jsx`
 * files for `\bdefineAction\s*\(` call expressions. Files without any
 * match are skipped.
 */
import type { Plugin } from 'vite';
import { createActionId } from '@ubean/routes';
import { relative } from 'pathe';

export interface ServerActionsPluginOptions {
  /**
   * The project root directory (used for computing stable action IDs).
   * Defaults to `process.cwd()` at plugin creation time.
   */
  root?: string;
}

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 查找匹配的闭合括号(支持字符串/模板字面量/注释跳过)。
 */
function findBalanced(code: string, openChar: string, closeChar: string, startIdx: number): number | null {
  let depth = 1;
  let i = startIdx;
  let inString: string | null = null;
  let escaped = false;
  let inTemplateExpr = 0;

  while (i < code.length && depth > 0) {
    const ch = code[i];

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      i++;
      continue;
    }
    if (inString) {
      if (inString === '`' && ch === '$' && code[i + 1] === '{') {
        inTemplateExpr++;
        i += 2;
        continue;
      }
      if (inString === '`' && ch === '}' && inTemplateExpr > 0) {
        inTemplateExpr--;
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
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
 * 计算项目相对路径(用于 action ID 生成)。
 */
function toProjectRelative(filePath: string, root: string): string {
  let rel = filePath;
  if (root) {
    try {
      rel = relative(root, filePath);
    } catch {
      // pathe.relative 在 Windows 跨盘符路径上可能抛错,退回原路径
    }
  }
  return rel.replace(/\\/g, '/');
}

/* -------------------------------------------------------------------------- */
/* defineAction 调用检测                                                        */
/* -------------------------------------------------------------------------- */

const DEFINE_ACTION_RE = /\b(?:defineAction|defineServerFn)\s*\(/g;

interface DefineActionCall {
  /** `defineAction` 标识符起始位置。 */
  start: number;
  /** `(` 后第一个字符位置(参数区起点)。 */
  argStart: number;
  /** 匹配的 `)` 位置。 */
  end: number;
  /** 推断出的 action 名称。 */
  name: string;
  /** 最后一个参数是否为对象字面量(options)。 */
  hasOptionsObject: boolean;
  /** options 对象 `{` 的位置(若 hasOptionsObject)。 */
  optionsBraceStart: number;
  /** options 对象 `}` 的位置(若 hasOptionsObject)。 */
  optionsBraceEnd: number;
  /** options 对象是否已包含 `name` 属性。 */
  optionsHasName: boolean;
  /** options 对象是否已包含 `filePath` 属性。 */
  optionsHasFilePath: boolean;
}

/**
 * 从 options 对象文本中提取 `name` 属性的字符串字面量值。
 *
 * 匹配 `name: 'xxx'` 或 `name: "xxx"`。不支持动态值(如 `name: someVar`),
 * 此类情况下返回 `null`。
 */
function extractOptionsName(objText: string): string | null {
  const m = objText.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

/**
 * 推断 action 名称。
 *
 * 优先级:
 *  1. options 对象中的 `name` 字符串字面量(若存在)
 *  2. 变量/属性赋名:
 *     - `export const <name> = defineAction(`
 *     - `const <name> = defineAction(`
 *     - `<name>: defineAction(`  (对象属性)
 *  3. `'anonymous'`
 */
function inferName(code: string, callStart: number, optionsObjText: string | null): string {
  // 优先级 1: options 中的 name 字面量
  if (optionsObjText) {
    const optsName = extractOptionsName(optionsObjText);
    if (optsName) return optsName;
  }

  // 取 `defineAction` 之前的文本,去除尾部空白
  const before = code.slice(0, callStart).replace(/\s+$/, '');
  if (before.length === 0) return 'anonymous';

  // 优先级 2: 变量/属性赋名
  const varMatch = before.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
  if (varMatch) return varMatch[1];

  const propMatch = before.match(/([A-Za-z_$][\w$]*|['"]([^'"]+)['"])\s*:\s*$/);
  if (propMatch) return propMatch[2] || propMatch[1];

  return 'anonymous';
}

/**
 * 检查对象字面量文本中是否包含指定顶层属性。
 */
function objectHasProperty(objText: string, propName: string): boolean {
  // 简单匹配:`<propName>\s*:` (顶层,但正则无法保证顶层;近似处理)
  return new RegExp(`\\b${propName}\\s*:`).test(objText);
}

/**
 * 在调用参数区(argStart..end)内查找顶层逗号位置(深度 0 相对于调用括号)。
 *
 * 返回所有顶层逗号的索引数组。
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

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      i++;
      continue;
    }
    if (inString) {
      if (inString === '`' && ch === '$' && code[i + 1] === '{') {
        inTemplateExpr++;
        i += 2;
        continue;
      }
      if (inString === '`' && ch === '}' && inTemplateExpr > 0) {
        inTemplateExpr--;
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') {
      while (i < end && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < end && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      commas.push(i);
    }
    i++;
  }
  return commas;
}

/**
 * 预扫描代码,返回所有"非代码"区间 `[start, end)`:注释(块/行)和字符串字面量。
 *
 * 用于跳过注释/字符串内的 `defineAction(` 匹配(如 JSDoc 示例或说明性字符串)。
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
      i += 2; // skip */
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
    // 字符串字面量 — 记录区间以跳过其中的匹配
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
          // 模板字面量表达式 — 简化处理,跳到匹配的 }
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

/**
 * 检查位置 `pos` 是否落在任意区间内。
 */
function isInsideRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true;
  }
  return false;
}

/**
 * 提取源码中所有 `defineAction(...)` 调用信息。
 *
 * 跳过注释内的匹配(如 JSDoc 示例)和函数声明(`function defineAction(`)。
 */
export function findDefineActionCalls(code: string): DefineActionCall[] {
  const results: DefineActionCall[] = [];
  const nonCodeRanges = findNonCodeRanges(code);

  let m: RegExpExecArray | null;
  DEFINE_ACTION_RE.lastIndex = 0;
  while ((m = DEFINE_ACTION_RE.exec(code)) !== null) {
    const start = m.index;

    // 跳过注释/字符串内的匹配(如 JSDoc 中的 defineAction( 示例)
    if (isInsideRanges(start, nonCodeRanges)) continue;

    // 跳过函数声明: `function defineAction(` / `export function defineAction(`
    const before = code.slice(0, start);
    if (/\bfunction\s+$/.test(before)) continue;

    const argStart = m.index + m[0].length; // `(` 后
    const end = findBalanced(code, '(', ')', argStart);
    if (end === null) continue;

    // 查找最后一个参数是否为对象字面量
    const commas = findTopLevelCommas(code, argStart, end);
    let hasOptionsObject = false;
    let optionsBraceStart = -1;
    let optionsBraceEnd = -1;
    let optionsHasName = false;
    let optionsHasFilePath = false;
    let optionsObjText: string | null = null;

    // 最后一个参数的起始位置
    const lastArgStart = commas.length > 0 ? commas[commas.length - 1] + 1 : argStart;
    // 跳过空白
    let scanIdx = lastArgStart;
    while (scanIdx < end && /\s/.test(code[scanIdx])) scanIdx++;

    if (scanIdx < end && code[scanIdx] === '{') {
      const braceEnd = findBalanced(code, '{', '}', scanIdx + 1);
      if (braceEnd !== null && braceEnd < end) {
        // 确认 `}` 之后到 `)` 之间只有空白
        let after = braceEnd + 1;
        while (after < end && /\s/.test(code[after])) after++;
        if (after === end) {
          hasOptionsObject = true;
          optionsBraceStart = scanIdx;
          optionsBraceEnd = braceEnd;
          optionsObjText = code.slice(scanIdx + 1, braceEnd);
          optionsHasName = objectHasProperty(optionsObjText, 'name');
          optionsHasFilePath = objectHasProperty(optionsObjText, 'filePath');
        }
      }
    }

    // 推断名称(优先 options 中的 name,其次变量/属性赋名)
    const name = inferName(code, start, optionsObjText);

    results.push({
      start,
      argStart,
      end,
      name,
      hasOptionsObject,
      optionsBraceStart,
      optionsBraceEnd,
      optionsHasName,
      optionsHasFilePath
    });
  }

  // 按起始位置降序排序,便于从后向前替换
  results.sort((a, b) => b.start - a.start);
  return results;
}

/**
 * 检测源码是否包含 `defineAction(` 调用。
 */
export function hasDefineActionCall(code: string): boolean {
  DEFINE_ACTION_RE.lastIndex = 0;
  return DEFINE_ACTION_RE.test(code);
}

/* -------------------------------------------------------------------------- */
/* 转换函数                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 服务端转换:为每个 `defineAction()` 调用注入 `filePath`(以及缺失时的 `name`),
 * 确保 action ID 在 dev / build 之间稳定。
 *
 * 返回转换后的代码;若无 `defineAction` 调用则返回 `null`。
 */
export function transformActionsForServer(code: string, filePath: string, root: string): string | null {
  if (!hasDefineActionCall(code)) return null;

  const calls = findDefineActionCalls(code);
  if (calls.length === 0) return null;

  const relPath = toProjectRelative(filePath, root);

  let result = code;
  for (const call of calls) {
    const injectName = !call.optionsHasName ? call.name : null;
    // filePath 总是注入(除非用户已显式指定)
    const injectFilePath = !call.optionsHasFilePath ? relPath : null;

    if (call.hasOptionsObject) {
      // 在 options 对象 `{` 后注入属性
      const injectParts: string[] = [];
      if (injectFilePath) injectParts.push(`filePath: ${JSON.stringify(injectFilePath)}`);
      if (injectName) injectParts.push(`name: ${JSON.stringify(injectName)}`);
      if (injectParts.length === 0) continue; // 无需注入

      const injectText = `${injectParts.join(', ')}, `;
      // 在 `{` 后插入(若有内容则前面加属性,后续属性在后,逗号已含)
      const insertPos = call.optionsBraceStart + 1;
      result = result.slice(0, insertPos) + injectText + result.slice(insertPos);
    } else {
      // 无 options 对象,追加新的 options 参数
      const opts: Record<string, string> = {};
      if (injectFilePath) opts.filePath = JSON.stringify(injectFilePath);
      if (injectName) opts.name = JSON.stringify(injectName);
      const optsText = `{ ${Object.entries(opts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')} }`;
      // 在 `)` 前插入 `, optsText`
      // 判断 `)` 前是否有参数(若有参数需加逗号)
      const beforeEnd = result.slice(call.argStart, call.end).replace(/\s+$/, '');
      const hasArgs = beforeEnd.length > 0;
      const insertText = `${hasArgs ? ', ' : ''}${optsText}`;
      result = result.slice(0, call.end) + insertText + result.slice(call.end);
    }
  }

  return result;
}

/**
 * 客户端转换:将每个 `defineAction(...)` 调用替换为
 * `__ubean_createActionStub('<id>')`(别名 import,避免与用户代码冲突)。
 *
 * 返回转换后的代码(含注入的 import);若无 `defineAction` 调用则返回 `null`。
 */
export function transformActionsForClient(code: string, filePath: string, root: string): string | null {
  if (!hasDefineActionCall(code)) return null;

  const calls = findDefineActionCalls(code);
  if (calls.length === 0) return null;

  const relPath = toProjectRelative(filePath, root);

  // 从后向前替换,保持索引有效
  let result = code;
  for (const call of calls) {
    const id = createActionId(relPath, call.name);
    const replacement = `__ubean_createActionStub(${JSON.stringify(id)})`;
    result = result.slice(0, call.start) + replacement + result.slice(call.end + 1);
  }

  // 注入 import(避免重复)
  const importStmt = `import { createActionStub as __ubean_createActionStub } from '@ubean/routes/runtime';\n`;
  if (!result.includes("@ubean/routes/runtime'")) {
    result = importStmt + result;
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Vite 插件                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Vite 插件:Server Actions 的客户端/服务端拆分。
 *
 *  - 服务端(SSR):注入 `filePath`/`name` 到 `defineAction()` 选项。
 *  - 客户端(浏览器):将 `defineAction(...)` 替换为 `createActionStub('<id>')`。
 */
export function ubeanServerActionsPlugin(options: ServerActionsPluginOptions = {}): Plugin {
  const root = options.root || (typeof process !== 'undefined' ? process.cwd() : '');

  return {
    name: 'ubean:server-actions',
    enforce: 'pre',

    transform(code, id, transformOptions) {
      // 跳过 node_modules 和虚拟模块
      if (id.includes('/node_modules/') || id.includes('\0')) return null;

      // 仅转换 JS/TS 文件
      if (!/\.(ts|js|mts|mjs|tsx|jsx)$/.test(id)) return null;

      // 快速检测:必须包含 `defineAction(` 调用
      if (!hasDefineActionCall(code)) return null;

      const isServer = transformOptions?.ssr === true;

      if (isServer) {
        const transformed = transformActionsForServer(code, id, root);
        return transformed ? { code: transformed } : null;
      }

      const transformed = transformActionsForClient(code, id, root);
      return transformed ? { code: transformed } : null;
    }
  };
}
