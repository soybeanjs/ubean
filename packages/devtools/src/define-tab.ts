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

const customTabs: DevToolsTabDefinition[] = [];

export function defineDevToolsTab(tab: DevToolsTabDefinition): DevToolsTabDefinition {
  const exists = customTabs.findIndex(t => t.id === tab.id);
  if (exists !== -1) {
    customTabs[exists] = tab;
  } else {
    customTabs.push(tab);
  }
  return tab;
}

export function getCustomTabs(): DevToolsTabDefinition[] {
  return [...customTabs];
}

export function clearCustomTabs(): void {
  customTabs.length = 0;
}
