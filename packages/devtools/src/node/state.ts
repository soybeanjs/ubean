/**
 * SharedState management for the DTK integration.
 *
 * Replaces the old 3-second polling pattern: the server builds a
 * `DevToolsInfo` snapshot and pushes patches to all connected clients
 * via `ctx.rpc.sharedState`.
 */
import { relative, join } from 'node:path';
import type { ViteDevToolsNodeContext } from '@vitejs/devtools-kit';
import type { SharedState } from 'devframe/utils/shared-state';
import { maskSensitiveEnv } from '../shared/env';
import type { DevToolsInfo, DevToolsCustomTab } from '../types';

/** SharedState key for the ubean devtools info snapshot. */
export const UBEAN_INFO_STATE_KEY = 'ubean:info';

/**
 * Structural shape of the scan data passed by `dev.ts`. Defined here
 * (rather than importing ubean's `ScanResult`) so `@ubean/devtools`
 * has no static dependency on `ubean`.
 */
export interface ScanResultLike {
  apiRoutes: Array<{ method?: string; route: string; relativePath: string; fullPath: string }>;
  pages: Array<{
    route: string;
    name: string;
    relativePath: string;
    fullPath: string;
    isReuse: boolean;
    layout?: string | false;
  }>;
  middlewares: Array<{ global: boolean; relativePath: string; fullPath: string }>;
  layouts: Array<{ name: string; path: string; relativePath: string; fullPath: string; isDefault: boolean }>;
  crons: Array<{ name: string; relativePath: string; fullPath: string }>;
}

/** Config metadata passed by `dev.ts` for the DevToolsInfo.config field. */
export interface DevToolsConfigMeta {
  preset: string;
  rootDir: string;
  srcDir: string;
  openAPI?: { enabled: boolean; scalarPath?: string; openAPIPath?: string };
  database?: { drizzleStudioAvailable?: boolean; studioUrl?: string };
  /** Directory configuration for project structure (e.g. { routes: 'routes', pages: 'pages' }). */
  dir?: Record<string, string>;
}

export interface BuildInfoOptions {
  scan: ScanResultLike | null;
  configMeta: DevToolsConfigMeta | null;
  customTabs: DevToolsCustomTab[];
  ai?: { apiKey?: string; apiBase?: string; model?: string };
  startTime: number;
  envData: Record<string, string>;
}

/** Build a fresh `DevToolsInfo` from scan + config metadata. */
export function buildDevToolsInfo(opts: BuildInfoOptions): DevToolsInfo {
  const { scan, configMeta, customTabs, ai, startTime, envData } = opts;

  const rootDir = configMeta?.rootDir || '';
  const srcDir = configMeta?.srcDir || (rootDir ? join(rootDir, 'src') : 'src');
  const dirs = configMeta?.dir ?? {};

  const srcRel = rootDir ? relative(rootDir, srcDir).replace(/\\/g, '/') || 'src' : 'src';

  const routesDir = dirs.routes || 'routes';
  const pagesDir = dirs.pages || 'pages';
  const middlewareDir = dirs.middleware || 'middleware';
  const layoutsDir = dirs.layouts || 'layouts';
  const cronsDir = dirs.crons || 'crons';

  const routesPrefix = `${srcRel}/${routesDir}`;
  const pagesPrefix = `${srcRel}/${pagesDir}`;
  const middlewarePrefix = `${srcRel}/${middlewareDir}`;
  const layoutsPrefix = `${srcRel}/${layoutsDir}`;
  const cronsPrefix = `${srcRel}/${cronsDir}`;

  const makeFilePath = (fullPath: string, relPath: string, prefix: string): string => {
    if (!fullPath) return '';
    if (rootDir) {
      const rel = relative(rootDir, fullPath).replace(/\\/g, '/');
      if (rel && !rel.startsWith('..')) return rel;
    }
    const normalized = relPath.replace(/\\/g, '/');
    return `${prefix}/${normalized}`;
  };

  const routes = scan
    ? scan.apiRoutes.map(r => ({
        method: (r.method || 'GET').toUpperCase(),
        path: r.route,
        filePath: makeFilePath(r.fullPath, r.relativePath, routesPrefix)
      }))
    : [];

  const defaultLayoutName = scan?.layouts.find(l => l.isDefault)?.name;

  const pagesList = scan
    ? scan.pages
        .filter(p => !p.isReuse)
        .map(p => ({
          path: p.route,
          name: p.name,
          filePath: makeFilePath(p.fullPath, p.relativePath, pagesPrefix),
          layout: p.layout === false ? undefined : p.layout || defaultLayoutName || undefined
        }))
    : [];

  const middlewaresList = scan
    ? scan.middlewares.map(m => ({
        path: m.global ? '*' : m.relativePath,
        filePath: makeFilePath(m.fullPath, m.relativePath, middlewarePrefix),
        global: m.global
      }))
    : [];

  const layoutsList = scan
    ? scan.layouts.map(l => ({
        name: l.name,
        path: l.path,
        filePath: makeFilePath(l.fullPath, l.relativePath, layoutsPrefix),
        isDefault: l.isDefault
      }))
    : [];

  const cronsList = scan
    ? scan.crons.map(c => ({
        name: c.name,
        filePath: makeFilePath(c.fullPath, c.relativePath, cronsPrefix)
      }))
    : [];

  return {
    version: '0.0.1',
    startTime,
    config: configMeta
      ? {
          preset: configMeta.preset,
          rootDir: configMeta.rootDir,
          srcDir: configMeta.srcDir,
          dir: configMeta.dir
        }
      : {},
    env: maskSensitiveEnv(envData),
    pages: pagesList.length,
    apiRoutes: routes.length,
    middleware: middlewaresList.length,
    layouts: layoutsList.length,
    crons: cronsList.length,
    presets: configMeta ? [configMeta.preset] : [],
    routes,
    pagesList,
    middlewaresList,
    layoutsList,
    cronsList,
    customTabs,
    openAPI: configMeta?.openAPI ?? { enabled: false },
    database: configMeta?.database,
    ai: {
      enabled: !!(
        ai?.apiKey ||
        process.env.DEEPSEEK_API_KEY ||
        process.env.UBEAN_AI_API_KEY ||
        process.env.OPENAI_API_KEY
      ),
      provider: ai?.apiBase?.includes('deepseek')
        ? 'deepseek'
        : ai?.apiBase?.includes('anthropic')
          ? 'anthropic'
          : 'deepseek',
      model: ai?.model || (ai?.apiBase?.includes('deepseek') || !ai?.apiBase ? 'deepseek-chat' : ai.model)
    }
  };
}

/** Initial empty state (used before scan data arrives). */
export function emptyDevToolsInfo(startTime: number): DevToolsInfo {
  return {
    version: '0.0.1',
    startTime,
    config: {},
    env: {},
    pages: 0,
    apiRoutes: 0,
    middleware: 0,
    layouts: 0,
    crons: 0,
    presets: [],
    routes: [],
    pagesList: [],
    middlewaresList: [],
    layoutsList: [],
    cronsList: [],
    customTabs: [],
    ai: { enabled: false }
  };
}

/**
 * Create or retrieve the `ubean:info` shared state.
 * Called once during `devtools.setup`.
 */
export async function initSharedState(
  ctx: ViteDevToolsNodeContext,
  initialValue: DevToolsInfo
): Promise<SharedState<DevToolsInfo>> {
  return ctx.rpc.sharedState.get(UBEAN_INFO_STATE_KEY, { initialValue });
}

/**
 * Push a fresh `DevToolsInfo` into the shared state, triggering
 * patch-sync to all connected clients.
 */
export function refreshSharedState(state: SharedState<DevToolsInfo>, info: DevToolsInfo): void {
  state.mutate(draft => {
    Object.assign(draft, info);
  });
}
