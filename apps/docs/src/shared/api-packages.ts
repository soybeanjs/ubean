/**
 * The curated API-reference package list — the single source of truth.
 *
 * Three places used to disagree about which packages have a generated API page:
 * `ubean.config.ts` (prerender route list), the page renderer (which slugs are
 * allowed), and `scripts/build-api.mjs` (which JSON files actually get written).
 * The intersection was the only working subset, so the sidebar linked to four
 * 404 pages (`client`, `vue`, `scan`, `integrations`) while four others
 * (`runtime`, `routing`, `ui`, `pinia`) were prerendered with no data behind them.
 *
 * Now the build script, the prerender collector and the client sidebar all read
 * this list, so adding a package is a one-line change.
 *
 * `slug` is the public route segment (`/reference/api/<slug>`); `pkg` is the
 * package's public name; `distDir` is where its built .d.ts lives.
 */
export interface ApiPackage {
  /** Public route segment: `/reference/api/<slug>`. */
  slug: string;
  /** Display name shown in the sidebar. */
  label: string;
  /** Directory under `packages/` whose `dist/` holds the type declarations. */
  distDir: string;
}

export const API_PACKAGES: ApiPackage[] = [
  { slug: 'ubean', label: 'ubean (main)', distDir: 'ubean' },
  { slug: 'client', label: '@ubean/client', distDir: 'client' },
  { slug: 'vue', label: '@ubean/vue', distDir: 'vue' },
  { slug: 'scan', label: '@ubean/scan', distDir: 'scan' },
  { slug: 'config', label: '@ubean/config', distDir: 'config' },
  { slug: 'auth', label: '@ubean/auth', distDir: 'auth' },
  { slug: 'integrations', label: '@ubean/integrations', distDir: 'integrations' }
];

/** Public route for one API reference page. */
export function apiRoutePath(slug: string): string {
  return `/reference/api/${slug}`;
}

export const API_ROUTE_PREFIX = '/reference/api/';
