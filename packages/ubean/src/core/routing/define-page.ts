import { readFile } from 'node:fs/promises';

export interface PageMeta {
  name?: string;
  path?: string;
  layout?: string;
  reuse?: string;
  meta?: Record<string, unknown>;
  middleware?: string | string[];
  public?: boolean;
}

const DEFINE_PAGE_REGEX = /definePage\s*\(\s*(\{[\s\S]*?\})\s*\)/;

const SIMPLE_STRING_VALUE = /'([^']*)'|"([^"]*)"/;
const SIMPLE_BOOLEAN_VALUE = /(true|false)/;

export async function extractDefinePage(filePath: string): Promise<PageMeta | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefinePageFromCode(code);
}

export function extractDefinePageFromCode(code: string): PageMeta | null {
  if (code.includes('<template>')) {
    const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      return extractDefinePageFromCode(scriptMatch[1]);
    }
    return null;
  }

  const match = code.match(DEFINE_PAGE_REGEX);
  if (!match) return null;

  const objStr = match[1];
  return parseObjectLiteral(objStr);
}

function parseObjectLiteral(code: string): PageMeta {
  const result: PageMeta = {};

  const keyValueRegex = /(\w+)\s*:\s*(.+?)(?=,\s*\w+\s*:|,?\s*$)/gs;
  let match: RegExpExecArray | null;

  while ((match = keyValueRegex.exec(code)) !== null) {
    const key = match[1] as keyof PageMeta;
    let value = match[2].trim();

    if (value.endsWith(',')) value = value.slice(0, -1).trim();

    const strMatch = value.match(SIMPLE_STRING_VALUE);
    if (strMatch) {
      (result as any)[key] = strMatch[1] ?? strMatch[2];
      continue;
    }

    const boolMatch = value.match(SIMPLE_BOOLEAN_VALUE);
    if (boolMatch) {
      (result as any)[key] = boolMatch[1] === 'true';
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      (result as any)[key] = items;
      continue;
    }

    try {
      (result as any)[key] = JSON.parse(value);
    } catch {
      (result as any)[key] = value;
    }
  }

  return result;
}
