import type { DevToolsCustomTab } from './types';

/** Alias kept for backward compatibility — the canonical type is {@link DevToolsCustomTab}. */
export type DevToolsTabDefinition = DevToolsCustomTab;

const customTabs: DevToolsCustomTab[] = [];

export function defineDevToolsTab(tab: DevToolsCustomTab): DevToolsCustomTab {
  const exists = customTabs.findIndex(t => t.id === tab.id);
  if (exists !== -1) {
    customTabs[exists] = tab;
  } else {
    customTabs.push(tab);
  }
  return tab;
}

export function getCustomTabs(): DevToolsCustomTab[] {
  return [...customTabs];
}

export function clearCustomTabs(): void {
  customTabs.length = 0;
}
