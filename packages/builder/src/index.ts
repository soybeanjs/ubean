/**
 * @ubean/build — production build orchestration + framework-agnostic core
 * Vite plugin.
 *
 * The build-infrastructure foundation (virtual module registry, module
 * extension registry, macro transforms) now lives in `@ubean/build-core`
 * and is re-exported here for API compatibility.
 */
export {
  VirtualModuleRegistry,
  useVirtualRegistry,
  resetVirtualRegistry,
  defineVirtualModule,
  defineVirtualModulePrefix
} from '@ubean/build-core';

export type { VirtualModuleContext, VirtualModuleTransform, VirtualModule } from '@ubean/build-core';

export { transformMacros, stripMacros } from '@ubean/build-core';

export {
  registerComponentResolver,
  getComponentResolvers,
  registerCssImport,
  getCssImports,
  resetModuleRegistry
} from '@ubean/build-core';

export {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
