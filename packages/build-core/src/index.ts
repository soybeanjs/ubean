/**
 * @ubean/build-core — build-infrastructure foundation.
 *
 * Zero-dependency leaf package holding the shared build-time registries and
 * code transforms. Exists to break the former `@ubean/vite ↔ @ubean/build`
 * value-import cycle: both packages depend on THIS package, while the only
 * remaining edge between them is the intentional one-way
 * `@ubean/build → @ubean/vite` (production build consumes Vue virtual
 * module factories).
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
