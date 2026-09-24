// Sidebar Information Architecture.
//
// Six top-level groups matching the actual content tree under `src/content/{locale}/`:
// guide/, integrations/, reference/, architecture/, ecosystem/, contributing/.
// The previous 8-section layout split `reference/` into two parallel groups
// (generated API pages + hand-written guides) which duplicated one directory;
// that is folded back into a single `reference` group with an `api` subgroup.
//
// `to` paths are locale-agnostic (no `/zh` prefix) — ubean's `<Link>` and
// `@vean/ui`'s link handling both resolve through the framework's injected
// localizer, so the same table drives both locales.
//
// `label` is an i18n key suffix under `sidebar_items.*`, NOT display text: the
// sidebar renders these in both locales, and hardcoded English is what made the
// Chinese sidebar read "Introduction / Quick Start / Cache" while the page
// titles beside it were「简介」「快速开始」「缓存」. Keys are derived from each
// item's route so the two cannot drift apart.
import { API_PACKAGES, apiRoutePath } from '~/shared/api-packages';

/**
 * `to` is the locale-agnostic route; the sidebar resolves the display label from
 * it via `sidebarItemKey()`. `label` is kept only as a fallback for routes that
 * have no translated entry.
 */
export interface MenuItem {
  label: string;
  to: string;
}

/**
 * Route → i18n key suffix under `sidebar_items.*`.
 *
 * The full path, verbatim: `/guide/pages-routing/overview` →
 * `guide_pages_routing_overview`. No special cases — an earlier version dropped
 * a trailing `overview` to make section keys shorter, and that rule silently
 * disagreed with the catalogue (it produced `architecture` where the key file
 * said `architecture_overview`), so the sidebar fell back to English. Deriving
 * the key mechanically is what keeps the two in step.
 */
export function sidebarItemKey(to: string): string {
  // `pages-routing` → `pages_routing`: keys are snake_case, routes are kebab.
  return to.split('/').filter(Boolean).join('_').replace(/-/gu, '_');
}

export interface MenuSection {
  /** i18n key suffix under `sidebar.*`, also used as the STreeMenu group value. */
  value: string;
  items: MenuItem[];
  /** Optional nested subgroups (rendered as a nested STreeMenu level). */
  groups?: { label: string; items: MenuItem[] }[];
}

export const menuSections: MenuSection[] = [
  {
    value: 'guide',
    items: [
      { label: 'Introduction', to: '/guide/introduction' },
      { label: 'Quick Start', to: '/guide/quickstart' },
      { label: 'App Modes', to: '/guide/app-modes' },
      { label: 'Routing Modes', to: '/guide/routing-modes' },
      { label: 'Pages & Routing', to: '/guide/pages-routing/overview' },
      { label: 'Data Loaders', to: '/guide/pages-routing/loaders' },
      { label: 'Actions', to: '/guide/pages-routing/actions' },
      { label: 'Internationalization', to: '/guide/i18n' },
      { label: 'Content & Search', to: '/guide/content' },
      { label: 'Islands', to: '/guide/islands' }
    ]
  },
  {
    value: 'integrations',
    items: [
      { label: 'Auth', to: '/integrations/auth' },
      { label: 'Database', to: '/integrations/database' },
      { label: 'Electron', to: '/integrations/electron' },
      { label: 'Icons', to: '/integrations/icons' },
      { label: 'Pinia', to: '/integrations/pinia' },
      { label: 'UI', to: '/integrations/ui' }
    ]
  },
  {
    value: 'reference',
    items: [
      { label: 'Cache', to: '/reference/cache' },
      { label: 'Database', to: '/reference/database' },
      { label: 'Env', to: '/reference/env' },
      { label: 'I18n', to: '/reference/i18n' },
      { label: 'Response Helpers', to: '/reference/response-helpers' },
      { label: 'Route Helpers', to: '/reference/route-helpers' }
    ],
    groups: [
      {
        label: 'API Reference',
        // Derived from the shared curated list so the sidebar cannot link to a
        // package that has no generated JSON (the old 4-way divergence).
        items: API_PACKAGES.map(pkg => ({ label: pkg.label, to: apiRoutePath(pkg.slug) }))
      }
    ]
  },
  {
    value: 'architecture',
    // Explanatory content only — how the framework works under the hood (ADR-0007).
    items: [
      { label: 'Overview', to: '/architecture/overview' },
      { label: 'Architecture', to: '/architecture/architecture' },
      { label: 'Routing', to: '/architecture/routing' },
      { label: 'Runtime', to: '/architecture/runtime' },
      { label: 'Framework Comparison', to: '/architecture/framework-comparison' }
    ]
  },
  {
    value: 'ecosystem',
    items: [{ label: 'Ecosystem', to: '/ecosystem/ecosystem' }]
  },
  {
    value: 'contributing',
    items: [{ label: 'Engineering', to: '/contributing/engineering' }]
  }
];

/**
 * Top-level header destinations: one representative route per major group.
 * Derived from `menuSections` so the header cannot drift from the sidebar.
 */
export const headerNavSections = ['guide', 'integrations', 'reference', 'architecture'] as const;
