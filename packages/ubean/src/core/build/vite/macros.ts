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

  // Only consume leading whitespace on the same line (spaces/tabs, not newlines).
  // Consuming newlines caused comments above the macro to merge with the next
  // statement after stripping (e.g. `// comment\nuseHead({` on a single line).
  while (start > 0 && /[ \t]/.test(code[start - 1])) start--;

  if (code[end] === ';') {
    end++;
  }

  // Only consume trailing whitespace on the same line (spaces/tabs, not newlines).
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

function transformVueMacros(code: string): string {
  return code.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (_match, attrs: string, content: string) => {
    const stripped = stripMacros(content);
    return `<script${attrs}>${stripped}</script>`;
  });
}
