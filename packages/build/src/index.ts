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
  createRoutingVirtualModule,
  createPagesVirtualModule,
  createMetaVirtualModule,
  createAppVirtualModule,
  createLocalesVirtualModule
} from './virtual-modules';
