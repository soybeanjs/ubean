import { readFile } from 'node:fs/promises';

export interface PageMeta {
  name?: string;
  path?: string;
  layout?: string | false;
  reuse?: string;
  meta?: Record<string, unknown>;
  middleware?: string | string[];
  public?: boolean;
  head?: Record<string, unknown>;
}

export interface DefineMetaResult {
  meta?: Record<string, unknown>;
  public?: boolean;
}

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

  if (quote !== '`') {
    return { value, pos };
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

function extractAndParseCall(code: string, funcName: string): Record<string, unknown> | null {
  const argStr = findBalancedCall(code, funcName);
  if (!argStr) return null;

  const trimmed = argStr.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  return parseObjectLiteral(trimmed);
}

export function extractDefinePageFromCode(code: string): PageMeta | null {
  const scriptContent = extractScriptContent(code);
  if (!scriptContent) return null;

  const parsed = extractAndParseCall(scriptContent, 'definePage');
  if (!parsed) return null;

  const result: PageMeta = {};
  if (typeof parsed.name === 'string') result.name = parsed.name;
  if (typeof parsed.path === 'string') result.path = parsed.path;
  if (parsed.layout === false || (typeof parsed.layout === 'string' && parsed.layout !== 'default'))
    result.layout = parsed.layout as string | false;
  if (typeof parsed.reuse === 'string') result.reuse = parsed.reuse;
  if (parsed.meta && typeof parsed.meta === 'object') result.meta = parsed.meta as Record<string, unknown>;
  if (typeof parsed.public === 'boolean') result.public = parsed.public;
  if (parsed.head && typeof parsed.head === 'object') result.head = parsed.head as Record<string, unknown>;
  if (typeof parsed.middleware === 'string') {
    result.middleware = parsed.middleware;
  } else if (Array.isArray(parsed.middleware)) {
    result.middleware = parsed.middleware.filter((m): m is string => typeof m === 'string');
  }

  return result;
}

export function extractDefineMetaFromCode(code: string): DefineMetaResult | null {
  const scriptContent = extractScriptContent(code);
  if (!scriptContent) return null;

  const parsed = extractAndParseCall(scriptContent, 'defineHandlerMeta');
  if (!parsed) return null;

  const result: DefineMetaResult = {};
  if (typeof parsed.public === 'boolean') result.public = parsed.public;
  if (parsed.meta && typeof parsed.meta === 'object') {
    result.meta = parsed.meta as Record<string, unknown>;
  } else {
    const knownKeys = new Set(['public', 'meta']);
    const extra: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (!knownKeys.has(key)) extra[key] = val;
    }
    if (Object.keys(extra).length > 0) {
      result.meta = extra;
    }
  }

  return result;
}

export async function extractDefinePage(filePath: string): Promise<PageMeta | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefinePageFromCode(code);
}

export async function extractDefineMeta(filePath: string): Promise<DefineMetaResult | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefineMetaFromCode(code);
}
