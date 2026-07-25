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

// Bootstrap scripts (injected by SSR renderer / build)
export { getIslandsBootstrapScript, getIslandsClearScript } from './bootstrap';

// Vite plugin & SFC transform
export { ubeanIslandsPlugin, transformVueSfcIslands } from './vite';
export type { UbeanIslandsPluginOptions } from './vite';
