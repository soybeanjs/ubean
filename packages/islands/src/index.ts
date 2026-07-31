// SSR/build-time types & helpers
export type {
  ClientDirective,
  IslandDefinition,
  IslandsContext,
  ClientHydrationStrategy,
  IslandSsrOptions
} from './types';

export {
  createIslandsContext,
  registerIsland,
  getIslandsScript,
  generateIslandPlaceholder,
  renderIslandPlaceholder,
  hydrationStrategyMeta
} from './types';

// v-client directive (P9-29: Vue directive system refactor)
export {
  vClient,
  resolveClientStrategy,
  strategyToLegacyDirective,
  legacyDirectiveToStrategy,
  applyStrategy,
  cleanupStrategy,
  CLIENT_DIRECTIVE_ATTR,
  CLIENT_MEDIA_ATTR,
  CLIENT_ONLY_ATTR
} from './directive';
export type {
  ClientStrategy,
  ClientDirectiveModifiers,
  ClientDirectiveValue,
  ClientDirectiveBinding,
  VClientDirective
} from './directive';

// Bootstrap scripts (injected by SSR renderer / build)
export { getIslandsBootstrapScript, getIslandsClearScript } from './bootstrap';

// Vite plugin & SFC transform
export {
  ubeanIslandsPlugin,
  transformVueSfcIslands,
  collectIslandComponents,
  generateRegistryModule,
  parseScriptImports,
  scanIslandDirectiveNames,
  resolveIslandImportPath,
  ISLANDS_REGISTRY_VIRTUAL_ID
} from './vite';
export type { UbeanIslandsPluginOptions, IslandComponentEntry, IslandComponentMap } from './vite';
