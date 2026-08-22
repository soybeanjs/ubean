/**
 * Production HTTP/ISR cache backend selection.
 *
 * Node-like runtimes persist to `.ubean/cache` so HIT survives process
 * restart. Serverless/edge presets stay in-process memory — they must
 * not pretend a local filesystem is shared across isolates.
 *
 * Explicit `{ store: 'memory' | 'fs' }` always wins over `auto`.
 */

export type CacheStoreKind = 'memory' | 'fs' | 'auto';

export interface CacheStoreConfig {
  store?: CacheStoreKind;
  dir?: string;
}

export interface ResolvedCacheStoreConfig {
  store: 'memory' | 'fs';
  dir?: string;
}

const DEFAULT_FS_DIR = '.ubean/cache';

/** Preset names / aliases whose filesystem is ephemeral or not shared. */
const EPHEMERAL_CACHE_PRESETS = new Set([
  'cloudflare',
  'cloudflare-pages',
  'cloudflare-module',
  'cf',
  'wrangler',
  'workers',
  'cloudflare-dev',
  'cf-dev',
  'wrangler-dev',
  'vercel',
  'vercel-serverless',
  'vercel-node',
  'vercel-edge',
  'vercel-edge-function',
  'netlify',
  'netlify-functions',
  'netlify-node',
  'aws',
  'azure'
]);

export function isEphemeralCachePreset(presetName: string): boolean {
  return EPHEMERAL_CACHE_PRESETS.has(presetName);
}

/**
 * Resolve the production cache backend for a build preset.
 *
 * Dev / `createUbeanApp` still treat `auto` as memory so tests and
 * local servers do not write a cache directory unless asked.
 */
export function resolveProductionCacheStore(presetName: string, explicit?: CacheStoreConfig): ResolvedCacheStoreConfig {
  const store = explicit?.store ?? 'auto';
  if (store === 'fs') {
    return { store: 'fs', dir: explicit?.dir || DEFAULT_FS_DIR };
  }
  if (store === 'memory') {
    return explicit?.dir ? { store: 'memory', dir: explicit.dir } : { store: 'memory' };
  }
  if (isEphemeralCachePreset(presetName)) {
    return { store: 'memory' };
  }
  return { store: 'fs', dir: explicit?.dir || DEFAULT_FS_DIR };
}
