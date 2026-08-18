import { readFile } from 'node:fs/promises';
import { extractCallObject } from '@ubean/vue/vite';
import type { DefineMetaResult } from './types';

export type { PageMeta, DefineMetaResult } from './types';

// 页面路由的 `definePage` 提取器已迁移至 `@ubean/vue`(页面路由唯一所有者):
// - `extractDefinePage` / `extractDefinePageFromCode`:`@ubean/vue/vite`
// - 通用宏调用解析器:`@ubean/vue/vite` 的 `extractCallObject`(单一实现)
//
// 本文件只保留服务端 `defineHandlerMeta` 提取(API 路由 meta)。

export { extractDefinePage, extractDefinePageFromCode } from '@ubean/vue/vite';

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

export function extractDefineMetaFromCode(code: string): DefineMetaResult | null {
  const scriptContent = extractScriptContent(code);
  if (!scriptContent) return null;

  const parsed = extractCallObject(scriptContent, 'defineHandlerMeta');
  if (!parsed) return null;

  const result: DefineMetaResult = {};
  if (typeof parsed.requiresAuth === 'boolean') result.requiresAuth = parsed.requiresAuth;
  if (parsed.meta && typeof parsed.meta === 'object') {
    result.meta = parsed.meta as Record<string, unknown>;
  } else {
    const knownKeys = new Set(['requiresAuth', 'meta']);
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

export async function extractDefineMeta(filePath: string): Promise<DefineMetaResult | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefineMetaFromCode(code);
}
