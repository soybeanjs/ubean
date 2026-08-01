// Sidebar Information Architecture (5 sections) per DESIGN.md §6.
// Drives <SiderMenu> and the home page's section links.
// Labels are bilingual (EN + ZH) so the sidebar can switch language with
// the current locale without a separate i18n message file.
export interface MenuItem {
  label: string;
  /** Chinese label; falls back to `label` when undefined. */
  labelZh?: string;
  to: string;
  /** Architecture docs carry a status badge; undefined for other sections. */
  status?: 'implemented' | 'historical' | 'proposal';
}

export interface MenuSection {
  /** i18n key suffix, e.g. 'getting-started' → sidebar.getting_started */
  value: string;
  /** Display label (EN). */
  label: string;
  /** Chinese label; falls back to `label` when undefined. */
  labelZh?: string;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [
  {
    value: 'getting-started',
    label: 'Getting Started',
    labelZh: '快速入门',
    items: [
      { label: 'Introduction', labelZh: '简介', to: '/guide/introduction' },
      { label: 'Quick Start', labelZh: '快速开始', to: '/guide/quickstart' },
      { label: 'App Modes', labelZh: '应用模式', to: '/guide/app-modes' },
      { label: 'Routing Modes', labelZh: '路由模式', to: '/guide/routing-modes' }
    ]
  },
  {
    value: 'guide',
    label: 'Guide',
    labelZh: '指南',
    items: [
      { label: 'Pages & Routing', labelZh: '页面与路由', to: '/guide/pages-routing/overview' },
      { label: 'Data Loaders', labelZh: '数据加载器', to: '/guide/pages-routing/loaders' },
      { label: 'Actions', labelZh: '操作', to: '/guide/pages-routing/actions' },
      { label: 'Internationalization', labelZh: '国际化', to: '/guide/i18n' },
      { label: 'Islands', labelZh: '群岛架构', to: '/guide/islands' }
    ]
  },
  {
    value: 'integrations',
    label: 'Integrations',
    labelZh: '集成',
    items: [
      { label: 'Auth', labelZh: '认证', to: '/integrations/auth' },
      { label: 'Database', labelZh: '数据库', to: '/integrations/database' },
      { label: 'Electron', labelZh: 'Electron', to: '/integrations/electron' },
      { label: 'Icons', labelZh: '图标', to: '/integrations/icons' },
      { label: 'Pinia', labelZh: 'Pinia', to: '/integrations/pinia' },
      { label: 'UI', labelZh: 'UI 组件', to: '/integrations/ui' }
    ]
  },
  {
    value: 'reference',
    label: 'Reference',
    labelZh: 'API 参考',
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
    labelZh: '参考指南',
    items: [
      { label: 'Cache', labelZh: '缓存', to: '/reference/cache' },
      { label: 'Database', labelZh: '数据库', to: '/reference/database' },
      { label: 'Env', labelZh: '环境变量', to: '/reference/env' },
      { label: 'I18n', labelZh: '国际化', to: '/reference/i18n' },
      { label: 'Response Helpers', labelZh: '响应助手', to: '/reference/response-helpers' },
      { label: 'Route Helpers', labelZh: '路由助手', to: '/reference/route-helpers' }
    ]
  },
  {
    value: 'architecture',
    label: 'Architecture',
    labelZh: '架构',
    items: [
      // Core concepts — entry point & mental model
      { label: 'Overview', labelZh: '概览', to: '/architecture/overview', status: 'implemented' },
      { label: 'Architecture', labelZh: '架构', to: '/architecture/architecture', status: 'implemented' },
      // Internals — how the framework works under the hood
      { label: 'Routing', labelZh: '路由', to: '/architecture/routing', status: 'implemented' },
      { label: 'Runtime', labelZh: '运行时', to: '/architecture/runtime', status: 'implemented' },
      { label: 'Engineering', labelZh: '工程化', to: '/architecture/engineering', status: 'implemented' },
      // Community & comparison
      { label: 'Ecosystem', labelZh: '生态系统', to: '/architecture/ecosystem', status: 'implemented' },
      { label: 'Framework Comparison', labelZh: '框架对比', to: '/architecture/framework-comparison', status: 'implemented' },
      { label: 'Roadmap', labelZh: '路线图', to: '/architecture/roadmap', status: 'implemented' },
      // Design records & proposals (historical context)
      { label: 'Subpackage Splitting', labelZh: '子包拆分', to: '/architecture/subpackage-splitting', status: 'historical' },
      { label: 'Islands Auto-Registry', labelZh: '群岛自动注册', to: '/architecture/islands-auto-registry', status: 'proposal' },
      { label: 'App Modes (ADR)', labelZh: '应用模式 (ADR)', to: '/architecture/modes', status: 'historical' },
      { label: 'ubean-studio', to: '/architecture/ubean-studio', status: 'proposal' }
    ]
  }
];
