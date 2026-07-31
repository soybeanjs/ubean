/**
 * P9-08 组件级缓存指令 —— Vite 插件
 *
 * 在编译时检测 `"use cache"` 指令,将标记的异步函数转换为 `wrapWithCache()` 调用。
 *
 * ## 工作原理
 *
 * 用户编写:
 * ```ts
 * async function getUser(id: string) {
 *   'use cache';
 *   cacheLife(3600);
 *   cacheTag('users', `user:${id}`);
 *   return await db.query.user.findById(id);
 * }
 * ```
 *
 * 插件转换为(服务端):
 * ```ts
 * import { wrapWithCache as __ubean_wrapCache } from '@ubean/server/cache-directive';
 *
 * const getUser = __ubean_wrapCache(
 *   async function(id) {
 *     cacheLife(3600);
 *     cacheTag('users', `user:${id}`);
 *     return await db.query.user.findById(id);
 *   },
 *   { name: 'getUser', defaultTtl: 60 }
 * );
 * ```
 *
 * 客户端:不转换(浏览器端不应包含 `"use cache"` 函数,如果出现则保持原样,
 * 运行时 `cacheLife`/`cacheTag` 为空操作)。
 *
 * ## 检测
 *
 * 插件扫描 `.ts` / `.js` / `.mts` / `.mjs` / `.tsx` / `.jsx` / `.vue` 文件,
 * 在异步函数体首行查找 `'use cache'` 字符串字面量指令。
 *
 * 对齐:Next.js 16 `"use cache"` 指令。
 */
import type { Plugin } from 'vite';
import { relative } from 'pathe';

export interface CacheDirectivePluginOptions {
  /** 项目根目录(用于生成缓存名称前缀)。 */
  root?: string;
  /**
   * 仅转换匹配这些模式的文件。默认为 `src/` 下所有 `.ts/.js/.tsx/.jsx/.vue` 文件。
   */
  include?: RegExp[];
  /** 排除匹配的文件。默认排除 `node_modules` 和虚拟模块。 */
  exclude?: RegExp[];
}

const USE_CACHE_DIRECTIVE_RE = /['"]use\s+cache['"];?/;

/**
 * 检测代码中是否包含 `"use cache"` 指令。
 */
export function hasUseCacheDirective(code: string): boolean {
  return USE_CACHE_DIRECTIVE_RE.test(code);
}

/**
 * 提取异步函数名。
 *
 * 支持的形式:
 * - `export async function name(...) { 'use cache' ... }`
 * - `async function name(...) { 'use cache' ... }`
 * - `const name = async (...) => { 'use cache' ... }`
 * - `export const name = async (...) => { 'use cache' ... }`
 * - `const name = async function(...) { 'use cache' ... }`
 */
interface FunctionInfo {
  /** 函数名(用于缓存键前缀)。 */
  name: string;
  /** 函数体起始位置(`{` 后)。 */
  bodyStart: number;
  /** 函数体结束位置(`}`)。 */
  bodyEnd: number;
  /** 整个函数声明的起始位置。 */
  declStart: number;
  /** 整个函数声明的结束位置。 */
  declEnd: number;
  /** 指令在函数体中的位置(用于移除)。 */
  directiveStart: number;
  /** 指令结束位置(含分号)。 */
  directiveEnd: number;
}

/**
 * 查找匹配的闭合括号/大括号。
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
    // 跳过注释
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
 * 在函数体内查找 `"use cache"` 指令的位置。
 *
 * 指令必须是函数体第一个语句(允许前面有注释和空白)。
 */
function findDirectiveInBody(code: string, bodyStart: number, bodyEnd: number): { start: number; end: number } | null {
  // bodyStart 指向 `{` 后第一个字符
  let i = bodyStart;

  // 跳过空白和注释
  while (i < bodyEnd) {
    const ch = code[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '/') {
      while (i < bodyEnd && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < bodyEnd && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    break;
  }

  // 检查是否为 `"use cache"` 或 `'use cache'`
  const rest = code.slice(i, bodyEnd);
  const m = rest.match(/^(['"])(use\s+cache)\1;?/);
  if (m) {
    return { start: i, end: i + m[0].length };
  }

  return null;
}

/**
 * 提取所有带 `"use cache"` 指令的异步函数信息。
 */
export function extractCachedFunctions(code: string): FunctionInfo[] {
  const results: FunctionInfo[] = [];

  // 模式 1: `async function name(...) { 'use cache' ... }`
  // 模式 2: `export async function name(...) { 'use cache' ... }`
  const funcDeclRe = /(?:export\s+)?async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g;

  let m: RegExpExecArray | null;
  while ((m = funcDeclRe.exec(code)) !== null) {
    const name = m[1];
    const parenStart = m.index + m[0].length - 1; // `(` 的位置
    const parenEnd = findBalanced(code, '(', ')', parenStart + 1);
    if (parenEnd === null) continue;

    // 查找 `{`
    let braceIdx = parenEnd + 1;
    while (braceIdx < code.length && /\s/.test(code[braceIdx])) braceIdx++;
    if (code[braceIdx] !== '{') continue;

    const bodyStart = braceIdx + 1;
    const bodyEnd = findBalanced(code, '{', '}', bodyStart);
    if (bodyEnd === null) continue;

    const directive = findDirectiveInBody(code, bodyStart, bodyEnd);
    if (!directive) continue;

    // declEnd: 包含可能的分号
    let declEnd = bodyEnd + 1;
    if (code[declEnd] === ';') declEnd++;

    results.push({
      name,
      bodyStart,
      bodyEnd,
      declStart: m.index,
      declEnd,
      directiveStart: directive.start,
      directiveEnd: directive.end
    });
  }

  // 模式 3: `const name = async (...) => { 'use cache' ... }`
  // 模式 4: `export const name = async (...) => { 'use cache' ... }`
  // 模式 5: `const name = async function(...) { 'use cache' ... }`
  const arrowRe = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\s+(?:function\s*\w*\s*\(|\()/g;

  while ((m = arrowRe.exec(code)) !== null) {
    const name = m[1];
    const parenStart = code.indexOf('(', m.index + m[0].length - 1);
    if (parenStart === -1) continue;
    const parenEnd = findBalanced(code, '(', ')', parenStart + 1);
    if (parenEnd === null) continue;

    // 跳过 `=>` 或函数名
    let braceIdx = parenEnd + 1;
    // 跳过 `=>` 周围的空白和 `=` `>` 字符
    while (braceIdx < code.length && /[\s=>]/.test(code[braceIdx])) braceIdx++;
    while (braceIdx < code.length && /\s/.test(code[braceIdx])) braceIdx++;

    if (code[braceIdx] !== '{') continue;

    const bodyStart = braceIdx + 1;
    const bodyEnd = findBalanced(code, '{', '}', bodyStart);
    if (bodyEnd === null) continue;

    const directive = findDirectiveInBody(code, bodyStart, bodyEnd);
    if (!directive) continue;

    let declEnd = bodyEnd + 1;
    if (code[declEnd] === ';') declEnd++;

    results.push({
      name,
      bodyStart,
      bodyEnd,
      declStart: m.index,
      declEnd,
      directiveStart: directive.start,
      directiveEnd: directive.end
    });
  }

  // 按声明起始位置降序排序,便于从后向前替换
  results.sort((a, b) => b.declStart - a.declStart);
  return results;
}

/**
 * 转换单个文件中的 `"use cache"` 函数。
 *
 * 返回转换后的代码,若无缓存函数则返回 `null`。
 */
export function transformUseCache(code: string, filePath: string, root?: string): string | null {
  if (!hasUseCacheDirective(code)) return null;

  const funcs = extractCachedFunctions(code);
  if (funcs.length === 0) return null;

  // 计算项目相对路径(用于缓存名前缀,避免跨文件同名冲突)
  let relPath = filePath;
  if (root && filePath.startsWith(root)) {
    try {
      relPath = relative(root, filePath);
    } catch {
      // ignore
    }
  }
  relPath = relPath.replace(/\\/g, '/');

  // 从后向前替换(保持索引有效)
  let result = code;
  for (const fn of funcs) {
    // 提取函数体(移除指令)
    const bodyBefore = result.slice(fn.bodyStart, fn.directiveStart);
    const bodyAfter = result.slice(fn.directiveEnd, fn.bodyEnd);
    const body = bodyBefore + bodyAfter;

    // 提取原始声明中的参数列表
    // 查找 `(` 和 `)` 的位置
    const declSlice = result.slice(fn.declStart, fn.bodyStart);
    const openParen = declSlice.indexOf('(');
    const closeParen = declSlice.lastIndexOf(')');
    const params = openParen !== -1 && closeParen !== -1 ? declSlice.slice(openParen + 1, closeParen).trim() : '';

    // 判断是否有 `export`
    const hasExport = /^\s*export\s+/.test(declSlice);
    const exportPrefix = hasExport ? 'export ' : '';

    // 判断是 `async function name` 还是 `const name = async`
    const isFuncDecl = /async\s+function\s+/.test(declSlice);

    // 缓存名:`relPath:name`
    const cacheName = `${relPath}:${fn.name}`;

    // 生成替换代码
    const replacement = isFuncDecl
      ? `${exportPrefix}const ${fn.name} = __ubean_wrapCache(
  async function ${fn.name}(${params}) {${body}},
  { name: ${JSON.stringify(cacheName)}, defaultTtl: 60 }
);`
      : `${exportPrefix}const ${fn.name} = __ubean_wrapCache(
  async (${params}) => {${body}},
  { name: ${JSON.stringify(cacheName)}, defaultTtl: 60 }
);`;

    result = result.slice(0, fn.declStart) + replacement + result.slice(fn.declEnd);
  }

  // 在文件顶部注入 import
  const importStmt = `import { wrapWithCache as __ubean_wrapCache } from '@ubean/server/cache-directive';\n`;

  // 检查是否已有 import(避免重复)
  if (!result.includes("@ubean/server/cache-directive'")) {
    result = importStmt + result;
  }

  return result;
}

/**
 * 处理 Vue SFC 文件:提取 `<script>` 块,转换其中的 `"use cache"` 函数。
 */
function transformVueSfc(code: string, filePath: string, root?: string): string | null {
  let transformed = false;
  const result = code.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (match, attrs: string, content: string) => {
    // 跳过 `<script setup>` 之外的普通 script 块也处理
    const transformedContent = transformUseCache(content, filePath, root);
    if (transformedContent === null) return match;
    transformed = true;
    return `<script${attrs}>${transformedContent}</script>`;
  });
  return transformed ? result : null;
}

/**
 * Vite 插件:`"use cache"` 指令转换。
 *
 * - **服务端**(SSR/Node):转换函数为 `wrapWithCache()` 调用。
 * - **客户端**(浏览器):不转换(浏览器端 `cacheLife`/`cacheTag` 为空操作,
 *   `wrapWithCache` 直接执行函数不缓存)。
 */
export function ubeanCacheDirectivePlugin(options: CacheDirectivePluginOptions = {}): Plugin {
  const root = options.root || (typeof process !== 'undefined' ? process.cwd() : '');
  const includePatterns = options.include;
  const excludePatterns = options.exclude || [];

  return {
    name: 'ubean:cache-directive',
    enforce: 'pre',

    transform(code, id, transformOptions) {
      // 跳过 node_modules 和虚拟模块
      if (id.includes('/node_modules/') || id.includes('\0')) return null;

      // 客户端不转换
      if (transformOptions?.ssr === false) return null;

      // 仅转换 JS/TS/Vue 文件
      if (!/\.(ts|js|mts|mjs|tsx|jsx|vue)$/.test(id)) return null;

      // 快速检测
      if (!hasUseCacheDirective(code)) return null;

      // 应用 include/exclude 过滤
      if (includePatterns && !includePatterns.some(re => re.test(id))) return null;
      if (excludePatterns.some(re => re.test(id))) return null;

      if (id.endsWith('.vue')) {
        const transformed = transformVueSfc(code, id, root);
        return transformed ? { code: transformed } : null;
      }

      const transformed = transformUseCache(code, id, root);
      return transformed ? { code: transformed } : null;
    }
  };
}
