// Sidebar Information Architecture (5 sections) per DESIGN.md §6.
// Drives <SiderMenu> and the home page's section links.
export interface MenuItem {
  label: string;
  to: string;
  /** Architecture docs carry a status badge; undefined for other sections. */
  status?: 'implemented' | 'historical' | 'proposal';
}

export interface MenuSection {
  /** i18n key suffix, e.g. 'getting-started' → sidebar.getting_started */
  value: string;
  /** Display label (EN) — zh translations come from locales. */
  label: string;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [
  {
    value: 'getting-started',
    label: 'Getting Started',
    items: [
      { label: 'Introduction', to: '/guide/introduction' },
      { label: 'Quick Start', to: '/guide/quickstart' },
      { label: 'App Modes', to: '/guide/app-modes' },
      { label: 'Routing Modes', to: '/guide/routing-modes' }
    ]
  },
  {
    value: 'guide',
    label: 'Guide',
    items: [
      { label: 'Pages & Routing', to: '/guide/pages-routing/overview' },
      { label: 'Data Loaders', to: '/guide/pages-routing/loaders' },
      { label: 'Actions', to: '/guide/pages-routing/actions' },
      { label: 'Internationalization', to: '/guide/i18n' },
      { label: 'Islands', to: '/guide/islands' }
    ]
  },
  {
    value: 'integrations',
    label: 'Integrations',
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
    label: 'Reference',
    items: [
      { label: 'ubean (main)', to: '/reference/api/ubean' },
      { label: '@ubean/runtime', to: '/reference/api/runtime' },
      { label: '@ubean/routing', to: '/reference/api/routing' },
      { label: '@ubean/config', to: '/reference/api/config' },
      { label: '@ubean/auth', to: '/reference/api/auth' },
      { label: '@ubean/ui', to: '/reference/api/ui' },
      { label: '@ubean/pinia', to: '/reference/api/pinia' }
    ]
  },
  {
    value: 'reference-guides',
    label: 'Reference Guides',
    items: [
      { label: 'Cache', to: '/reference/cache' },
      { label: 'Database', to: '/reference/database' },
      { label: 'Env', to: '/reference/env' },
      { label: 'I18n', to: '/reference/i18n' },
      { label: 'Response Helpers', to: '/reference/response-helpers' },
      { label: 'Route Helpers', to: '/reference/route-helpers' }
    ]
  },
  {
    value: 'architecture',
    label: 'Architecture',
    items: [
      { label: 'Overview', to: '/architecture/overview', status: 'implemented' },
      { label: 'Architecture', to: '/architecture/architecture', status: 'implemented' },
      { label: 'Routing', to: '/architecture/routing', status: 'implemented' },
      { label: 'Runtime', to: '/architecture/runtime', status: 'implemented' },
      { label: 'Engineering', to: '/architecture/engineering', status: 'implemented' },
      { label: 'Roadmap', to: '/architecture/roadmap', status: 'implemented' },
      { label: 'Ecosystem', to: '/architecture/ecosystem', status: 'implemented' },
      { label: 'Framework Comparison', to: '/architecture/framework-comparison', status: 'implemented' },
      { label: 'Subpackage Splitting', to: '/architecture/subpackage-splitting', status: 'historical' },
      { label: 'App Modes', to: '/architecture/modes', status: 'historical' },
      { label: 'Islands Auto-Registry', to: '/architecture/islands-auto-registry', status: 'proposal' },
      { label: 'ubean-studio', to: '/architecture/ubean-studio', status: 'proposal' },
      { label: 'Test Checklist', to: '/architecture/test', status: 'implemented' }
    ]
  }
];
