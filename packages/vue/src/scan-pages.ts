import { readFile } from 'node:fs/promises';
import { join, relative, dirname, basename, extname, isAbsolute } from 'pathe';
import { glob } from 'tinyglobby';
import { extractDefinePageFromCode } from './extract-page';
import { NOT_FOUND_ROUTE_NAME, NOT_FOUND_ROUTE_PATH, ROOT_ROUTE_NAME, isReservedRouteName } from './global-routes';
import { generateRouteName } from './route-name';
import { filePathToRoute } from './route-path';
import type {
  ScanPagesOptions,
  ScanPagesResult,
  ScannedPage,
  ScannedLayout,
  PageMeta,
  PageHead,
  PageKind
} from './types';

/**
 * 页面/布局扫描器(页面路由所有权归属 `@ubean/vue`)。
 *
 * 能力(从 `@ubean/scan` 沉淀并增强):
 * - 多 `pagesDir` / `layoutsDir`(先到先得去重,可分层叠加目录)
 * - 页面种类判别器 `pageKind`（`component` / `reuse` / `meta`）
 * - reuse 路由（`.reuse.ts` / `.reuse.js`，纯元数据文件单独注入 `definePage`）+ cache 继承
 * - markdown 页面(opt-in,`@ubean/markdown` 按需加载解析 frontmatter)
 * - 页面级 head(opt-in,`definePage({ head })` / frontmatter `head`)
 * - 特殊页:`404` / `loading` / `error` / `root`(根级或 `<name>/index.*` 形态)
 * - 内置全局路由(Root / NotFound)与普通页同池:`pages` 里带 `isBuiltin` 标记,
 *   路由名 `Index` / `NotFound` 为框架保留名(撞名者扫描期告警并跳过注册)
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
 * 清空告警去重表。同名冲突类告警的消息只含相对路径，同一进程里重复扫招同一目录时
 * 会被去重掉 —— 测试需要看见每次都报，就在这里手动清。
 */
export function clearScanWarnings(): void {
  _warned.clear();
}

/**
 * Optional peer dependency loader for `@ubean/markdown`。
 *
 * 仅当 `markdown` 开启且项目存在 `.md` / `.mdx` 页面时按需加载;
 * 未安装时降级为无 frontmatter 的普通页面并告警一次。
 */
type FrontmatterParser = (source: string) => {
  data: Record<string, unknown>;
  content: string;
};
let _frontmatterParser: FrontmatterParser | null | undefined;

async function getFrontmatterParser(): Promise<FrontmatterParser | null> {
  if (_frontmatterParser !== undefined) return _frontmatterParser;
  try {
    const mod = (await import('@ubean/markdown')) as {
      parseFrontmatter?: FrontmatterParser;
    };
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

/**
 * 扩展名列表 → glob。单扩展名时**不能**用 brace:`**\/*.{vue}` 在 tinyglobby 里
 * 匹配不到任何文件(实测),`pages.extensions: ['vue']` 会因此扫出空站点。
 */
function extGlob(exts: string[]): string {
  return exts.length === 1 ? `**/*.${exts[0]}` : `**/*.{${exts.join(',')}}`;
}

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

  // `.reuse.ts` / `.reuse.js` 与 `.meta.ts` / `.meta.js` 都是纯元数据文件（只含
  // `definePage`），单独注入 definePage、无组件实现，独立于页面扩展名约定始终参与扫描。
  // 带 `.vue` 扩展名的是真实组件，按普通页面处理（`.reuse.vue` / `.meta.vue` 不在约定内）。
  const pagesPattern = [extGlob(extensions), '**/*.reuse.{ts,js}', '**/*.meta.{ts,js}'];
  // 布局扩展名与页面完全同源(`pages.extensions`)。用 `baseExts` 而非 `extensions`:
  // markdown 后缀只属于页面,布局不是 markdown。
  const layoutsPattern = extGlob(baseExts);

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
      // `.meta.ts` / `.meta.js` / `.reuse.ts` / `.reuse.js` 都是纯元数据文件（只含
      // `definePage`、没有组件实现），不适用 `pages.extensions` 页面扩展名约定，因此始终
      // 参与扫描。带 `.vue` 扩展名的是真实组件，按普通页面处理（`.reuse.vue` / `.meta.vue`
      // 不在约定内）。
      // 真正决定「有没有组件」的是 `definePage` 内容（见下方 `pageKind` 推导），后缀只用来
      // 从 basename 里剔掉标记段。
      const isReuseFile = !isMarkdown && /\.reuse\.(ts|js)$/.test(relativePath);
      const isMetaFile = !isMarkdown && /\.meta\.(ts|js)$/.test(relativePath);
      /** 是否为纯元数据文件（无组件实现）。 */
      const isMetaOnlyFile = isReuseFile || isMetaFile;
      const pageBase = isReuseFile
        ? base.slice(0, -'.reuse'.length)
        : isMetaFile
          ? base.slice(0, -'.meta'.length)
          : base;
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const rawFileBase = dirPart ? `${dirPart}/${pageBase}` : pageBase;

      // Extract parallel route slot (`@slotName`). The cleaned base (with the slot
      // prefix removed) computes the path. 拦截路由标记段会在这里抛错。
      const { cleanedBase, slot } = extractSlotFromPath(rawFileBase);
      const fileBase = cleanedBase;

      // 特殊页判据用**折叠后的逻辑路径**（`404/index.vue` → `404`，与 layouts 的处理一致）。
      // `pages/index.vue`（dirPart 为空）不在其中 —— 它是 Root 路由的常规声明形态。
      const specialBase = pageBase === 'index' ? dirPart : dirPart ? `${dirPart}/${pageBase}` : pageBase;

      // 内置全局路由（`pages/404.vue` 等）的声明形态：
      // - `404.vue` / `not-found.vue` / `404/index.vue` / `not-found/index.vue`
      //     → 全局捕获路由（名字固定 `NotFound`，路径 `/:pathMatch(.*)*`）
      // - `loading.vue` / `error.vue`（含 `*/index.*`）→ Suspense / ErrorBoundary 槽位
      //
      // 嵌套目录不参与：`users/404.vue` 仍是常规路由 `/users/404`。
      const specialKind: 'notFound' | 'loading' | 'error' | null =
        specialBase === '404' || specialBase === 'not-found'
          ? 'notFound'
          : specialBase === 'loading'
            ? 'loading'
            : specialBase === 'error'
              ? 'error'
              : null;

      // Root（`/`）的三个声明形态：根级 `index.vue`、`root.vue`、`root/index.vue`。
      // 它**不是**特殊页 —— 走下面普通页的同一条路径（`definePage({ head, layout, cache,
      // name })` 全部照常生效），只在收尾把路径归一到 `/`、名字归一到 `Index`。
      const isRootDecl = dirPart === '' && pageBase === 'index' ? true : specialBase === 'root';

      if (!isMetaOnlyFile && specialKind) {
        // 一个槽位只能有一个声明者：`404.vue` 与 `not-found.vue` 同时存在时先到先得
        // （`files.sort()` 下 `404.vue` 在前）。静默丢弃会让用户对「哪个生效」无从得知。
        if (specialKind === 'notFound' && notFoundPage) {
          warn(
            `检测到多个全局捕获路由声明（已有 "${notFoundPage.relativePath}"，又发现 "${relativePath}"）—— ` +
              `只有第一个生效，"${relativePath}" 已跳过。`
          );
          continue;
        }
        const { route: specialRoute, cleaned: specialCleaned } = filePathToRoute(fileBase);
        const isNotFound = specialKind === 'notFound';
        const specialPage: ScannedPage = {
          fullPath,
          relativePath,
          dirname: dirname(relativePath),
          basename: basename(relativePath),
          // 路由名是框架契约(`Index` / `NotFound` 被路由守卫、类型生成与宿主消费),
          // 不能从文件名派生:`404` 派不出合法标识符,`root` 会派成 `Root`。
          name: isNotFound ? NOT_FOUND_ROUTE_NAME : generateRouteName(specialCleaned || specialRoute),
          // 捕获路由的 URL 形态是 vue-router 的内部约定，不是页面文件派生的路径。
          route: isNotFound ? NOT_FOUND_ROUTE_PATH : specialRoute,
          path: isNotFound ? NOT_FOUND_ROUTE_PATH : specialRoute,
          layout: undefined,
          cache: undefined,
          pageKind: 'component',
          // loading / error 是组件槽位而非路由:`routable: false` 让它们留在页面清单里
          // 但不进路由表(否则凭空多出 `/loading`、`/error` 两条 URL)。
          routable: !(specialKind === 'loading' || specialKind === 'error'),
          isMarkdown,
          reuseTarget: undefined,
          pageMeta: undefined,
          frontmatter: undefined,
          isBuiltin: isNotFound,
          isGlobalCatchAll: isNotFound
        };
        pages.push(specialPage);
        if (isNotFound) {
          notFoundPage = specialPage;
        } else if (specialKind === 'loading') {
          loadingPage ??= specialPage;
        } else if (specialKind === 'error') {
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
          .then(code =>
            extractDefinePageFromCode(code, basename(fullPath), {
              fileName: fullPath,
              cwd: options.cwd
            })
          )
          .catch(() => null);
      }

      if (pageMeta?.head && !headEnabled) {
        // head 声明存在但未开启支持 —— 提示后丢弃(不出现在 meta 中)。
        warn(
          '`definePage({ head })` / frontmatter `head` declared but the `head` option is disabled — head will be ignored.'
        );
        delete pageMeta.head;
      }

      // 组件从哪来 —— `component`（本文件自带）/ `reuse`（借目标页开新 URL）/ `meta`（没有）。
      //
      // 判据是 `definePage` 内容优先，后缀兜底：写了 `reuse` 就是 reuse；没写但文件是纯元数据
      // 就是 meta。于是 `.meta.ts` 写 `reuse` 等价于旧 `.reuse.ts` —— 两种后缀语义归一，
      // `.reuse.*` 仅作为历史写法继续可用。
      const pageKind: PageKind = pageMeta?.reuse !== undefined ? 'reuse' : isMetaOnlyFile ? 'meta' : 'component';

      // `routable` 由 `pageKind` 推导：reuse 恒可路由（借了组件、有真实 URL）；meta 恒不可路由
      // （文件名即语义）；component 看 `definePage({ routable })`，省略即 `true`。
      const routable = pageKind === 'reuse' ? true : pageKind === 'meta' ? false : pageMeta?.routable !== false;

      // 唯一还需要报错的情况是**显式写反**：元数据文件没有组件，`routable: true` 必然
      // 产出指向不存在组件的 loader，启动即解析失败。扫描期直接报错（而不是默默纠正），
      // 因为静默降级会得到一个“开发正常、导航 404”的隐形故障。
      if (pageKind === 'meta' && pageMeta?.routable === true) {
        throw new Error(
          `[ubean] 元数据页不能声明 \`routable: true\`："${relativePath}"。\n` +
            `\`.meta.ts\` / \`.meta.js\` 是只有 \`definePage\`、没有组件实现的文件，` +
            `永远不参与路由注册（等价于 \`routable: false\`），省略该字段即可。\n` +
            `若你本意是做一个普通页面，请改写成 \`.vue\` / \`.tsx\` 文件；` +
            `若想复用其他页面的组件开新 URL，请声明 \`reuse: '<页面名>'\`。`
        );
      }

      pages.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        // Root 声明：路径归一到 `/`（`root.vue` / `root/index.vue` 会派生 `/root`），
        // 名字回退到保留名 `Index`（`definePage({ name })` 仍可覆盖，与普通页一致）。
        name: isRootDecl ? pageMeta?.name || ROOT_ROUTE_NAME : pageMeta?.name || name,
        route: isRootDecl ? '/' : pageMeta?.path || route,
        path: isRootDecl ? '/' : pageMeta?.path || route,
        layout: pageMeta?.layout,
        cache: pageMeta?.cache,
        pageKind,
        routable,
        isMarkdown,
        reuseTarget: pageMeta?.reuse,
        pageMeta: pageMeta || undefined,
        frontmatter,
        slot,
        matchers,
        redirect: pageMeta?.redirect,
        isBuiltin: isRootDecl || undefined
      });
    }
  }

  // 同一路径上重复声明时，`files.sort()` 顺序先到先得，其他条告警并移出清单。
  //
  // 必须只留一条：两条同名页会让虚拟模块生成重复的 `const Page_X`，同名 reuse 页更会
  // 生成 `const Page_X = Page_X` 自引用（模块顶层 TDZ）。撞名的三种真实形态：
  // `a.vue` + `a.tsx`（同扩展名连写）、`a.vue` + `a/index.vue`（路径相同但名不同，
  // 后者会在路由表里变成无路由孤儿）、`a.vue` + `a.reuse.ts`（目标就是自己）。
  //
  // 键含 `slot`：并行路由的多个视图共享同一个 URL，不算重复。
  const declaredOnRoute = new Map<string, ScannedPage[]>();
  for (const page of pages) {
    const routeKey = `${page.route}\u0000${page.slot ?? ''}`;
    const group = declaredOnRoute.get(routeKey);
    if (group) group.push(page);
    else declaredOnRoute.set(routeKey, [page]);
  }

  const droppedPages = new Set<ScannedPage>();
  for (const group of declaredOnRoute.values()) {
    if (group.length === 1) continue;
    // 留带组件的那条：`a.vue` 与同名 `a.reuse.ts` 撞上时，reuse 页借的组件就是它自己
    // （`const Page_A = Page_A` 顶层 TDZ），只有让 `a.vue` 胜出才渲得出东西。
    const winner = group.find(p => p.pageKind === 'component') ?? group[0];
    for (const page of group) {
      if (page === winner) continue;
      droppedPages.add(page);
      warn(
        `页面 "${page.relativePath}" 与 "${winner.relativePath}" 解析到同一路径` +
          `（${page.route}${page.slot ? ` 的 "${page.slot}" 插槽` : ''}），只有 "${winner.relativePath}" 生效，` +
          `"${page.relativePath}" 已跳过。\n` +
          `请改名，或用 \`definePage({ name, path })\` 区分。`
      );
    }
  }

  const uniquePages = pages.filter(page => !droppedPages.has(page));

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
      // 根 `index.*` 是默认布局;`default.*` 与 `default/index.*` 同为默认布局的
      // 文件/目录两种形态 —— 只认文件名形态时,`default/index.vue` 单独存在会让
      // `layouts.find(l => l.isDefault)` 落空,默认布局静默失效(文档已承诺该形态)。
      const isDefault = base === 'default' || (base === 'index' && (!dirPart || dirPart === 'default'));
      const name = layoutBase || 'default';

      // 布局名是 `definePage({ layout })` 与 `meta.layout` 引用的键，同名两条会让虚拟模块
      // 生成重复的 `const Layout_X`（`layoutVarNameFor` 不去重）——整份路由表编译失败。
      // 与页面同样先到先得，但这里**只告警不抛错**：dev 已经能启动到出模块那一步了。
      if (layouts.some(l => l.name === name)) {
        warn(
          `布局 "${relativePath}" 与已发现的同名布局 "${name}" 冲突，只有前者生效，` +
            `"${relativePath}" 已跳过。请改名，或删掉其中一种写法。`
        );
        continue;
      }

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

  // 保留路由名:框架内置的全局路由(`Index` / `NotFound`)占用这两个名字。
  // 普通页派生或 `definePage({ name })` 显式撞名时,跳过注册并告警 —— 静默产出两条同名
  // 路由会让 vue-router 覆盖其中一条(表现为「某页打不开」,且两侧覆盖顺序可能不同)。
  // 放在循环后而不是循环内:结果与文件遍历顺序无关,`.reuse.ts` 的撞名也能一并拦下。
  for (const page of uniquePages) {
    if (page.isBuiltin || !isReservedRouteName(page.name)) continue;
    warn(
      `页面 "${page.relativePath}" 使用了框架保留的路由名 "${page.name}",已跳过路由注册。\n` +
        `"${page.name}" 是内置全局路由的名字(${page.name === ROOT_ROUTE_NAME ? '`/` Root 路由' : '`/:pathMatch(.*)*` 全局捕获路由'}),` +
        `由 \`pages/${page.name === ROOT_ROUTE_NAME ? 'index.vue` / `pages/root.vue' : '404.vue` / `pages/not-found.vue'}\` 声明。\n` +
        `请用 \`definePage({ name: '其他名字' })\` 改掉,或把该页改名为对应的内置形态。`
    );
    page.routable = false;
  }

  // Reuse routes reference a target page by name. The target must be a
  // regular page with a component implementation — chaining reuse routes is
  // not supported, and `.meta.*` pages have no component to lend out.
  const regularPageNames = new Set(uniquePages.filter(p => p.pageKind === 'component').map(p => p.name));

  for (const page of uniquePages) {
    if (page.pageKind === 'reuse' && page.reuseTarget && !regularPageNames.has(page.reuseTarget)) {
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
  for (const p of uniquePages) {
    if (p.pageKind !== 'reuse') {
      targetCacheMap.set(p.name, p.cache);
    }
  }
  for (const page of uniquePages) {
    if (page.pageKind === 'reuse' && page.reuseTarget && page.cache === undefined) {
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

  return { pages: uniquePages, layouts, notFoundPage, loadingPage, errorPage };
}
