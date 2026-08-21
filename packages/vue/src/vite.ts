import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { Plugin, ViteDevServer } from 'vite';
import { join, relative, isAbsolute } from 'pathe';
import { scanPages, extractSlotAndIntercept } from './scan-pages';
import type { ScanPagesResult } from './types';
import { generatePagesModuleSource, generateTypedRouter, generateVirtualModuleDts } from './virtual-pages';

/**
 * `@ubean/vue/vite` —— 精简客户端路由 Vite 插件(页面路由唯一所有者)。
 *
 * 能力:
 * - 多 `pagesDir` / `layoutsDir` 扫描(先到先得去重)
 * - reuse 路由、特殊页(404/loading/error)、并行路由 `@slot/`、拦截路由
 * - `[param=matcher]` 语法(matchers 注入 `route.meta`)
 * - markdown 页面(opt-in,默认 false,`@ubean/markdown` 按需加载)
 * - 页面级 head(opt-in,默认 false,写入 `route.meta.head`)
 * - `typed-router.d.ts` 生成(RouteNamedMap 完整类型推断,产物在 `dtsDir`,默认 `.ubean`)
 *
 * 框架层(`@ubean/vite`)通过 `generatePagesModuleSource` /
 * `scanPages` / `generateTypedRouter` 复用同一套生成器。
 */

export const VUE_ROUTES_MODULE_ID = 'virtual:ubean-vue-routes';
const RESOLVED_MODULE_ID = `\0${VUE_ROUTES_MODULE_ID}`;

export interface UbeanVueViteOptions {
  /** 页面目录(相对项目根或绝对),支持多目录。默认 `'src/pages'`。 */
  pagesDir?: string | string[];
  /** 布局目录(相对项目根或绝对),支持多目录。默认 `'src/layouts'`。 */
  layoutsDir?: string | string[];
  /**
   * 页面文件扩展名。默认 `['vue', 'tsx', 'jsx']`;markdown 开启后自动追加
   * 对应的 `.md` / `.mdx`。`.reuse.ts` 元数据文件为独立约定,始终参与扫描。
   */
  extensions?: string[];
  /** 额外 glob ignore。 */
  ignore?: string[];
  /** 是否生成 `typed-router.d.ts`。默认 `true`。 */
  generateTypes?: boolean;
  /**
   * 类型声明产物目录(相对项目根或绝对路径)。默认 `'.ubean'` ——
   * `ubean-vue-routes.d.ts` 与 `typed-router.d.ts` 都生成在该目录下,
   * 与框架层(`@ubean/vite` 的 auto-imports dts)保持同一约定。
   */
  dtsDir?: string;
  /**
   * Markdown 页面支持,默认 `false`(零成本)。
   * - `true`:扫描并渲染 `.md` + `.mdx`
   * - `'md'`:仅 `.md`
   * - `'mdx'`:仅 `.mdx`
   * 需安装 `@ubean/markdown`(构建期按需加载)。
   */
  markdown?: boolean | 'mdx' | 'md';
  /**
   * 页面级 head 支持,默认 `false`。开启后 `definePage({ head })` 与
   * frontmatter `head` 写入 `route.meta.head`(配合 `setupPageHeadGuard`)。
   */
  head?: boolean;
}

/** 剥离 `definePage({...})` 宏调用(构建期,扫描后源码中不再需要)。 */
export function stripDefinePageCalls(code: string): string {
  // `(^|\n)` 保留行首换行,避免把多行粘在一起;
  // `[\s\S]*?}\s*\)` 惰性匹配到首个「} + )」组合 —— 对象内部嵌套 `}`
  // 后面跟的是 `,` 或 `}`,不会提前终止。
  return code.replace(/(^|\n)[ \t]*(?:export[ \t]+)?definePage\s*\(\s*\{[\s\S]*?\}\s*\)[ \t]*;?/g, '$1');
}

/**
 * 扫描客户端页面/布局(对外工具函数,`root` 为项目根)。
 */
export async function scanClientPages(root: string, options: UbeanVueViteOptions = {}): Promise<ScanPagesResult> {
  return scanPages({
    cwd: root,
    srcDir: root,
    pagesDir: options.pagesDir ?? 'src/pages',
    layoutsDir: options.layoutsDir ?? 'src/layouts',
    extensions: options.extensions,
    ignore: options.ignore,
    markdown: options.markdown,
    head: options.head
  });
}

/** 按需加载的 `@ubean/markdown` API(仅 markdown 开启时加载)。 */
type MarkdownApi = {
  parseFrontmatter: (source: string) => { data: Record<string, unknown>; content: string };
  markdownToHtml: (source: string, options?: Record<string, unknown>) => string;
  compileMdx?: (source: string, options?: Record<string, unknown>) => Promise<{ code: string }>;
};

const _warned = new Set<string>();
function warn(message: string): void {
  if (_warned.has(message)) return;
  _warned.add(message);
  console.warn(`[ubean/vue] ${message}`);
}

export function ubeanVueVite(options: UbeanVueViteOptions = {}): Plugin {
  let root = process.cwd();
  let scan: ScanPagesResult | null = null;
  let markdownApi: MarkdownApi | null = null;
  const markdownEnabled = options.markdown === true || options.markdown === 'md' || options.markdown === 'mdx';
  const mdxEnabled = options.markdown === true || options.markdown === 'mdx';

  async function loadMarkdownApi(): Promise<MarkdownApi | null> {
    if (!markdownEnabled) return null;
    try {
      const mod = (await import('@ubean/markdown')) as MarkdownApi;
      if (typeof mod.parseFrontmatter === 'function' && typeof mod.markdownToHtml === 'function') {
        return mod;
      }
    } catch {
      // fall through
    }
    warn('`markdown` is enabled but `@ubean/markdown` is not installed — markdown pages will not render.');
    return null;
  }

  async function rescan(): Promise<ScanPagesResult> {
    scan = await scanClientPages(root, options);
    if (options.generateTypes !== false) {
      await writeTypedRouter();
    }
    return scan;
  }

  async function writeTypedRouter(): Promise<void> {
    if (!scan) return;
    // 两个产物(统一写入 dtsDir,默认 `.ubean`,与框架层 dts 约定一致):
    // - `ubean-vue-routes.d.ts`(script)—— 虚拟模块的环境声明;script
    //   上下文的 `declare module` 才能注册不存在的模块。
    // - `typed-router.d.ts`(module)—— vue-router/auto-routes 的
    //   RouteNamedMap 增强;module 上下文的 `declare module` 才是模块
    //   增强而非遮蔽真实包。
    const dtsDirOption = options.dtsDir ?? '.ubean';
    const dtsDir = isAbsolute(dtsDirOption) ? dtsDirOption : join(root, dtsDirOption);
    const files: Array<[string, string]> = [
      [join(dtsDir, 'ubean-vue-routes.d.ts'), generateVirtualModuleDts(scan, VUE_ROUTES_MODULE_ID)],
      [join(dtsDir, 'typed-router.d.ts'), generateTypedRouter(scan, VUE_ROUTES_MODULE_ID)]
    ];
    for (const [outPath, content] of files) {
      try {
        const prev = await readFile(outPath, 'utf-8').catch(() => null);
        if (prev !== content) {
          await mkdir(dtsDir, { recursive: true });
          await writeFile(outPath, content, 'utf-8');
        }
      } catch {
        // 只读文件系统等场景下静默跳过
      }
    }
  }

  function isUnderPagesDir(id: string): boolean {
    const dirs = (Array.isArray(options.pagesDir) ? options.pagesDir : [options.pagesDir ?? 'src/pages']).map(d =>
      isAbsolute(d) ? d : join(root, d)
    );
    return dirs.some(d => id.startsWith(`${d}/`) || id.startsWith(`${d}\\`));
  }

  return {
    name: 'ubean-vue-routes',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
    },

    async buildStart() {
      markdownApi = await loadMarkdownApi();
      await rescan();
    },

    resolveId(id) {
      if (id === VUE_ROUTES_MODULE_ID) {
        return RESOLVED_MODULE_ID;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_MODULE_ID) {
        if (!scan) {
          // buildStart 之前的极端时序 —— 现场补扫
          return rescan().then(result => generatePagesModuleSource(result));
        }
        return generatePagesModuleSource(scan);
      }
      return null;
    },

    transform(code, id) {
      const [filePath] = id.split('?', 2);
      if (!isUnderPagesDir(filePath)) {
        return null;
      }

      // Markdown 页面渲染(opt-in)
      if (filePath.endsWith('.md') || (mdxEnabled && filePath.endsWith('.mdx'))) {
        if (!markdownApi) {
          return null;
        }
        const isMdx = filePath.endsWith('.mdx');
        if (isMdx && typeof markdownApi.compileMdx === 'function') {
          return markdownApi.compileMdx(code, { filePath: relative(root, filePath) }).then(result => ({
            code: result.code,
            map: null
          }));
        }
        const { data: frontmatter, content } = markdownApi.parseFrontmatter(code);
        const html = markdownApi.markdownToHtml(content);
        const componentCode = [
          `import { h } from 'vue';`,
          `export const frontmatter = ${JSON.stringify(frontmatter)};`,
          `const _html = ${JSON.stringify(html)};`,
          `export default {`,
          `  name: ${JSON.stringify(`MdPage_${relative(root, filePath).replace(/[^\w]/g, '_')}`)},`,
          `  data() { return { frontmatter }; },`,
          `  render() { return h('div', { class: 'ubean-md-page', innerHTML: _html }); }`,
          `};`
        ].join('\n');
        return { code: componentCode, map: null };
      }

      // definePage 宏剥离(.vue / .ts / .tsx / .jsx 页面)。tsx/jsx 与
      // .vue 一样走构建期提取,若不剥离会在运行时抛 `definePage is not defined`。
      if (/\.(vue|tsx?|jsx?)$/.test(filePath) && code.includes('definePage')) {
        return { code: stripDefinePageCalls(code), map: null };
      }

      return null;
    },

    configureServer(server: ViteDevServer) {
      const pageExts = markdownEnabled ? /\.(vue|tsx?|jsx?|md|mdx)$/ : /\.(vue|tsx?|jsx?)$/;
      const onChange = (file: string) => {
        if (!pageExts.test(file) || !isUnderPagesDir(file)) return;
        // 页面文件变更:重扫 + 失效虚拟模块 + 全量刷新(路由表在模块初始化时捕获)
        rescan().then(() => {
          const mod = server.moduleGraph.getModuleById(RESOLVED_MODULE_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        });
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      // 内容变更由 vue 插件 HMR 处理;布局/页面新增删除需要重建路由表
    }
  };
}

export { scanPages, extractSlotAndIntercept, generatePagesModuleSource, generateTypedRouter, generateVirtualModuleDts };
export type { LocaleRouteCompileOptions, PagesModuleInput } from './virtual-pages';
// 路由纯函数 / 名称生成 / definePage 提取(聚合层 `@ubean/scan` 与
// 框架层从这里 re-export,单一来源)
export { filePathToRoute, stripRouteGroups, parseMatchers } from './route-path';
export type { ParsedRoutePath } from './route-path';
export { generateRouteName, generateLayoutName } from './route-name';
export { extractCallObject, extractDefinePage, extractDefinePageFromCode, normalizePageHead } from './extract-page';

export default ubeanVueVite;
