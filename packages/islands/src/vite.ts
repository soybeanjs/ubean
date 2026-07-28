import { resolve, dirname } from 'node:path';
import type { Plugin, ResolvedConfig as ViteResolvedConfig } from 'vite';

export type ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only';

const CLIENT_DIRECTIVES: ClientDirective[] = [
  'client:load',
  'client:idle',
  'client:visible',
  'client:media',
  'client:only'
];

const DIRECTIVE_RE = /\bclient:(load|idle|visible|media|only)\b/;

function isVueSfc(id: string): boolean {
  return /\.vue(?:\?.*)?$/.test(id) && !id.includes('&type=');
}

/**
 * 判断 id 是否为 SFC 主模块（非 `?vue&type=...` 子查询）。
 *
 * 收集 island 组件时需要同时访问 `<script setup>` 与 `<template>` 块，
 * 因此只对 SFC 主模块运行；模板子查询只含模板内容，无法解析 import。
 */
function isMainVueSfc(id: string): boolean {
  return /\.vue$/.test(id.split('?')[0]);
}

// ============== Islands 自动注册：组件收集与 registry 生成 ==============

/**
 * 一个 island 组件的注册条目。
 *
 * - `name`：模板中使用的标签名（如 `<IslandCounter client:load />` 中的 `IslandCounter`）
 * - `importPath`：组件文件的绝对路径或 bare specifier（来自 `<script setup>` 的 import）
 * - `sourceFile`：发现该 island 的源文件绝对路径，用于调试与 HMR 失效
 */
export interface IslandComponentEntry {
  name: string;
  importPath: string;
  sourceFile: string;
}

/** Plugin 内部的 island 组件收集表：组件名 → 条目 */
export type IslandComponentMap = Map<string, IslandComponentEntry>;

/**
 * 从 `<script setup>` / `<script>` 内容中解析 default import 与 `default as` 别名，
 * 建立 { 局部名 → import 路径 } 映射。
 *
 * 仅处理静态 import 语句；动态 import、re-export 不在识别范围内
 * （这类用法无法静态分析 → 由运行时 `getComponent` 兜底或用户手动注册）。
 *
 * 支持形式：
 *   import Foo from './Foo.vue'
 *   import Foo from "some-lib"
 *   import Foo, { bar } from './Foo.vue'
 *   import { default as Foo, bar } from './Foo.vue'
 *   import { default as Foo } from './Foo.vue'
 */
export function parseScriptImports(scriptContent: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!scriptContent) return map;

  // 1) default import: import Foo from '...'
  //    也匹配 `import Foo, { bar } from '...'` 与 `import Foo, * as ns from '...'`
  const defaultRe = /import\s+([A-Za-z_$][\w$]*)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*))?\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = defaultRe.exec(scriptContent)) !== null) {
    const localName = m[1];
    const importPath = m[2];
    if (!map.has(localName)) map.set(localName, importPath);
  }

  // 2) named default-as: import { default as Foo } from '...'
  //    也匹配 `import { bar, default as Foo } from '...'`
  const namedDefaultRe = /import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = namedDefaultRe.exec(scriptContent)) !== null) {
    const clause = m[1];
    const importPath = m[2];
    // 在 named clause 中查找 `default as Foo`
    const asMatch = clause.match(/\bdefault\s+as\s+([A-Za-z_$][\w$]*)/);
    if (asMatch) {
      const localName = asMatch[1];
      if (!map.has(localName)) map.set(localName, importPath);
    }
  }

  return map;
}

/**
 * 扫描模板内容，返回所有带 `client:xxx` 指令的组件标签名集合。
 *
 * 复用 `findTagAt` 的标签解析逻辑，确保与 `transformTemplate` 的识别规则一致
 * （仅匹配首字母大写的组件标签）。
 *
 * 与 `transformTemplate` 对称：非 island 标签会递归扫描其 innerHTML，
 * island 标签不递归（其子内容属于该 island 的 SSR 输出，不作为独立 island）。
 */
export function scanIslandDirectiveNames(template: string): Set<string> {
  const names = new Set<string>();
  scan(template);
  return names;

  function scan(t: string): void {
    let pos = 0;
    while (pos < t.length) {
      const lt = t.indexOf('<', pos);
      if (lt === -1) break;
      if (t[lt + 1] === '/' || t[lt + 1] === '!' || t[lt + 1] === '?') {
        pos = lt + 1;
        continue;
      }
      const tag = findTagAt(t, lt);
      if (!tag) {
        pos = lt + 1;
        continue;
      }
      const hasDirective = CLIENT_DIRECTIVES.some(d => tag.attrs.has(d));
      if (hasDirective) {
        names.add(tag.tagName);
      }
      // 递归扫描 innerHTML 以发现嵌套的 island（无论当前标签是否为 island）。
      // 即使嵌套在另一个 island 内的组件在 SSR 时不会被单独转换为 <ubean-island>,
      // 仍需将其收集到 registry 中,确保组件可被解析（如作为 slot 内容渲染时）。
      // 过度收集（注册未实际使用的组件）只会带来微量 bundle 开销,
      // 而遗漏收集会导致 island 静默不水合。
      if (!tag.selfClosing) {
        scan(tag.innerHTML);
      }
      pos = tag.end;
    }
  }
}

/**
 * 将相对 import 路径解析为绝对路径；bare specifier（如 `vue`、`some-lib`）原样返回。
 */
export function resolveIslandImportPath(importPath: string, sourceFile: string): string {
  if (importPath.startsWith('.')) {
    return resolve(dirname(sourceFile), importPath);
  }
  return importPath;
}

/**
 * 从 Vue SFC 源码中收集 island 组件信息。
 *
 * 步骤：
 * 1. 提取 `<script setup>` / `<script>` 内容
 * 2. 解析 import 语句，建立 { 局部名 → import 路径 } 映射
 * 3. 扫描模板中的 `<Comp client:xxx />` 指令，得到组件名集合
 * 4. 交集：既在 import 映射中、又在 island 指令集合中的组件
 * 5. 将相对 import 路径解析为绝对路径
 *
 * 对未在 import 映射中的 island 组件（如全局注册、动态 import、defineAsyncComponent），
 * 输出警告，提示用户手动注册。
 */
export function collectIslandComponents(code: string, sourceFile: string): IslandComponentEntry[] {
  const scriptContent = extractScriptBlock(code);
  const templateContent = extractTemplateBlock(code)?.content ?? '';

  if (!templateContent) return [];
  if (!DIRECTIVE_RE.test(templateContent)) return [];

  const importMap = parseScriptImports(scriptContent);
  const islandNames = scanIslandDirectiveNames(templateContent);

  const entries: IslandComponentEntry[] = [];
  for (const name of islandNames) {
    const importPath = importMap.get(name);
    if (!importPath) {
      // 组件可能是全局注册、来自 unplugin-vue-components 自动导入、或 defineAsyncComponent 包装
      // 这类用法无法静态分析 → 记录警告，留待用户手动注册或通过 getComponent 兜底
      // eslint-disable-next-line no-console
      console.warn(
        `[ubean:islands] Component "${name}" used with client:xxx directive in ${sourceFile} has no corresponding static import in <script setup>. ` +
          `It will not be auto-registered. Add it manually via hydrateIslands({ components: { ${name}: YourComp } }) or pass a getComponent() resolver.`
      );
      continue;
    }
    const absolutePath = resolveIslandImportPath(importPath, sourceFile);
    entries.push({ name, importPath: absolutePath, sourceFile });
  }
  return entries;
}

/**
 * 提取 SFC 中 `<script setup>` 或 `<script>` 块的内容。
 *
 * 优先返回 `<script setup>`；若不存在则返回普通 `<script>`；都没有则返回空字符串。
 * 与 `extractTemplateBlock` 对称，使用简单字符串匹配避免引入 SFC 编译器依赖。
 */
function extractScriptBlock(code: string): string {
  // 优先 <script setup>
  const setupOpenRe = /<script\s+[^>]*setup[^>]*>/;
  const setupMatch = code.match(setupOpenRe);
  if (setupMatch && setupMatch.index !== undefined) {
    const openTagEnd = setupMatch.index + setupMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) return code.slice(openTagEnd, closeIdx);
  }

  // 退回普通 <script>（排除带 setup 的，已处理过）
  const plainOpenRe = /<script(?!\s[^>]*setup)[^>]*>/;
  const plainMatch = code.match(plainOpenRe);
  if (plainMatch && plainMatch.index !== undefined) {
    const openTagEnd = plainMatch.index + plainMatch[0].length;
    const closeIdx = code.indexOf('</script>', openTagEnd);
    if (closeIdx !== -1) return code.slice(openTagEnd, closeIdx);
  }

  return '';
}

/**
 * 生成 `virtual:ubean-islands-registry` 模块内容。
 *
 * 输出示例：
 * ```ts
 * import __island_0 from '/src/components/IslandCounter.vue';
 * import __island_1 from '/src/components/IslandMedia.vue';
 *
 * export const islands = {
 *   "IslandCounter": __island_0,
 *   "IslandMedia": __island_1
 * };
 * ```
 *
 * 当 map 为空时，返回 `export const islands = {};` 保证下游 import 不会因模块缺失而报错。
 */
export function generateRegistryModule(components: IslandComponentMap): string {
  if (components.size === 0) {
    return 'export const islands = {};';
  }

  const imports: string[] = [];
  const entries: string[] = [];

  let idx = 0;
  for (const [name, entry] of components) {
    const varName = `__island_${idx++}`;
    imports.push(`import ${varName} from ${JSON.stringify(entry.importPath)};`);
    entries.push(`  ${JSON.stringify(name)}: ${varName}`);
  }

  return [...imports, '', 'export const islands = {', ...entries, '};'].join('\n');
}

function extractTemplateBlock(
  code: string
): { start: number; end: number; content: string; attrs: string; openTagEnd: number } | null {
  const openMatch = code.match(/<template([^>]*)>/);
  if (!openMatch) return null;
  const openTagEnd = openMatch.index! + openMatch[0].length;
  const closeTag = '</template>';
  const closeIdx = code.indexOf(closeTag, openTagEnd);
  if (closeIdx === -1) return null;
  return {
    start: openMatch.index!,
    end: closeIdx + closeTag.length,
    content: code.slice(openTagEnd, closeIdx),
    attrs: openMatch[1] || '',
    openTagEnd
  };
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

interface TagMatch {
  tagName: string;
  fullOpenTag: string;
  selfClosing: boolean;
  attrs: Map<string, string | true>;
  attrsStr: string;
  start: number;
  openTagEnd: number;
  end: number;
  innerHTML: string;
}

function findTagAt(template: string, pos: number): TagMatch | null {
  const lt = template.indexOf('<', pos);
  if (lt === -1 || lt !== pos) return null;
  if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') return null;

  const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
  if (!nameMatch) return null;
  const tagName = nameMatch[1];

  const gt = findClosingAngleBracket(template, lt + 1 + tagName.length);
  if (gt === -1) return null;

  const openTagContent = template.slice(lt, gt + 1);
  const selfClosing = template[gt - 1] === '/';
  const attrsStr = template.slice(lt + 1 + tagName.length, selfClosing ? gt - 1 : gt).trim();
  const attrs = parseAttrs(attrsStr);
  const openTagEnd = gt + 1;

  let end = openTagEnd;
  let innerHTML = '';

  if (!selfClosing) {
    const closeTag = `</${tagName}>`;
    const closePos = findMatchingClose(template, lt, tagName);
    if (closePos === -1) return null;
    innerHTML = template.slice(openTagEnd, closePos);
    end = closePos + closeTag.length;
  }

  return {
    tagName,
    fullOpenTag: openTagContent,
    selfClosing,
    attrs,
    attrsStr,
    start: lt,
    openTagEnd,
    end,
    innerHTML
  };
}

function findClosingAngleBracket(str: string, start: number): number {
  let inQuote: string | null = null;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      else if (ch === '>') return i;
    }
  }
  return -1;
}

function findMatchingClose(template: string, openLt: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}[\\s/>]`, 'g');
  const closeRe = new RegExp(`</${tagName}>`, 'g');
  openRe.lastIndex = openLt + 1;
  closeRe.lastIndex = openLt + 1;
  let depth = 1;

  while (depth > 0) {
    const nextOpen = openRe.exec(template);
    const nextClose = closeRe.exec(template);

    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + tagName.length + 2;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      openRe.lastIndex = nextClose.index + tagName.length + 3;
    }
  }
  return -1;
}

function parseAttrs(str: string): Map<string, string | true> {
  const map = new Map<string, string | true>();
  const re = /(?:^|\s)([:@a-zA-Z_][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\{[^}]*\}|[^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const name = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : true;
    map.set(name, val);
  }
  return map;
}

function collectStaticProps(attrs: Map<string, string | true>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, val] of attrs) {
    if (key.startsWith('client:')) continue;
    if (key.startsWith('v-') || key.startsWith('@') || key.startsWith(':')) continue;
    if (key === 'key' || key === 'ref') continue;
    if (val === true) {
      props[key] = true;
    } else {
      props[key] = val;
    }
  }
  return props;
}

function transformTemplate(template: string, islandCounter: { count: number }, filePath: string): string {
  let out = '';
  let pos = 0;

  while (pos < template.length) {
    const lt = template.indexOf('<', pos);
    if (lt === -1) {
      out += template.slice(pos);
      break;
    }
    out += template.slice(pos, lt);

    if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
    if (!nameMatch) {
      const gt = findClosingAngleBracket(template, lt + 1);
      if (gt === -1) {
        out += template.slice(lt);
        break;
      }
      out += template.slice(lt, gt + 1);
      pos = gt + 1;
      continue;
    }

    const tag = findTagAt(template, lt);
    if (!tag) {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const directive = CLIENT_DIRECTIVES.find(d => tag.attrs.has(d));
    if (!directive) {
      const inner = tag.selfClosing ? '' : transformTemplate(tag.innerHTML, islandCounter, filePath);
      out += tag.fullOpenTag;
      out += inner;
      if (!tag.selfClosing) out += `</${tag.tagName}>`;
      pos = tag.end;
      continue;
    }

    islandCounter.count++;
    const islandId = `island-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}-${islandCounter.count}`;

    const mediaRaw = tag.attrs.get('client:media');
    let mediaStr = '';
    if (directive === 'client:media' && mediaRaw && mediaRaw !== true) {
      const m = String(mediaRaw).replace(/^["']|["']$/g, '');
      mediaStr = ` data-media="${escapeAttr(m)}"`;
    }

    const props = collectStaticProps(tag.attrs);
    const propsJson = escapeAttr(JSON.stringify(props));

    out += `<ubean-island data-island-id="${islandId}" data-component="${tag.tagName}" data-directive="${directive}" data-props="${propsJson}"${mediaStr}>`;
    out += tag.selfClosing ? '' : tag.innerHTML;
    out += `</ubean-island>`;

    pos = tag.end;
  }

  return out;
}

export function transformVueSfcIslands(code: string, filePath: string): { code: string; islandCount: number } {
  const tpl = extractTemplateBlock(code);
  if (!tpl) return { code, islandCount: 0 };
  if (!DIRECTIVE_RE.test(tpl.content)) return { code, islandCount: 0 };

  const counter = { count: 0 };
  const newContent = transformTemplate(tpl.content, counter, filePath);
  const result = `${code.slice(0, tpl.start)}<template${tpl.attrs}>${newContent}</template>${code.slice(tpl.end)}`;
  return { code: result, islandCount: counter.count };
}

export interface UbeanIslandsPluginOptions {
  enabled?: boolean;
}

/** virtual:ubean-islands-registry 的虚拟模块 ID（遵循 AGENTS.md §8 教训 #7：用 `virtual:ubean-` 前缀） */
export const ISLANDS_REGISTRY_VIRTUAL_ID = 'virtual:ubean-islands-registry';
/** Vite 内部解析后的虚拟模块 ID（`\0` 前缀防止其他插件处理） */
const ISLANDS_REGISTRY_RESOLVED_ID = '\0' + ISLANDS_REGISTRY_VIRTUAL_ID;

export function ubeanIslandsPlugin(_options: UbeanIslandsPluginOptions = {}): Plugin {
  let viteConfig: ViteResolvedConfig;
  let enabled = true;
  // dev 模式下的 ViteDevServer 实例（在 configureServer 中捕获）
  let devServer: import('vite').ViteDevServer | undefined;

  // island 组件收集表：组件名 → 条目（首次发现的 import 路径为准）
  const islandComponents: IslandComponentMap = new Map();
  // 源文件 → 该文件贡献的组件名集合（用于 HMR 重新扫描时清理过期条目）
  const entriesByFile = new Map<string, Set<string>>();

  /**
   * 用某次扫描结果更新 island 组件注册表。
   *
   * - 先清理该源文件之前贡献、现已不再使用的组件条目（若其他文件未引用）
   * - 再添加新条目；同名组件若 import 路径不同 → 警告（首次发现的路径优先）
   * - 返回 registry 是否发生变化（用于决定是否触发 HMR）
   */
  function updateRegistry(entries: IslandComponentEntry[], sourceFile: string): boolean {
    let changed = false;

    // 1) 清理该源文件之前的贡献
    const oldNames = entriesByFile.get(sourceFile);
    if (oldNames) {
      for (const name of oldNames) {
        // 检查其他文件是否还在使用该组件
        let stillUsed = false;
        for (const [otherFile, names] of entriesByFile) {
          if (otherFile === sourceFile) continue;
          if (names.has(name)) {
            stillUsed = true;
            break;
          }
        }
        if (!stillUsed && islandComponents.has(name)) {
          islandComponents.delete(name);
          changed = true;
        }
      }
    }

    // 2) 添加新条目
    const newNames = new Set<string>();
    for (const entry of entries) {
      newNames.add(entry.name);
      const existing = islandComponents.get(entry.name);
      if (!existing) {
        islandComponents.set(entry.name, entry);
        changed = true;
      } else if (existing.importPath !== entry.importPath) {
        // 同名组件在不同文件 import 路径不同 → 警告，首次发现的路径优先
        // eslint-disable-next-line no-console
        console.warn(
          `[ubean:islands] Component "${entry.name}" is imported from different paths:\n` +
            `  existing: "${existing.importPath}" (in ${existing.sourceFile})\n` +
            `  new:      "${entry.importPath}" (in ${sourceFile})\n` +
            `Using the first-seen path. To fix, ensure all imports use the same path.`
        );
      }
    }

    entriesByFile.set(sourceFile, newNames);
    return changed;
  }

  return {
    name: 'ubean:islands',
    enforce: 'pre',

    configResolved(config) {
      viteConfig = config;
      enabled = _options.enabled !== false;
    },

    configureServer(server) {
      devServer = server;
    },

    resolveId(id) {
      if (id === ISLANDS_REGISTRY_VIRTUAL_ID) return ISLANDS_REGISTRY_RESOLVED_ID;
      return undefined;
    },

    load(id) {
      if (id !== ISLANDS_REGISTRY_RESOLVED_ID) return undefined;
      return generateRegistryModule(islandComponents);
    },

    transform(code, id) {
      if (!enabled) return null;
      if (!isVueSfc(id)) return null;
      if (!DIRECTIVE_RE.test(code)) return null;

      const absolutePath = id.split('?')[0];
      const filePath = absolutePath.replace(viteConfig.root, '').replace(/^[/\\]/, '');
      const result = transformVueSfcIslands(code, filePath);

      // 仅对 SFC 主模块运行收集逻辑（?vue&type=template 等子查询只有模板片段，无 <script>）
      if (isMainVueSfc(id)) {
        const collected = collectIslandComponents(code, absolutePath);
        const registryChanged = updateRegistry(collected, absolutePath);

        // dev 模式：registry 变化时失效 virtual module，触发 full-reload
        // 首版用 full-reload 保证正确性；后续可优化为精确 HMR boundary
        if (registryChanged && devServer) {
          const mod = devServer.moduleGraph.getModuleById(ISLANDS_REGISTRY_RESOLVED_ID);
          if (mod) {
            devServer.moduleGraph.invalidateModule(mod);
            devServer.ws.send({ type: 'full-reload' });
          }
        }
      }

      return result;
    }
  };
}
