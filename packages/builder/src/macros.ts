const MACRO_NAMES = ['definePage'] as const;

function findBalancedCall(code: string, funcName: string, startSearch = 0): { start: number; end: number } | null {
  const pattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
  pattern.lastIndex = startSearch;
  const match = pattern.exec(code);
  if (!match) return null;

  const startIdx = match.index;
  const parenStart = match.index + match[0].length;
  let depth = 1;
  let i = parenStart;
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
      if (ch === inString) {
        inString = null;
      }
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

    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && ch === ')') {
        return { start: startIdx, end: i + 1 };
      }
    }

    i++;
  }

  return null;
}

function stripStatement(code: string, callStart: number, callEnd: number): string {
  let start = callStart;
  let end = callEnd;

  while (start > 0 && /[ \t]/.test(code[start - 1])) start--;

  // Handle `export default definePage(...)` pattern (used in `.reuse.ts` files):
  // stripping just `definePage(...)` would leave `export default` dangling,
  // causing a syntax error. Remove the `export default` prefix as well.
  const exportDefaultMatch = code.slice(0, start).match(/export\s+default\s*$/);
  if (exportDefaultMatch) {
    start -= exportDefaultMatch[0].length;
    while (start > 0 && /[ \t\n\r]/.test(code[start - 1])) start--;
  }

  if (code[end] === ';') {
    end++;
  }

  while (end < code.length && /[ \t]/.test(code[end])) end++;

  const before = code.slice(0, start);
  const after = code.slice(end);
  return before + after;
}

export function stripMacros(code: string, macros: readonly string[] = MACRO_NAMES): string {
  let result = code;

  for (const macro of macros) {
    let offset = 0;
    while (true) {
      const found = findBalancedCall(result, macro, offset);
      if (!found) break;
      result = stripStatement(result, found.start, found.end);
      offset = found.start;
    }
  }

  return result;
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

function transformVueMacros(code: string): string {
  const hasPlainScript = PLAIN_SCRIPT_RE.test(code);
  return code.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (_match, attrs: string, content: string) => {
    const stripped = stripMacros(content);
    const isSetup = /\bsetup\b/.test(attrs);
    const keepAlive = isSetup && hasPlainScript && !stripped.trim() ? EMPTY_SETUP_KEEP_ALIVE : stripped;
    return `<script${attrs}>${keepAlive}</script>`;
  });
}
