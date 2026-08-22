import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'pathe';
import { parseContent } from './core';
import type { ContentDocument } from './types';

export interface ContentSourceScanConfig {
  dir: string;
  prefix?: string;
  type?: string;
}

export interface ScanContentSourcesOptions {
  sources?: Record<string, ContentSourceScanConfig>;
  defaultDir?: string;
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
 * Read content source directories on disk into named document arrays.
 *
 * Used by the Vite plugin (dev), production server bootstrap, and
 * prerender URL discovery so `queryCollection` is not Vite-only.
 */
export function scanContentSources(
  rootDir: string,
  options: ScanContentSourcesOptions = {}
): Record<string, ContentDocument[]> {
  const defaultDir = options.defaultDir ?? 'content';
  const sources = options.sources ?? { content: { dir: defaultDir } };
  const loaded: Record<string, ContentDocument[]> = {};

  for (const [name, source] of Object.entries(sources)) {
    const contentDir = join(rootDir, source.dir || defaultDir);
    const documents: ContentDocument[] = [];
    for (const fullPath of walkContentFiles(contentDir)) {
      const rel = relative(contentDir, fullPath).replace(/\\/g, '/');
      try {
        const parsed = parseContent(readFileSync(fullPath, 'utf-8'), rel, { type: source.type });
        if (source.prefix) {
          parsed._path = joinPrefix(source.prefix, parsed._path);
        }
        documents.push(parsed);
      } catch (err) {
        console.warn(`[ubean-content] Failed to parse ${rel}:`, err);
      }
    }
    loaded[name] = documents;
  }

  return loaded;
}
