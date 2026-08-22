import { scanContentSources } from './scan';
import type { ScanContentSourcesOptions } from './scan';
import type { ContentDocument } from './types';

export interface ContentPageRouteOptions {
  /** URL prefix, e.g. `/blog`. `_path` `/hello` becomes `/blog/hello`. */
  prefix?: string;
  includeDrafts?: boolean;
}

export interface DiscoverContentPageRoutesOptions extends ScanContentSourcesOptions {
  includeDrafts?: boolean;
}

function joinPrefix(prefix: string | undefined, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!prefix || prefix === '/') return normalized === '' ? '/' : normalized;
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (normalized === '/') return base || '/';
  return `${base}${normalized}`;
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
  const { includeDrafts, ...scanOptions } = options;
  const collections = scanContentSources(rootDir, scanOptions);
  const docs = Object.values(collections).flat();
  return extractContentPageRoutes(docs, { includeDrafts });
}
