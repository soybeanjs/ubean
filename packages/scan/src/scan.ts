import { readFile } from 'node:fs/promises';
import { getLogger } from '@ubean/logger';
import { filePathToRoute } from '@ubean/vue/vite';
import { scanPages } from '@ubean/vue/vite';
import { join, relative, dirname, basename, extname, isAbsolute } from 'pathe';
import { glob } from 'tinyglobby';
import { detectHttpExports } from './detect-exports';
import { HTTP_METHODS, GLOB_SCAN_PATTERN } from './types';

import type {
  ScanOptions,
  ScanResult,
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPlugin,
  ScannedAppEntry,
  ScannedServerEntry,
  ScannedCronTask,
  ScannedQueue,
  ScannedLocale,
  AppEntry
} from './types';

/**
 * 聚合层项目扫描:`@ubean/scan` = 服务端目录扫描(API 路由/中间件/
 * 插件/crons/queues/locales/entries)+ 页面路由(委托 `@ubean/vue` 的
 * 页面扫描器 —— 页面路由唯一所有者)。
 *
 * 页面/布局扫描、reuse cache 继承、markdown frontmatter、页面级 head、
 * 特殊页(404/loading/error)、并行/拦截路由、`[param=matcher]` 语法均
 * 在 `@ubean/vue/vite` 的 `scanPages` 中实现;本文件只做聚合与默认值
 * (框架模式:markdown 开启、head 开启,保证 SSR `pageObj.head` 链路可用)。
 */

const logger = getLogger('routing');

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

  // 框架聚合模式:markdown 默认开启(与历史行为一致),head 默认开启(SSR 需要)。
  // 精简内核(`@ubean/vue/vite` 直接使用)两者默认关闭。
  const markdown = options.markdown === undefined ? true : options.markdown;
  const head = options.head === undefined ? true : options.head;

  const [apiRoutes, middlewares, pagesResult, plugins, crons, queues, locales, appEntry, serverEntry] =
    await Promise.all([
      scanApiRoutes(srcDir, dirs.routes, ignore),
      scanMiddlewares(srcDir, dirs.middleware, ignore),
      scanPages({
        cwd: options.cwd,
        srcDir,
        pagesDir: dirs.pages,
        layoutsDir: dirs.layouts,
        ignore: options.ignore,
        markdown,
        head
      }),
      scanPlugins(srcDir, dirs.plugins, ignore),
      scanCrons(srcDir, dirs.crons, ignore),
      scanQueues(srcDir, dirs.queues, ignore),
      scanLocales(srcDir, dirs.locales, ignore),
      scanAppEntry(srcDir),
      scanServerEntry(srcDir)
    ]);

  const { pages, layouts, notFoundPage, loadingPage, errorPage } = pagesResult;

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
          fileMeta: detected.fileMeta,
          matchers: parsed.matchers
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
