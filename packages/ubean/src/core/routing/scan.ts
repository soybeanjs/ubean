import { join, relative, dirname, basename, extname, isAbsolute } from 'pathe';
import { glob } from 'tinyglobby';
import { filePathToRoute } from '../../utils/path';
import { extractDefinePage } from './define-page';
import { detectHttpExports } from './detect-exports';
import { HTTP_METHODS, GLOB_SCAN_PATTERN, GLOB_VUE_PATTERN } from './types';
import type {
  ScanOptions,
  ScanResult,
  ScannedApiRoute,
  ScannedMiddleware,
  ScannedPageRoute,
  ScannedLayout,
  ScannedPlugin
} from './types';

const DEFAULT_DIRS = {
  routes: 'routes',
  middleware: 'middleware',
  pages: 'pages',
  layouts: 'layouts',
  plugins: 'plugins'
};

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

  const [apiRoutes, middlewares, pages, layouts, plugins] = await Promise.all([
    scanApiRoutes(srcDir, dirs.routes, ignore),
    scanMiddlewares(srcDir, dirs.middleware, ignore),
    scanPages(srcDir, dirs.pages, ignore),
    scanLayouts(srcDir, dirs.layouts, ignore),
    scanPlugins(srcDir, dirs.plugins, ignore)
  ]);

  return { apiRoutes, middlewares, pages, layouts, plugins };
}

async function scanApiRoutes(srcDir: string, dirName: string, ignore: string[]): Promise<ScannedApiRoute[]> {
  const dir = join(srcDir, dirName);
  const files = await glob(GLOB_SCAN_PATTERN, {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/*.vue', '**/_*'],
    absolute: true
  }).catch(() => [] as string[]);

  const routes: ScannedApiRoute[] = [];

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
      hasValidator: false,
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
        hasValidator: detected.hasValidator,
        fileMeta: detected.fileMeta
      });
    }
  }

  return routes;
}

async function scanMiddlewares(srcDir: string, dirName: string, ignore: string[]): Promise<ScannedMiddleware[]> {
  const dir = join(srcDir, dirName);
  const files = await glob(GLOB_SCAN_PATTERN, {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/*.vue', '**/index.*', '**/_*'],
    absolute: true
  }).catch(() => [] as string[]);

  return files.sort().map(fullPath => {
    const relativePath = toPosixPath(relative(dir, fullPath));
    const base = basename(relativePath, extname(relativePath));
    const { order, cleanName } = splitOrderPrefix(base);
    return {
      fullPath,
      relativePath,
      dirname: dirname(relativePath),
      basename: basename(relativePath),
      order,
      global: cleanName === 'global' || cleanName.startsWith('global.')
    };
  });
}

async function scanPages(srcDir: string, dirName: string, ignore: string[]): Promise<ScannedPageRoute[]> {
  const dir = join(srcDir, dirName);
  const files = await glob(GLOB_VUE_PATTERN, {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/components/**', '**/_*'],
    absolute: true
  }).catch(() => [] as string[]);

  const pages: ScannedPageRoute[] = [];

  for (const fullPath of files.sort()) {
    const relativePath = toPosixPath(relative(dir, fullPath));
    const ext = extname(relativePath);
    const base = basename(relativePath, ext);

    if (base.startsWith('_')) continue;

    const isReuse = base.endsWith('.reuse');
    const pageBase = isReuse ? base.slice(0, -'.reuse'.length) : base;
    const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
    const fileBase = dirPart ? `${dirPart}/${pageBase}` : pageBase;
    const { route } = filePathToRoute(fileBase);
    const name = routeToName(route);

    const pageMeta = await extractDefinePage(fullPath).catch(() => null);

    pages.push({
      fullPath,
      relativePath,
      dirname: dirname(relativePath),
      basename: basename(relativePath),
      name: pageMeta?.name || name,
      route: pageMeta?.path || route,
      path: pageMeta?.path || route,
      layout: pageMeta?.layout,
      isReuse,
      reuseTarget: pageMeta?.reuse,
      pageMeta: pageMeta || undefined
    });
  }

  return pages;
}

async function scanLayouts(srcDir: string, dirName: string, ignore: string[]): Promise<ScannedLayout[]> {
  const dir = join(srcDir, dirName);
  const files = await glob(GLOB_VUE_PATTERN, {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/_*'],
    absolute: true
  }).catch(() => [] as string[]);

  return files.sort().map(fullPath => {
    const relativePath = toPosixPath(relative(dir, fullPath));
    const base = basename(relativePath, extname(relativePath));
    const dirPart = dirname(relativePath) === '.' ? '' : dirname(relativePath);
    const layoutBase = base === 'index' ? dirPart : dirPart ? `${dirPart}/${base}` : base;
    const isDefault = base === 'default' || (base === 'index' && !dirPart);
    const name = layoutBase || 'default';
    return {
      fullPath,
      relativePath,
      dirname: dirname(relativePath),
      basename: basename(relativePath),
      name,
      path: toPosixPath(relativePath),
      isDefault
    };
  });
}

async function scanPlugins(srcDir: string, dirName: string, ignore: string[]): Promise<ScannedPlugin[]> {
  const dir = join(srcDir, dirName);
  const files = await glob(GLOB_SCAN_PATTERN, {
    cwd: dir,
    dot: true,
    ignore: [...ignore, '**/*.vue', '**/_*'],
    absolute: true
  }).catch(() => [] as string[]);

  return files.sort().map(fullPath => {
    const relativePath = toPosixPath(relative(dir, fullPath));
    const base = basename(relativePath, extname(relativePath));
    const { order } = splitOrderPrefix(base);
    return {
      fullPath,
      relativePath,
      dirname: dirname(relativePath),
      basename: basename(relativePath),
      order
    };
  });
}

function routeToName(route: string): string {
  if (route === '/') return 'index';
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
