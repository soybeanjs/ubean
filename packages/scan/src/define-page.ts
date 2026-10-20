import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { extractCallObject } from '@ubean/vue/vite';
import type { DefineMetaResult } from './types';

// 页面路由的 `definePage` 提取器已迁移至 `@ubean/vue`(页面路由唯一所有者):
// - `extractDefinePage` / `extractDefinePageFromCode`:`@ubean/vue/vite`
// - 通用宏调用解析器:`@ubean/vue/vite` 的 `extractCallObject`(单一实现)
//
// 本文件只保留服务端 `defineHandlerMeta` 提取(API 路由 meta)。

export { extractDefinePage, extractDefinePageFromCode } from '@ubean/vue/vite';

export function extractDefineMetaFromCode(code: string, fileName?: string): DefineMetaResult | null {
  // 不再自建 `extractScriptContent`:块选择（`<script setup>` 优先）由
  // `@ubean/vue` 的同一份 AST 基础设施负责，API 路由文件通常是纯 TS，
  // 没有 `<script>` 块时整份代码就是一个块。
  const parsed = extractCallObject(code, 'defineHandlerMeta', fileName);
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
  return extractDefineMetaFromCode(code, basename(filePath));
}
