import { readFile } from 'node:fs/promises';
import type { PageHead } from '@ubean/types';
import { filePathToRoute, capitalize } from '@ubean/utils';
import { consola } from 'consola';
import { join, relative, dirname, basename, extname, isAbsolute } from 'pathe';
import { glob } from 'tinyglobby';
import { extractDefinePage } from './define-page';
import { detectHttpExports } from './detect-exports';
import { HTTP_METHODS, GLOB_SCAN_PATTERN, GLOB_VUE_PATTERN, GLOB_LAYOUT_PATTERN } from './types';

/**
 * Extract parallel route slot name and intercept info from a relative file path.
 * Exported for unit testing (P9-18).
 *
 * Parallel routes: `@slotName/page.vue` → slot = 'slotName'
 * Intercepting routes:
 *   `(..)target/page.vue` → intercept from parent, target = 'target'
 *   `(.)target/page.vue`  → intercept from same level, target = 'target'
 *   `(...)target/page.vue` → intercept from root, target = 'target'
 *
 * Returns the cleaned file base (with slot/intercept prefixes removed) plus
 * any extracted slot/intercept metadata.
 */
export function extractSlotAndIntercept(fileBase: string): {
  cleanedBase: string;
  slot?: string;
  interceptFrom?: string;
  interceptTarget?: string;
} {
  const segments = fileBase.split('/');
  let slot: string | undefined;
  let interceptFrom: string | undefined;
  let interceptTarget: string | undefined;
  const cleanedSegments: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Parallel route slot: @slotName
    if (seg.startsWith('@')) {
      slot = seg.slice(1);
      continue;
    }

    // Intercepting route: (..)target, (.)target, (...)target
    const interceptMatch = seg.match(/^\((\.{1,3})\)(.+)$/);
    if (interceptMatch) {
      const dots = interceptMatch[1];
      interceptTarget = interceptMatch[2];
      // Determine the intercept "from" path based on dot count:
      // (.)  → same level (current directory)
      // (..) → one level up
      // (...)→ root level
      const prefixSegments = cleanedSegments.slice(0, i);
      if (dots === '..') {
        // One level up: remove the last segment
        interceptFrom = `/${prefixSegments.slice(0, -1).join('/')}`;
      } else if (dots === '...') {
        // Root level
        interceptFrom = '/';
      } else {
        // Same level
        interceptFrom = `/${prefixSegments.join('/')}`;
      }
      // Don't add the intercept segment to the cleaned path
      continue;
    }

    cleanedSegments.push(seg);
  }

  return {
    cleanedBase: cleanedSegments.join('/'),
    slot,
    interceptFrom,
    interceptTarget
  };
}
import type {
  ScanOptions,
  ScanResult,
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPageRoute,
  ScannedLayout,
  ScannedPlugin,
  ScannedAppEntry,
  ScannedServerEntry,
  ScannedCronTask,
  ScannedQueue,
  ScannedLocale,
  AppEntry
} from './types';

const logger = consola.withTag('ubean-routing');

/**
 * Optional peer dependency loader for `@ubean/markdown`.
 *
 * Markdown frontmatter parsing is only required when a project actually
 * contains `.md` / `.mdx` page files. Projects without markdown pages
 * can skip installing `@ubean/markdown`, in which case we degrade
 * gracefully by treating markdown files as plain pages (no frontmatter).
 */
type FrontmatterParser = (source: string) => { data: Record<string, unknown>; content: string };
let _frontmatterParser: FrontmatterParser | null | undefined;

async function getFrontmatterParser(): Promise<FrontmatterParser | null> {
  if (_frontmatterParser !== undefined) return _frontmatterParser;
  try {
    const mod = await import('@ubean/markdown');
    _frontmatterParser = mod.parseFrontmatter as FrontmatterParser;
  } catch {
    logger.warn(
      '@ubean/markdown is not installed. Markdown frontmatter parsing will be skipped. ' +
        'Install it as a dependency to enable frontmatter-based page metadata.'
    );
    _frontmatterParser = null;
  }
  return _frontmatterParser;
}

const DEFAULT_DIRS = {
  routes: 'routes',
  middleware: 'middleware',
  pages: 'pages',
  layouts: 'layouts',
  plugins: 'plugins',
  crons: 'crons',
  queues: 'queues',
  locales: 'locales'
};

/**
 * Normalize a `string | string[]` dir entry into `string[]`. Falsy values
 * fall back to the provided default so callers always receive a non-empty
 * list. Empty arrays are also replaced with the default to keep downstream
 * globbing simple.
 */
function normalizeDirs(value: string | string[] | undefined, fallback: string): string[] {
  if (value === undefined || value === null || value === '') return [fallback];
  if (Array.isArray(value)) {
    const filtered = value.filter((d): d is string => typeof d === 'string' && d.length > 0);
    return filtered.length > 0 ? filtered : [fallback];
  }
  return [value];
}

function splitOrderPrefix(name: string): { order: number; cleanName: string } {
  const match = name.match(/^(\d+)\.(.+)$/);
  if (match) {
    return { order: Number(match[1]), cleanName: match[2] };
  }
  return { order: 0, cleanName: name };
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export async function scanProject(options: ScanOptions): Promise<ScanResult> {
  const dirs = { ...DEFAULT_DIRS, ...options.dirs };
  const ignore = options.ignore || ['**/*.test.*', '**/*.spec.*', '**/_*', '**/*.d.ts'];

  const srcDir = isAbsolute(options.srcDir) ? options.srcDir : join(options.cwd, options.srcDir);

  const [apiRoutes, middlewares, pagesResult, layouts, plugins, crons, queues, locales, appEntry, serverEntry] =
    await Promise.all([
      scanApiRoutes(srcDir, dirs.routes, ignore),
      scanMiddlewares(srcDir, dirs.middleware, ignore),
      scanPages(srcDir, dirs.pages, ignore),
      scanLayouts(srcDir, dirs.layouts, ignore),
      scanPlugins(srcDir, dirs.plugins, ignore),
      scanCrons(srcDir, dirs.crons, ignore),
      scanQueues(srcDir, dirs.queues, ignore),
      scanLocales(srcDir, dirs.locales, ignore),
      scanAppEntry(srcDir),
      scanServerEntry(srcDir)
    ]);

  const { pages, notFoundPage, loadingPage, errorPage } = pagesResult;

  // Reuse routes reference a target page by name. The target must be a
  // regular (non-reuse) page — chaining reuse routes is not supported.
  const regularPageNames = new Set(pages.filter(p => !p.isReuse).map(p => p.name));

  for (const page of pages) {
    if (page.isReuse && page.reuseTarget && !regularPageNames.has(page.reuseTarget)) {
      logger.warn(
        `Reuse page "${page.name}" references target "${page.reuseTarget}" which does not exist. ` +
          `Available page targets: ${[...regularPageNames].join(', ') || '(none)'}`
      );
    }
  }

  // Inherit `cache` from reuse target.
  // Reuse routes that don't explicitly declare `cache` (i.e. `undefined`)
  // inherit the target page's cache setting. So if `about.vue` declares
  // `definePage({ cache: true })`, then `about2.reuse.ts` (which reuses
  // About) is automatically cached too — each as an independent keep-alive
  // instance keyed by its own route name. To explicitly disable cache on
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

  const defaultLocale = locales.find(l => l.isDefault)?.code || locales[0]?.code;

  return {
    apiRoutes,
    middlewares,
    pages,
    layouts,
    plugins,
    crons,
    queues,
    locales,
    defaultLocale,
    appEntry,
    serverEntry,
    notFoundPage,
    loadingPage,
    errorPage
  };
}

async function scanApiRoutes(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedApiRoute[]> {
  const dirNames = normalizeDirs(dirName, 'routes');
  const routes: ScannedApiRoute[] = [];

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_SCAN_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const fileBase = dirPart ? `${dirPart}/${base}` : base;
      const parsed = filePathToRoute(fileBase);

      const detected = await detectHttpExports(fullPath).catch(() => ({
        exports: [] as string[],
        httpMethods: [] as Lowercase<(typeof HTTP_METHODS)[number]>[],
        hasMeta: false,
        fileMeta: undefined
      }));

      const methods =
        detected.httpMethods.length > 0
          ? detected.httpMethods
          : parsed.method
            ? [parsed.method.toLowerCase() as Lowercase<(typeof HTTP_METHODS)[number]>]
            : [];

      for (const method of methods.length > 0
        ? methods
        : HTTP_METHODS.map(m => m.toLowerCase() as Lowercase<(typeof HTTP_METHODS)[number]>)) {
        routes.push({
          fullPath,
          relativePath,
          dirname: dirname(relativePath),
          basename: basename(relativePath),
          route: parsed.route,
          method,
          env: parsed.env as 'dev' | 'prod' | 'prerender' | undefined,
          exports: detected.exports,
          hasMeta: detected.hasMeta,
          fileMeta: detected.fileMeta
        });
      }
    }
  }

  return routes;
}

async function scanMiddlewares(
  srcDir: string,
  dirName: string | string[],
  ignore: string[]
): Promise<ScannedMiddleware[]> {
  const dirNames = normalizeDirs(dirName, 'middleware');
  const results: ScannedMiddleware[] = [];

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_SCAN_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/index.*', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const { order, cleanName } = splitOrderPrefix(base);
      results.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        order,
        global: cleanName === 'global' || cleanName.startsWith('global.')
      });
    }
  }

  return results;
}

async function scanPages(
  srcDir: string,
  dirName: string | string[],
  ignore: string[]
): Promise<{
  pages: ScannedPageRoute[];
  notFoundPage?: ScannedPageRoute;
  loadingPage?: ScannedPageRoute;
  errorPage?: ScannedPageRoute;
}> {
  const dirNames = normalizeDirs(dirName, 'pages');
  const pages: ScannedPageRoute[] = [];
  const seenFullPaths = new Set<string>();
  let notFoundPage: ScannedPageRoute | undefined;
  let loadingPage: ScannedPageRoute | undefined;
  let errorPage: ScannedPageRoute | undefined;

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_VUE_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/components/**', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      // Deduplicate when multiple page directories overlap. First-seen-wins
      // preserves the ordering of `dirs.pages` so users can layer folders.
      if (seenFullPaths.has(fullPath)) continue;
      seenFullPaths.add(fullPath);

      const relativePath = toPosixPath(relative(dir, fullPath));
      const ext = extname(relativePath);
      const base = basename(relativePath, ext);

      if (base.startsWith('_')) continue;

      const isMarkdown = ext === '.md' || ext === '.mdx';
      const isReuse = !isMarkdown && base.endsWith('.reuse');
      const pageBase = isReuse ? base.slice(0, -'.reuse'.length) : base;
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const rawFileBase = dirPart ? `${dirPart}/${pageBase}` : pageBase;

      // Extract parallel route slot (`@slotName`) and intercepting route
      // (`(..)target` / `(.)target` / `(...)target`) metadata (P9-18).
      // The cleaned base (with slot/intercept prefixes removed) is used to
      // compute the actual route path.
      const { cleanedBase, slot, interceptFrom, interceptTarget } = extractSlotAndIntercept(rawFileBase);
      const fileBase = cleanedBase;

      // Special preset pages at the root of pages/ directory:
      // - `404.vue` (or .ts/.md) → Vue Router catch-all + Hono fallback
      // - `loading.vue` (or .ts/.md) → <Suspense> fallback component
      // - `error.vue` (or .ts/.md) → ErrorBoundary component
      // Only root-level files are treated as special; nested files like
      // `users/404.vue` remain regular routes at `/users/404`.
      if (!isReuse && dirPart === '' && (pageBase === '404' || pageBase === 'loading' || pageBase === 'error')) {
        const { route: specialRoute } = filePathToRoute(fileBase);
        const specialName = routeToName(specialRoute);
        const specialPage: ScannedPageRoute = {
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
          notFoundPage = specialPage;
        } else if (pageBase === 'loading') {
          loadingPage = specialPage;
        } else {
          errorPage = specialPage;
        }
        continue;
      }

      const { route } = filePathToRoute(fileBase);
      const name = routeToName(route);

      let pageMeta = null;
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
              head: buildMarkdownHead(frontmatter)
            };
          } else {
            pageMeta = { name, path: route };
          }
        } catch {
          pageMeta = null;
        }
      } else {
        pageMeta = await extractDefinePage(fullPath).catch(() => null);
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
        interceptFrom,
        interceptTarget
      });
    }
  }

  return { pages, notFoundPage, loadingPage, errorPage };
}

async function scanLayouts(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedLayout[]> {
  const dirNames = normalizeDirs(dirName, 'layouts');
  const results: ScannedLayout[] = [];
  const seenFullPaths = new Set<string>();

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_LAYOUT_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      if (seenFullPaths.has(fullPath)) continue;
      seenFullPaths.add(fullPath);

      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
      const layoutBase = base === 'index' ? dirPart : dirPart ? `${dirPart}/${base}` : base;
      const isDefault = base === 'default' || (base === 'index' && !dirPart);
      const name = layoutBase || 'default';
      results.push({
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

  return results;
}

async function scanPlugins(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedPlugin[]> {
  const dirNames = normalizeDirs(dirName, 'plugins');
  const results: ScannedPlugin[] = [];

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_SCAN_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const { order } = splitOrderPrefix(base);
      results.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        order
      });
    }
  }

  return results;
}

const APP_EXTENSIONS = ['ts', 'js', 'mjs', 'mts'];

async function scanCrons(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedCronTask[]> {
  const dirNames = normalizeDirs(dirName, 'crons');
  const results: ScannedCronTask[] = [];

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_SCAN_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const { cleanName } = splitOrderPrefix(base);
      results.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        name: cleanName
      });
    }
  }

  return results;
}

async function scanQueues(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedQueue[]> {
  const dirNames = normalizeDirs(dirName, 'queues');
  const results: ScannedQueue[] = [];

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(GLOB_SCAN_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      const relativePath = toPosixPath(relative(dir, fullPath));
      const base = basename(relativePath, extname(relativePath));
      const { cleanName } = splitOrderPrefix(base);
      results.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        name: cleanName
      });
    }
  }

  return results;
}

const LOCALE_GLOB_PATTERN = '**/*.{json,json5,yaml,yml,js,mjs,cjs,ts,mts,cts}';

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentObj: Record<string, unknown> = result;
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [];

  for (const line of lines) {
    const trimmed = line.replace(/#.*$/, '').trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const match = trimmed.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, key, value] = match;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    currentObj = stack.length > 0 ? (stack[stack.length - 1].obj as Record<string, unknown>) : result;

    if (value === '' || value === undefined) {
      const newObj: Record<string, unknown> = {};
      (currentObj as Record<string, unknown>)[key] = newObj;
      stack.push({ obj: newObj, indent });
      currentObj = newObj;
    } else {
      let parsed: unknown = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (value === 'null') parsed = null;
      else if (/^-?\d+$/.test(value)) parsed = Number.parseInt(value, 10);
      else if (/^-?\d+\.\d+$/.test(value)) parsed = Number.parseFloat(value);
      else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        parsed = value.slice(1, -1);
      }
      (currentObj as Record<string, unknown>)[key] = parsed;
    }
  }

  return result;
}

async function loadLocaleFile(
  fullPath: string,
  ext: string
): Promise<{ messages: Record<string, unknown>; meta?: { name?: string; dir?: 'ltr' | 'rtl'; isDefault?: boolean } }> {
  // Helper: only treat `data.messages` as the wrapper payload when the file
  // also carries locale metadata (`name`/`dir`/`isDefault`). Otherwise the
  // `messages` key is a regular translation namespace and must be kept.
  const extract = (
    data: any
  ): { messages: Record<string, unknown>; meta?: { name?: string; dir?: 'ltr' | 'rtl'; isDefault?: boolean } } => {
    const hasMeta =
      typeof data.name === 'string' || data.dir === 'ltr' || data.dir === 'rtl' || typeof data.isDefault === 'boolean';
    const isWrapper = hasMeta && typeof data.messages === 'object' && data.messages !== null;
    return {
      messages: isWrapper ? data.messages : data,
      meta: isWrapper ? { name: data.name, dir: data.dir, isDefault: data.isDefault } : undefined
    };
  };

  if (ext === '.json' || ext === '.json5') {
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    return extract(data);
  }
  if (ext === '.yaml' || ext === '.yml') {
    const content = await readFile(fullPath, 'utf-8');
    const data = parseSimpleYaml(content);
    return extract(data);
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.mts' || ext === '.cts') {
    const mod = await import(/* @vite-ignore */ fullPath).catch(() => null);
    if (mod) {
      const data = mod.default || mod;
      return extract(data);
    }
  }
  return { messages: {} };
}

async function scanLocales(srcDir: string, dirName: string | string[], ignore: string[]): Promise<ScannedLocale[]> {
  const dirNames = normalizeDirs(dirName, 'locales');
  const locales: ScannedLocale[] = [];
  const seenFullPaths = new Set<string>();

  for (const single of dirNames) {
    const dir = join(srcDir, single);
    const files = await glob(LOCALE_GLOB_PATTERN, {
      cwd: dir,
      dot: true,
      ignore: [...ignore, '**/*.vue', '**/_*'],
      absolute: true
    }).catch(() => [] as string[]);

    for (const fullPath of files.sort()) {
      if (seenFullPaths.has(fullPath)) continue;
      seenFullPaths.add(fullPath);

      const relativePath = toPosixPath(relative(dir, fullPath));
      const ext = extname(relativePath);
      const base = basename(relativePath, ext);
      const { order: _order, cleanName: code } = splitOrderPrefix(base);
      const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);

      let namespace: string | undefined;
      let finalCode = code;
      let isDefault = code === 'default' || base.startsWith('default.');

      if (dirPart) {
        const dirParts = dirPart.split('/');
        const isIndexFile = code === 'index';

        finalCode = dirParts[0];

        const nsParts: string[] = [];
        nsParts.push(...dirParts.slice(1));
        if (!isIndexFile) {
          nsParts.push(code);
        }
        if (nsParts.length > 0) {
          namespace = nsParts.join('.');
        }
      }

      let name: string | undefined;
      let dirVal: 'ltr' | 'rtl' | undefined;

      try {
        const { meta } = await loadLocaleFile(fullPath, ext);
        if (meta?.name) name = meta.name;
        if (meta?.dir) dirVal = meta.dir;
        if (meta?.isDefault) isDefault = true;
      } catch {
        logger.warn(`Failed to parse locale file: ${relativePath}`);
      }

      if (isDefault && finalCode === 'default') {
        finalCode = 'en';
      }

      locales.push({
        fullPath,
        relativePath,
        dirname: dirname(relativePath),
        basename: basename(relativePath),
        code: finalCode,
        namespace,
        isDefault,
        name,
        dir: dirVal
      });
    }
  }

  return locales;
}

async function scanAppEntry(srcDir: string): Promise<ScannedAppEntry> {
  const result: ScannedAppEntry = {
    shared: { exists: false },
    server: { exists: false },
    client: { exists: false }
  };

  const findEntry = async (baseName: string): Promise<AppEntry> => {
    for (const ext of APP_EXTENSIONS) {
      const fullPath = join(srcDir, `${baseName}.${ext}`);
      const exists = await fileExists(fullPath);
      if (exists) {
        return { exists: true, fullPath, relativePath: `${baseName}.${ext}` };
      }
    }
    return { exists: false };
  };

  const [shared, server, client] = await Promise.all([
    findEntry('app'),
    findEntry('app.server'),
    findEntry('app.client')
  ]);

  result.shared = shared;
  result.server = server;
  result.client = client;

  return result;
}

async function scanServerEntry(srcDir: string): Promise<ScannedServerEntry> {
  const result: ScannedServerEntry = {
    shared: { exists: false },
    dev: { exists: false },
    prod: { exists: false }
  };

  const findEntry = async (baseName: string): Promise<AppEntry> => {
    for (const ext of APP_EXTENSIONS) {
      const fullPath = join(srcDir, `${baseName}.${ext}`);
      const exists = await fileExists(fullPath);
      if (exists) {
        return { exists: true, fullPath, relativePath: `${baseName}.${ext}` };
      }
    }
    return { exists: false };
  };

  const [shared, dev, prod] = await Promise.all([
    findEntry('server'),
    findEntry('server.dev'),
    findEntry('server.prod')
  ]);

  result.shared = shared;
  result.dev = dev;
  result.prod = prod;

  return result;
}

async function fileExists(path: string): Promise<boolean> {
  const { existsSync } = await import('node:fs');
  return existsSync(path);
}

function routeToName(route: string): string {
  if (route === '/') return 'Index';
  const segments = route
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')
    .map(seg => {
      if (seg.startsWith(':')) {
        const param = seg.slice(1).replace('?', '');
        return param.split('_').map(capitalize).join('');
      }
      return seg.split(/[-_]/).map(capitalize).join('');
    });
  return segments.join('');
}

/**
 * Build a `PageHead` from Markdown frontmatter.
 *
 * Only the `head` field is used, matching `unplugin-vue-markdown`'s
 * `headField: 'head'` option so SSR and client-side `useHead` stay in sync.
 *
 * Supported shape:
 * ```yaml
 * head:
 *   title: "Page Title"
 *   meta:
 *     - name: description
 *       content: ...
 *   link:
 *     - rel: canonical
 *       href: ...
 * ```
 */
function buildMarkdownHead(fm?: Record<string, unknown>): PageHead | undefined {
  if (!fm || typeof fm.head !== 'object' || fm.head === null) return undefined;

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
