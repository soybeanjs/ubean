import { readFile } from 'node:fs/promises';
import { HTTP_METHODS } from './types';
import type { HttpMethod, RouteMeta } from './types';

const EXPORT_NAMED_REGEX = /export\s+(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)?(\w+)/g;
const EXPORT_LIST_REGEX = /export\s*\{([^}]+)\}/g;
const EXPORT_DEFINE_META_REGEX = /defineMeta\s*\(/;
const EXPORT_DEFINE_VALIDATOR_REGEX = /defineValidator\s*\(/;
const EXPORT_CONST_META_REGEX = /export\s+const\s+meta\s*=\s*(\{[\s\S]*?\})(?:\s*;|\s*$)/m;
const META_PUBLIC_REGEX = /public\s*:\s*(true|false)/;
const META_OPENAPI_REGEX = /openAPI\s*:/;

export interface DetectExportsResult {
  exports: string[];
  httpMethods: Lowercase<HttpMethod>[];
  hasMeta: boolean;
  hasValidator: boolean;
  fileMeta?: RouteMeta;
}

export async function detectHttpExports(filePath: string): Promise<DetectExportsResult> {
  const code = await readFile(filePath, 'utf-8');
  return detectHttpExportsFromCode(code);
}

export function detectHttpExportsFromCode(code: string): DetectExportsResult {
  const exports = new Set<string>();
  const httpMethods: Lowercase<HttpMethod>[] = [];

  let match: RegExpExecArray | null;

  EXPORT_NAMED_REGEX.lastIndex = 0;
  while ((match = EXPORT_NAMED_REGEX.exec(code)) !== null) {
    const name = match[1];
    exports.add(name);
    const lower = name.toLowerCase() as Lowercase<HttpMethod>;
    if (HTTP_METHODS.includes(name as HttpMethod) && !httpMethods.includes(lower)) {
      httpMethods.push(lower);
    }
  }

  EXPORT_LIST_REGEX.lastIndex = 0;
  while ((match = EXPORT_LIST_REGEX.exec(code)) !== null) {
    const list = match[1];
    for (const item of list.split(',')) {
      const name = item
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) {
        exports.add(name);
        const upper = name.toUpperCase() as HttpMethod;
        const lower = name.toLowerCase() as Lowercase<HttpMethod>;
        if (HTTP_METHODS.includes(upper) && !httpMethods.includes(lower)) {
          httpMethods.push(lower);
        }
      }
    }
  }

  const hasDefineMeta = EXPORT_DEFINE_META_REGEX.test(code);
  const hasValidator = EXPORT_DEFINE_VALIDATOR_REGEX.test(code);
  const fileMeta = extractFileMeta(code);
  const hasMeta = hasDefineMeta || !!fileMeta;

  return {
    exports: [...exports],
    httpMethods,
    hasMeta,
    hasValidator,
    fileMeta
  };
}

function extractFileMeta(code: string): RouteMeta | undefined {
  const match = code.match(EXPORT_CONST_META_REGEX);
  if (!match) return undefined;

  const metaBlock = match[1];
  const meta: RouteMeta = {};

  const publicMatch = metaBlock.match(META_PUBLIC_REGEX);
  if (publicMatch) {
    meta.public = publicMatch[1] === 'true';
  }

  if (META_OPENAPI_REGEX.test(metaBlock)) {
    meta.openAPI = {};
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}
