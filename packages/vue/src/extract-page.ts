import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { PageHead, PageMeta } from './types';
import { extractMacroArgument, extractScriptBlocks, findMacroCall, parseScriptAst, pickDefinePageBlock } from './ast';

/**
 * `definePage(...)` 宏参数提取器(构建期)。
 *
 * 所有权:`@ubean/vue`;`@ubean/scan` re-export `extractDefinePage*` 保持
 * 向后兼容,其服务端 `defineHandlerMeta` 提取复用下方导出的通用
 * `extractCallObject`。
 *
 * 解析走 AST(`./ast.ts`,基于 `vue/compiler-sfc`)—— 此前是手写的括号平衡
 * 扫描 + 对象字面量解析器,遇到注释 / spread / 非字面量值会**静默丢字段**。
 * 现在不支持的字段只丢它自己,并通过 `console.warn` 说明原因。
 */

/** 轻量告警(去重)—— 本包零 `@ubean/*` 硬依赖,不用 @ubean/logger。 */
const _warned = new Set<string>();
function warn(message: string): void {
  if (_warned.has(message)) return;
  _warned.add(message);
  console.warn(`[ubean/vue] ${message}`);
}

/** 判断源码是不是 SFC(用于在未显式传文件名时推断解析模式)。 */
function inferFileName(code: string, fileName?: string): string {
  if (fileName) return fileName;
  return /<script[\s>]|<template[\s>]/.test(code) ? 'page.vue' : 'page.ts';
}

/** 提取 `funcName({...})` 的参数对象(块选择:优先 `<script setup>`)。 */
function extractFromSource(code: string, funcName: string, fileName?: string): Record<string, unknown> | null {
  const blocks = extractScriptBlocks(code, inferFileName(code, fileName));
  if (!blocks || blocks.length === 0) return null;

  const block = pickDefinePageBlock(blocks);
  if (!block) return null;

  const ast = parseScriptAst(block.content, block.lang === 'vue' ? 'page.ts' : `page.${block.lang}`);
  if (!ast) return null;

  const call = findMacroCall(ast, funcName);
  if (!call) return null;

  const extracted = extractMacroArgument(call);
  if (!extracted) return null;

  for (const { key, reason } of extracted.dropped) {
    warn(
      `${funcName}(): 字段 \`${key}\` 无法在构建期静态求值(${reason}),已忽略。` +
        `只支持字面量对象 / 数组 / 字符串 / 数字 / 布尔;需要在构建期读到的字段请写成字面量。`
    );
  }

  return extracted.parsed;
}

/**
 * 通用宏调用提取:在代码中查找 `funcName({...})` 形式的调用并解析其
 * 对象字面量参数。供本包的 `definePage` 提取与 `@ubean/scan` 的
 * `defineHandlerMeta` 提取共用(单一解析器实现)。
 */
export function extractCallObject(code: string, funcName: string, fileName?: string): Record<string, unknown> | null {
  return extractFromSource(code, funcName, fileName);
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

/**
 * 从源码提取 `definePage` 元数据。
 *
 * @param code 源码(SFC 或纯脚本)
 * @param fileName 可选文件名(用于选择 TS / TSX / SFC 解析模式);不传时按源码内容推断
 */
export function extractDefinePageFromCode(code: string, fileName?: string): PageMeta | null {
  const parsed = extractFromSource(code, 'definePage', fileName);
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
  // 布尔值原样保留（省略即视为 `true`，消费端用 `!== false` 判定）。
  if (parsed.routable === false || parsed.routable === true) result.routable = parsed.routable;
  if (parsed.meta && typeof parsed.meta === 'object') result.meta = parsed.meta as PageMeta['meta'];
  if (typeof parsed.requiresAuth === 'boolean') result.requiresAuth = parsed.requiresAuth;
  if (typeof parsed.cache === 'boolean') result.cache = parsed.cache;
  if (typeof parsed.transition === 'string') result.transition = parsed.transition;
  if (parsed.ssr === false || parsed.ssr === true || parsed.ssr === 'streaming' || parsed.ssr === 'data-only') {
    result.ssr = parsed.ssr;
  }

  const head = normalizePageHead(parsed.head);
  if (head) result.head = head;

  return result;
}

export async function extractDefinePage(filePath: string): Promise<PageMeta | null> {
  const code = await readFile(filePath, 'utf-8');
  return extractDefinePageFromCode(code, basename(filePath));
}
