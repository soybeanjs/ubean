import { readFile } from 'node:fs/promises';
import { join, relative, dirname, basename, extname, isAbsolute } from 'pathe';
import { glob } from 'tinyglobby';
import { extractDefinePageFromCode } from './extract-page';
import { generateRouteName } from './route-name';
import { filePathToRoute } from './route-path';
import type { ScanPagesOptions, ScanPagesResult, ScannedPage, ScannedLayout, PageMeta, PageHead } from './types';

/**
 * 页面/布局扫描器(页面路由所有权归属 `@ubean/vue`)。
 *
 * 能力(从 `@ubean/scan` 沉淀并增强):
 * - 多 `pagesDir` / `layoutsDir`(先到先得去重,可分层叠加目录)
 * - reuse 路由(`.reuse.ts` / `.reuse.js`,纯元数据文件单独注入 `definePage`)+ cache 继承
 * - markdown 页面(opt-in,`@ubean/markdown` 按需加载解析 frontmatter)
 * - 页面级 head(opt-in,`definePage({ head })` / frontmatter `head`)
 * - 特殊页:`404` / `loading` / `error`(仅页面目录根级)
 * - 并行路由 `@slot/`
 * - `[param=matcher]` 语法 → matchers 映射
 *
 * 拦截路由(`(.)` / `(..)` / `(...)` 目录约定)**刻意不支持** —— 扫到标记段直接抛错，见
 * `extractSlotFromPath()` 的说明与 [docs/adr/0010]。
 *
 * `@ubean/scan` 聚合层的 `scanProject` 委托本模块。
 */

/** 轻量告警(去重)—— 保持本包零 `@ubean/*` 硬依赖,不用 @ubean/logger。 */
const _warned = new Set<string>();
function warn(message: string): void {
  if (_warned.has(message)) return;
  _warned.add(message);
  console.warn(`[ubean/vue] ${message}`);
}

/**
 * Optional peer dependency loader for `@ubean/markdown`。
 *
 * 仅当 `markdown` 开启且项目存在 `.md` / `.mdx` 页面时按需加载;
 * 未安装时降级为无 frontmatter 的普通页面并告警一次。
 */
type FrontmatterParser = (source: string) => { data: Record<string, unknown>; content: string };
let _frontmatterParser: FrontmatterParser | null | undefined;

async function getFrontmatterParser(): Promise<FrontmatterParser | null> {
  if (_frontmatterParser !== undefined) return _frontmatterParser;
  try {
    const mod = (await import('@ubean/markdown')) as { parseFrontmatter?: FrontmatterParser };
    if (typeof mod.parseFrontmatter === 'function') {
      _frontmatterParser = mod.parseFrontmatter;
    } else {
      _frontmatterParser = null;
    }
  } catch {
    warn(
      '`markdown` is enabled but `@ubean/markdown` is not installed — ' +
        'frontmatter parsing will be skipped. Install it to enable markdown pages.'
    );
    _frontmatterParser = null;
  }
  return _frontmatterParser;
}

/** Build a `PageHead` from Markdown frontmatter(与 definePage head 校验规则一致)。 */
function buildMarkdownHead(fm?: Record<string, unknown>, enabled?: boolean): PageHead | undefined {
  if (!enabled || !fm || typeof fm.head !== 'object' || fm.head === null) return undefined;

  const fmHead = fm.head as Record<string, unknown>;
  const head: PageHead = {};

  if (typeof fmHead.title === 'string') head.title = fmHead.title;
  if (Array.isArray(fmHead.meta)) head.meta = fmHead.meta as Array<Record<string, string>>;
  if (Array.isArray(fmHead.link)) head.link = fmHead.link as Array<Record<string, string>>;
  if (Array.isArray(fmHead.script)) head.script = fmHead.script as Array<Record<string, string>>;
  if (fmHead.htmlAttrs && typeof fmHead.htmlAttrs === 'object')
    head.htmlAttrs = fmHead.htmlAttrs as Record<string, string>;
  if (fmHead.bodyAttrs && typeof fmHead.bodyAttrs === 'object')
    head.bodyAttrs = fmHead.bodyAttrs as Record<string, string>;

  return Object.keys(head).length > 0 ? head : undefined;
}

/**
 * 拦截路由的标记段（Next 的 `(.)target` / `(..)target` / `(...)target` 目录约定）。
 *
 * **刻意不支持**（[docs/adr/0010] 的刻意不做清单）。本仓一度按约定扫出 `interceptFrom` /
 * `interceptTarget` 元数据、把页面注册成 `__intercept_*` 路由，但**全仓没有消费者**：
 * 「从 X 导航到 Y 时渲染拦截页」从未发生，拦截页只能落在它被清理后的路径上（一个谁也不会
 * 访问的废 URL）。而且真要接线，代价在运行时而非约定 —— 需要守卫 + 同 URL 双记录 + 故意的
 * SSR/客户端分叉（与本仓「两侧一致」的原则冲突），且背景页会重挂载（Next 原生保留上下文）。
 * 核心价值（URL 可分享、back 关闭对话框）用已有的并行路由 + 守卫在应用侧就能拿到，
 * 所以按「单独『竞品有』→ 刻意不做」处理。
 *
 * 因此扫到标记段**响亮失败**而不是静默降级：不拦的话它会退化成 `/feed/(.)photo/:id`
 * 这种字面垃圾路径（路由组正则 `\(([^(/\\]+)\)[/\\]` 只吞整段 `(group)/`，不吞 `(.)photo`）。
 */
const INTERCEPT_MARKER_RE = /^\((\.{1,3})\)(.+)$/;

/**
 * Extract parallel route slot name from a relative file path.
 *
 * Parallel routes: `@slotName/page.vue` → slot = 'slotName'
 *
 * 拦截路由标记段会让本函数抛错（见 `INTERCEPT_MARKER_RE`）。
 */
export function extractSlotFromPath(fileBase: string): {
  cleanedBase: string;
  slot?: string;
} {
  const segments = fileBase.split('/');
  let slot: string | undefined;
  const cleanedSegments: string[] = [];

  for (const seg of segments) {
    // Parallel route slot: @slotName
    if (seg.startsWith('@')) {
      slot = seg.slice(1);
      continue;
    }

    if (INTERCEPT_MARKER_RE.test(seg)) {
      throw new Error(
        `[ubean] 拦截路由目录约定不被支持：发现了 "${seg}"（文件：${fileBase}）。` +
          `ubean 刻意不做这个约定（见 docs/adr/0010 的刻意不做清单）—— 它需要故意的 SSR/客户端分叉，` +
          `而核心价值（URL 可分享、back 关闭）用并行路由就能拿到。` +
          `请改写为「并行路由 + <SlotView>」：把对话框页面放进 @dialog/ 目录（如 ` +
          `src/pages/@dialog/photo/[id].vue），在布局里用 <SlotView name="dialog" /> 承载，` +
          `用查询标记之类的条件决定它何时出现（站点文档 guide/pages-routing 的 "Dialogs and shareable URLs"）。`
      );
    }

    cleanedSegments.push(seg);
  }

  return {
    cleanedBase: cleanedSegments.join('/'),
    slot
  };
}

/**
 * Normalize a `string | string[]` dir entry into `string[]`。Falsy 值回退到
 * 默认值;空数组同样回退,保证下游 glob 始终拿到非空列表。
 */
function normalizeDirs(value: string | string[] | undefined, fallback: string): string[] {
  if (value === undefined || value === null || value === '') return [fallback];
  if (Array.isArray(value)) {
    const filtered = value.filter((d): d is string => typeof d === 'string' && d.length > 0);
    return filtered.length > 0 ? filtered : [fallback];
  }
  return [value];
}

/** 目录条目 → 绝对路径(相对 `srcDir` 或已是绝对路径)。 */
function resolveDirs(srcDir: string, value: string | string[] | undefined, fallback: string): string[] {
  return normalizeDirs(value, fallback).map(single => (isAbsolute(single) ? single : join(srcDir, single)));
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

const DEFAULT_IGNORE = ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'];

/** 解析 markdown 配置 → 参与扫描的 markdown 扩展名列表(空 = 关闭)。 */
function resolveMarkdownExts(markdown: ScanPagesOptions['markdown']): string[] {
  if (markdown === true) return ['md', 'mdx'];
  if (markdown === 'md' || markdown === 'mdx') return [markdown];
  return [];
}

export async function scanPages(options: ScanPagesOptions): Promise<ScanPagesResult> {
  const srcDir = isAbsolute(options.srcDir) ? options.srcDir : join(options.cwd, options.srcDir);
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore || [])];

  const markdownExts = resolveMarkdownExts(options.markdown);
  const headEnabled = options.head === true;

  // 页面扩展名:vue 单文件组件 + tsx/jsx(JSX 语法页面)。`.ts` 不再作为
  // 页面扩展名 —— 无模板的 `.ts` 无法自然表达页面组件;需要纯逻辑页面时
  // 用 `.tsx`/`.jsx` 或 `.vue`。`extensions` 可覆盖(如显式加回 `ts`)。
  const baseExts = options.extensions && options.extensions.length > 0 ? options.extensions : ['vue', 'tsx', 'jsx'];
  const extensions = [...baseExts];
  for (const ext of markdownExts) {
    if (!extensions.includes(ext)) extensions.push(ext);
  }

  const pagesDirs = resolveDirs(srcDir, options.pagesDir, 'pages');
  const layoutsDirs = resolveDirs(srcDir, options.layoutsDir, 'layouts');

  // `.reuse.ts` / `.reuse.js` 是纯元数据文件(只含 `definePage({ reuse })`),
  // 单独注入 definePage、无组件实现,独立于页面扩展名约定始终参与扫描。
  // `.reuse.vue` 不在约定内 —— 带 `.vue` 扩展名的是真实组件,按普通页面处理。
  const pagesPattern = [`**/*.{${extensions.join(',')}}`, '**/*.reuse.{ts,js}'];
  const layoutsPattern = '**/*.{vue,ts}';

  const pages: ScannedPage[] = [];
  const layouts: ScannedLayout[] = [];
  const seenPagePaths = new Set<string>();
  const seenLayoutPaths = new Set<string>();
  let notFoundPage: ScannedPage | undefined;
  let loadingPage: ScannedPage | undefined;
  let errorPage: ScannedPage | undefined;

  for (const dir of pagesDirs) {
    const files = await glob(pagesPattern, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/components/**', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      // Deduplicate when multiple page directories overlap. First-seen-wins
      // preserves the ordering of `pagesDir` so users can layer folders.
      if (seenPagePaths.has(fullPath)) continue;
      seenPagePaths.add(fullPath);

      const relativePath = toPosixPath(relative(dir, fullPath));
      const ext = extname(relativePath);
      const base = basename(relativePath, ext);

      if (base.startsWith('_')) continue;

      const isMarkdown = ext === '.md' || ext === '.mdx';
      // 精确匹配 `.reuse.ts` / `.reuse.js` 元数据文件后缀。不用
      // `base.endsWith('.reuse')` —— 那会把 `xxx.reuse.vue`(真实组件)
      // 误判为 reuse 元数据页。
      const isReuse = !isMarkdown && /\.reuse\.(ts|js)$/.test(relativePath);
      const pageBase = isReuse ? base.slice(0, -'.reuse'.length) : base;
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const rawFileBase = dirPart ? `${dirPart}/${pageBase}` : pageBase;

      // Extract parallel route slot (`@slotName`). The cleaned base (with the slot
      // prefix removed) computes the path. 拦截路由标记段会在这里抛错。
      const { cleanedBase, slot } = extractSlotFromPath(rawFileBase);
      const fileBase = cleanedBase;

      // Special preset pages at the root of a pages directory:
      // - `404.vue`     → Vue Router catch-all + Hono fallback
      // - `loading.vue` → <Suspense> fallback component
      // - `error.vue`   → ErrorBoundary component
      // Only root-level files are treated as special; nested files like
      // `users/404.vue` remain regular routes at `/users/404`.
      if (!isReuse && dirPart === '' && (pageBase === '404' || pageBase === 'loading' || pageBase === 'error')) {
        const { route: specialRoute, cleaned: specialCleaned } = filePathToRoute(fileBase);
        // 404 的运行时约定名为 'NotFound'(catch-all 路由与守卫跳转目标)。
        const specialName = pageBase === '404' ? 'NotFound' : generateRouteName(specialCleaned || specialRoute);
        const specialPage: ScannedPage = {
          fullPath,
          relativePath,
          dirname: dirname(relativePath),
          basename: basename(relativePath),
          name: specialName,
          route: specialRoute,
          path: specialRoute,
          layout: undefined,
          cache: undefined,
          isReuse: false,
          isMarkdown,
          reuseTarget: undefined,
          pageMeta: undefined,
          frontmatter: undefined
        };
        if (pageBase === '404') {
          notFoundPage ??= specialPage;
        } else if (pageBase === 'loading') {
          loadingPage ??= specialPage;
        } else {
          errorPage ??= specialPage;
        }
        continue;
      }

      // `filePathToRoute` 解析 `[id=matcher]` 语法并返回 matchers 映射;
      // 名称生成消费 `cleaned`(文件方括号语法)—— `generateRouteName`
      // 不识别转换后的 `:id` 语法(否则动态参数名会带上 `:`)。
      const { route, cleaned, matchers } = filePathToRoute(fileBase);
      const name = generateRouteName(cleaned || route);

      let pageMeta: PageMeta | null = null;
      let frontmatter: Record<string, unknown> | undefined;

      if (isMarkdown) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const parser = await getFrontmatterParser();
          if (parser) {
            const parsed = parser(content);
            frontmatter = parsed.data;
            pageMeta = {
              name: (frontmatter?.name as string) || name,
              path: (frontmatter?.path as string) || route,
              layout: frontmatter?.layout as string | string[] | false | undefined,
              cache: frontmatter?.cache as boolean | undefined,
              head: buildMarkdownHead(frontmatter, headEnabled)
            };
          } else {
            pageMeta = { name, path: route };
          }
        } catch {
          pageMeta = null;
        }
      } else {
        pageMeta = await readFile(fullPath, 'utf-8')
          .then(code => extractDefinePageFromCode(code))
          .catch(() => null);
      }

      if (pageMeta?.head && !headEnabled) {
        // head 声明存在但未开启支持 —— 提示后丢弃(不出现在 meta 中)。
        warn(
          '`definePage({ head })` / frontmatter `head` declared but the `head` option is disabled — head will be ignored.'
        );
        delete pageMeta.head;
      }

      pages.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        name: pageMeta?.name || name,
        route: pageMeta?.path || route,
        path: pageMeta?.path || route,
        layout: pageMeta?.layout,
        cache: pageMeta?.cache,
        isReuse,
        isMarkdown,
        reuseTarget: pageMeta?.reuse,
        pageMeta: pageMeta || undefined,
        frontmatter,
        slot,
        matchers
      });
    }
  }

  for (const dir of layoutsDirs) {
    const files = await glob(layoutsPattern, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      if (seenLayoutPaths.has(fullPath)) continue;
      seenLayoutPaths.add(fullPath);

      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const layoutBase = base === 'index' ? dirPart : dirPart ? `${dirPart}/${base}` : base;
      const isDefault = base === 'default' || (base === 'index' && !dirPart);
      const name = layoutBase || 'default';
      layouts.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        name,
        path: toPosixPath(relativePath),
        isDefault
      });
    }
  }

  // Reuse routes reference a target page by name. The target must be a
  // regular (non-reuse) page — chaining reuse routes is not supported.
  const regularPageNames = new Set(pages.filter(p => !p.isReuse).map(p => p.name));

  for (const page of pages) {
    if (page.isReuse && page.reuseTarget && !regularPageNames.has(page.reuseTarget)) {
      warn(
        `Reuse page "${page.name}" references target "${page.reuseTarget}" which does not exist. ` +
          `Available page targets: ${[...regularPageNames].join(', ') || '(none)'}`
      );
    }
  }

  // Inherit `cache` from reuse target.
  // Reuse routes that don't explicitly declare `cache` (i.e. `undefined`)
  // inherit the target page's cache setting. To explicitly disable cache on
  // a reuse route, set `cache: false` in its `definePage`.
  const targetCacheMap = new Map<string, boolean | undefined>();
  for (const p of pages) {
    if (!p.isReuse) {
      targetCacheMap.set(p.name, p.cache);
    }
  }
  for (const page of pages) {
    if (page.isReuse && page.reuseTarget && page.cache === undefined) {
      const targetCache = targetCacheMap.get(page.reuseTarget);
      if (targetCache === true) {
        page.cache = true;
        // Sync `pageMeta` so the file-mode route generator (which reads
        // `page.pageMeta?.cache`) also sees the inherited value.
        if (page.pageMeta) {
          page.pageMeta.cache = true;
        } else {
          page.pageMeta = { cache: true };
        }
      }
    }
  }

  return { pages, layouts, notFoundPage, loadingPage, errorPage };
}
