import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'pathe';
import { parseContentFile } from './runtime';
import type { ContentDocument } from './types';

export interface ContentPageRouteOptions {
  /** URL prefix, e.g. `/blog`. `_path` `/hello` becomes `/blog/hello`. */
  prefix?: string;
  includeDrafts?: boolean;
}

export interface DiscoverContentPageRoutesOptions {
  sources?: Record<string, { dir: string; prefix?: string; type?: string }>;
  defaultDir?: string;
  includeDrafts?: boolean;
}

function joinPrefix(prefix: string | undefined, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!prefix || prefix === '/') return normalized === '' ? '/' : normalized;
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (normalized === '/') return base || '/';
  return `${base}${normalized}`;
}

function walkContentFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walkContentFiles(fullPath, files);
    } else if (/\.(md|mdx|json|ya?ml)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Map content collection documents to concrete prerender / file-route URLs.
 *
 * Pair with a catch-all page (`pages/blog/[...slug].vue`) that reads
 * `queryCollection('blog')`. Pass the result into `prerender.include` or
 * `collectPrerenderRoutes({ contentRoutes })`.
 */
export function extractContentPageRoutes(
  docs: Array<Pick<ContentDocument, '_path' | '_draft' | '_partial'>>,
  options: ContentPageRouteOptions = {}
): string[] {
  const includeDrafts = options.includeDrafts === true;
  return docs
    .filter(doc => (includeDrafts || !doc._draft) && !doc._partial)
    .map(doc => joinPrefix(options.prefix, doc._path || '/'));
}

/**
 * Scan content source directories on disk and return prerender URLs.
 *
 * Used by `ubean build` when `content` is enabled, and by apps that want
 * the same discovery without running Vite.
 */
export function discoverContentPageRoutes(rootDir: string, options: DiscoverContentPageRoutesOptions = {}): string[] {
  const sources = options.sources ?? { content: { dir: options.defaultDir ?? 'content' } };
  const docs: Array<Pick<ContentDocument, '_path' | '_draft' | '_partial'>> = [];

  for (const source of Object.values(sources)) {
    const contentDir = join(rootDir, source.dir);
    for (const fullPath of walkContentFiles(contentDir)) {
      const relative = fullPath.slice(contentDir.length).replace(/^[\\/]/, '');
      try {
        const parsed = parseContentFile(readFileSync(fullPath, 'utf-8'), relative, { type: source.type });
        if (source.prefix) {
          parsed._path = joinPrefix(source.prefix, parsed._path);
        }
        docs.push(parsed);
      } catch {
        /* skip unreadable files */
      }
    }
  }

  return extractContentPageRoutes(docs, { includeDrafts: options.includeDrafts });
}
