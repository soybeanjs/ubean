/**
 * 视图清单 —— dock 侧栏（hub 外壳的 member docks）与 SPA 内部路由的**唯一来源**。
 *
 * 它只存在于客户端：SPA 启动后通过 devframe 的 frame-nav 协议（`useFrameTabs`）把这份清单
 * postMessage 给 hub 外壳，外壳据此合成 member docks。服务端**不需要**知道视图列表 —— 旧的
 * `UBEAN_VIEWS`（服务端那份）已随迁到 devframe 删除，两边不再有需要同步的第二份。
 */
export interface UbeanView {
  /** tab id（frame-nav 的 `FrameTab.id`，也是 hash 路由段）。 */
  id: string;
  /** dock 侧栏里的标题。 */
  title: string;
  /** Iconify 图标名。 */
  icon: string;
}

export const UBEAN_VIEWS: readonly UbeanView[] = [
  { id: 'overview', title: 'Overview', icon: 'lucide:layout-dashboard' },
  { id: 'pages', title: 'Pages', icon: 'lucide:file-text' },
  { id: 'api', title: 'API', icon: 'lucide:send' },
  { id: 'middleware', title: 'Middleware', icon: 'lucide:layers' },
  { id: 'crons', title: 'Crons', icon: 'lucide:clock' },
  { id: 'config', title: 'Config', icon: 'lucide:settings' },
  { id: 'env', title: 'Env', icon: 'lucide:terminal' },
  { id: 'api-docs', title: 'API Docs', icon: 'lucide:book-open' },
  { id: 'database', title: 'Database', icon: 'lucide:database' },
  { id: 'terminal', title: 'Terminal', icon: 'lucide:square-terminal' },
  { id: 'ai', title: 'AI', icon: 'lucide:sparkles' }
];
