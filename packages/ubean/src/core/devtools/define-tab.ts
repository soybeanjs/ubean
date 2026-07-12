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
