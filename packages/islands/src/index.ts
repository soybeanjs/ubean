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

// Server Islands runtime (P9-04: replaces `server:defer` directive; Task 9.4: props rerender)
export { defineServerIsland, registerServerComponent, getServerComponent, SERVER_COMPONENT_ENDPOINT } from './runtime';
export type { ServerIslandOptions } from './runtime';

// Client Islands runtime (Phase 4: programmatic alternative to v-client.*)
export { defineIsland } from './runtime';
export type { IslandStrategy, IslandOptions } from './runtime';

// Server Components runtime (Task 9.1 / 9.2 / 9.3: .server.vue / .client.vue / paired)
export {
  ServerComponentStub,
  ClientComponentPlaceholder,
  defineClientComponent,
  definePairedComponent
} from './runtime';

// Vite plugin & SFC transform
export {
  ubeanIslandsPlugin,
  transformVueSfcIslands,
  collectIslandComponents,
  generateRegistryModule,
  parseScriptImports,
  scanIslandDirectiveNames,
  resolveIslandImportPath,
  wrapServerComponentTemplate,
  isServerComponentFile,
  isClientComponentFile,
  injectServerComponentPath,
  ISLANDS_REGISTRY_VIRTUAL_ID,
  SERVER_COMPONENT_STUB_VIRTUAL_ID,
  CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID
} from './vite';
export type { UbeanIslandsPluginOptions, IslandComponentEntry, IslandComponentMap } from './vite';
