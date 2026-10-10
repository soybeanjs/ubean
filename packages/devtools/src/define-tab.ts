/**
 * Custom DevTools tab registration API.
 *
 * Migrated from `packages/ubean/src/core/devtools/define-tab.ts` during
 * Phase 7 aggregator switch. Provides a global registry for user-defined
 * DevTools tabs that are surfaced in the DevTools SPA via `DevToolsInfo.customTabs`.
 */

export interface DevToolsTabDefinition {
  id: string;
  label: string;
  icon?: string;
  src: string;
  sandbox?: string[];
}

/**
 * 自定义 tab 注册表 —— **真·进程单例**（挂在 `globalThis` 上）。
 *
 * 不能用模块级数组：dev 下同一个进程里常常有第二份 `@ubean/devtools`（CLI 动态 `import()`
 * 一份、用户的 `vite.config.ts` 又静态引一份；pnpm 也可能装出两份），模块级状态只在同一个模块
 * 实例内共享 —— 表现是「用户 `defineDevToolsTab()` 注册了 tab，面板里永远看不到」，且**没有任何
 * 报错**。同样的理由见 `@ubean/vue` 的 matcher 注册表与 `@ubean/islands` 的服务端组件注册表
 * （AGENTS.md 第 19 条）。
 *
 * 同名重复注册会覆盖 —— HMR 重新求值时因此能拿到最新的 tab 定义。
 */
const CUSTOM_TABS_KEY = '__ubean_devtools_custom_tabs__';

function getCustomTabsRegistry(): DevToolsTabDefinition[] {
  const store = globalThis as unknown as Record<string, unknown>;
  const existing = store[CUSTOM_TABS_KEY];
  if (Array.isArray(existing)) return existing as DevToolsTabDefinition[];
  const created: DevToolsTabDefinition[] = [];
  store[CUSTOM_TABS_KEY] = created;
  return created;
}

export function defineDevToolsTab(tab: DevToolsTabDefinition): DevToolsTabDefinition {
  const customTabs = getCustomTabsRegistry();
  const exists = customTabs.findIndex(t => t.id === tab.id);
  if (exists !== -1) {
    customTabs[exists] = tab;
  } else {
    customTabs.push(tab);
  }
  return tab;
}

export function getCustomTabs(): DevToolsTabDefinition[] {
  return [...getCustomTabsRegistry()];
}

export function clearCustomTabs(): void {
  getCustomTabsRegistry().length = 0;
}
