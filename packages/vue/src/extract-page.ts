import { readFile } from 'node:fs/promises';
import type { RouteMeta } from 'vue-router';
import type { PageHead, PageMeta } from './types';

/**
 * `definePage(...)` 宏参数提取器(构建期,零 AST 依赖的括号平衡扫描)。
 *
 * 所有权:`@ubean/vue`;`@ubean/scan` re-export `extractDefinePage*` 保持
 * 向后兼容,其服务端 `defineHandlerMeta` 提取复用下方导出的通用
 * `extractCallObject`。
 */

function extractScriptContent(code: string): string | null {
  if (!code.includes('<script')) {
    return code;
  }

  let scriptContent = '';
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(code)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';
    if (attrs.includes('setup')) {
      return content;
    }
    scriptContent += `${content}\n`;
  }

  return scriptContent || null;
}

function findBalancedCall(code: string, funcName: string): string | null {
  const callPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(code)) !== null) {
    // Skip matches inside line comments — e.g. docs mentioning
    // `definePage({...})` in a `// ...` comment above the real call.
    const lineStart = code.lastIndexOf('\n', match.index) + 1;
    const beforeOnLine = code.slice(lineStart, match.index);
    if (beforeOnLine.includes('//')) {
      continue;
    }

    const startIdx = match.index + match[0].length;
    let depth = 1;
    let i = startIdx;
    let inString: string | null = null;
    let escaped = false;

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

      if (ch === '(' || ch === '{' || ch === '[') {
        depth++;
      } else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth === 0 && ch === ')') {
          return code.slice(startIdx, i);
        }
      }

      i++;
    }
  }

  return null;
}

function skipWhitespace(code: string, pos: number): number {
  while (pos < code.length && /\s/.test(code[pos])) pos++;
  return pos;
}

function parseStringValue(code: string, pos: number): { value: string; pos: number } | null {
  const quote = code[pos];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;

  pos++;
  let value = '';
  let escaped = false;

  while (pos < code.length) {
    const ch = code[pos];
    if (escaped) {
      value += ch;
      escaped = false;
      pos++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      pos++;
      continue;
    }
    if (ch === quote) {
      if (quote === '`') {
        value += ch;
        pos++;
        if (pos >= code.length || code[pos] !== '`') {
          pos--;
          break;
        }
      } else {
        pos++;
        break;
      }
    }
    value += ch;
    pos++;
  }

  return { value, pos };
}

function parseIdentifier(code: string, pos: number): { name: string; pos: number } | null {
  const start = pos;
  while (pos < code.length && /[\w$]/.test(code[pos])) pos++;
  if (pos === start) return null;
  return { name: code.slice(start, pos), pos };
}

function parseValue(code: string, pos: number): { value: unknown; pos: number } | null {
  pos = skipWhitespace(code, pos);
  if (pos >= code.length) return null;

  const ch = code[pos];

  if (ch === '"' || ch === "'" || ch === '`') {
    const str = parseStringValue(code, pos);
    if (str) return { value: str.value, pos: str.pos };
    return null;
  }

  if (ch === '{') {
    return parseObjectValue(code, pos);
  }

  if (ch === '[') {
    return parseArrayValue(code, pos);
  }

  if (ch === 't' && code.slice(pos, pos + 4) === 'true') {
    return { value: true, pos: pos + 4 };
  }
  if (ch === 'f' && code.slice(pos, pos + 5) === 'false') {
    return { value: false, pos: pos + 5 };
  }
  if (ch === 'n' && code.slice(pos, pos + 4) === 'null') {
    return { value: null, pos: pos + 4 };
  }

  const numMatch = code.slice(pos).match(/^-?\d+\.?\d*(?:[eE][+-]?\d+)?/);
  if (numMatch) {
    return { value: Number(numMatch[0]), pos: pos + numMatch[0].length };
  }

  const ident = parseIdentifier(code, pos);
  if (ident) {
    return { value: ident.name, pos: ident.pos };
  }

  return null;
}

function parseObjectValue(code: string, pos: number): { value: Record<string, unknown>; pos: number } | null {
  if (code[pos] !== '{') return null;
  pos++;

  const result: Record<string, unknown> = {};
  pos = skipWhitespace(code, pos);

  if (code[pos] === '}') {
    return { value: result, pos: pos + 1 };
  }

  while (pos < code.length) {
    pos = skipWhitespace(code, pos);

    let key: string | null = null;
    if (code[pos] === '"' || code[pos] === "'") {
      const keyStr = parseStringValue(code, pos);
      if (keyStr) {
        key = keyStr.value;
        pos = keyStr.pos;
      }
    } else {
      const ident = parseIdentifier(code, pos);
      if (ident) {
        key = ident.name;
        pos = ident.pos;
      }
    }

    if (!key) break;

    pos = skipWhitespace(code, pos);
    if (code[pos] !== ':') break;
    pos++;

    pos = skipWhitespace(code, pos);
    const val = parseValue(code, pos);
    if (val) {
      result[key] = val.value;
      pos = val.pos;
    }

    pos = skipWhitespace(code, pos);
    if (code[pos] === ',') {
      pos++;
      continue;
    }
    if (code[pos] === '}') {
      pos++;
      break;
    }
    break;
  }

  return { value: result, pos };
}

function parseArrayValue(code: string, pos: number): { value: unknown[]; pos: number } | null {
  if (code[pos] !== '[') return null;
  pos++;

  const result: unknown[] = [];
  pos = skipWhitespace(code, pos);

  if (code[pos] === ']') {
    return { value: result, pos: pos + 1 };
  }

  while (pos < code.length) {
    pos = skipWhitespace(code, pos);
    const val = parseValue(code, pos);
    if (val) {
      result.push(val.value);
      pos = val.pos;
    }

    pos = skipWhitespace(code, pos);
    if (code[pos] === ',') {
      pos++;
      continue;
    }
    if (code[pos] === ']') {
      pos++;
      break;
    }
    break;
  }

  return { value: result, pos };
}

function parseObjectLiteral(code: string): Record<string, unknown> {
  const start = skipWhitespace(code, 0);
  if (code[start] !== '{') return {};

  const parsed = parseObjectValue(code, start);
  if (parsed) {
    return parsed.value;
  }

  const result: Record<string, unknown> = {};
  const simpleRegex = /(\w+)\s*:\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g;
  let m: RegExpExecArray | null;
  while ((m = simpleRegex.exec(code)) !== null) {
    result[m[1]] = m[3];
  }
  return result;
}

/**
 * 通用宏调用提取:在代码中查找 `funcName({...})` 形式的调用并解析其
 * 对象字面量参数。供本包的 `definePage` 提取与 `@ubean/scan` 的
 * `defineHandlerMeta` 提取共用(单一解析器实现)。
 */
export function extractCallObject(code: string, funcName: string): Record<string, unknown> | null {
  const argStr = findBalancedCall(code, funcName);
  if (!argStr) return null;

  const trimmed = argStr.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  return parseObjectLiteral(trimmed);
}

/**
 * Normalize a parsed `head` value into a `PageHead` object。
 *
 * Mirrors the markdown frontmatter head validation so Vue pages (via
 * `definePage`) and Markdown pages (via frontmatter) share the same rules.
 */
function normalizePageHead(raw: unknown): PageHead | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const src = raw as Record<string, unknown>;
  const head: PageHead = {};

  if (typeof src.title === 'string') head.title = src.title;
  if (Array.isArray(src.meta)) head.meta = src.meta as Array<Record<string, string>>;
  if (Array.isArray(src.link)) head.link = src.link as Array<Record<string, string>>;
  if (Array.isArray(src.script)) head.script = src.script as Array<Record<string, string>>;
  if (src.htmlAttrs && typeof src.htmlAttrs === 'object') head.htmlAttrs = src.htmlAttrs as Record<string, string>;
  if (src.bodyAttrs && typeof src.bodyAttrs === 'object') head.bodyAttrs = src.bodyAttrs as Record<string, string>;

  return Object.keys(head).length > 0 ? head : undefined;
}

export { normalizePageHead };

export function extractDefinePageFromCode(code: string): PageMeta | null {
  const scriptContent = extractScriptContent(code);
  if (!scriptContent) return null;

  const parsed = extractCallObject(scriptContent, 'definePage');
  if (!parsed) return null;

  const result: PageMeta = {};
  if (typeof parsed.name === 'string') result.name = parsed.name;
  if (typeof parsed.path === 'string') result.path = parsed.path;
  if (parsed.layout === false) {
    result.layout = false;
  } else if (typeof parsed.layout === 'string' && parsed.layout !== 'default') {
    result.layout = parsed.layout;
  } else if (Array.isArray(parsed.layout)) {
    // Nested layouts: array of layout names (outer → inner).
    // 'default' inside an array is a literal layout name — it explicitly
    // includes `layouts/default.vue` in the nesting chain.
    const layouts = parsed.layout.filter((l): l is string => typeof l === 'string');
    if (layouts.length > 0) result.layout = layouts;
  }
  if (typeof parsed.reuse === 'string') result.reuse = parsed.reuse;
  if (parsed.meta && typeof parsed.meta === 'object') result.meta = parsed.meta as RouteMeta;
  if (typeof parsed.requiresAuth === 'boolean') result.requiresAuth = parsed.requiresAuth;
  if (typeof parsed.cache === 'boolean') result.cache = parsed.cache;
  if (typeof parsed.transition === 'string') result.transition = parsed.transition;

  const head = normalizePageHead(parsed.head);
  if (head) result.head = head;

  return result;
}

export async function extractDefinePage(filePath: string): Promise<PageMeta | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefinePageFromCode(code);
}
