/**
 * @ubean/build — production build orchestration, Vue Vite plugin, prerender,
 * and the former build-core registries (virtual modules / macros / SSR singleton).
 */
export {
  VirtualModuleRegistry,
  useVirtualRegistry,
  resetVirtualRegistry,
  defineVirtualModule,
  defineVirtualModulePrefix
} from './virtual-registry';

export type { VirtualModuleContext, VirtualModuleTransform, VirtualModule } from './virtual-registry';

export { transformMacros, stripMacros } from './macros';

export {
  registerComponentResolver,
  getComponentResolvers,
  registerCssImport,
  getCssImports,
  resetModuleRegistry
} from './registry';

export {
  SSR_SINGLETON_PACKAGES,
  SSR_SINGLETON_DEDUPE,
  SSR_SINGLETON_OPTIMIZE_EXCLUDE,
  ssrSingletonDevPolicy,
  ssrSingletonProdSsr,
  ssrSingletonProdOptimizeExclude
} from './ssr-singleton';

export {
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
