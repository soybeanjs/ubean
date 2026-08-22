/**
 * `@ubean/build/vue` — Vue-specific Vite plugin (formerly `@ubean/vite`).
 */
export { ubeanVite, VUE_PLUGIN_INCLUDE } from './vue-plugin';
export type { UbeanViteOptions } from './vue-plugin';
export { ubeanVite as default } from './vue-plugin';

export {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from './vue-virtual-modules';
