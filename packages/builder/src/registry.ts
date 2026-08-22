/**
 * Module extension registry.
 *
 * Allows built-in extension modules (@ubean/integrations, @ubean/icon, etc.) to inject
 * component resolvers and CSS imports into the core Vite plugin pipeline
 * without modifying ubeanVite directly.
 *
 * Registration happens at module load time (when ubeanUiPlugin() etc. are
 * called by the module system, before ubeanVite reads the registry).
 *
 * Uses globalThis for storage to ensure state is shared across multiple
 * copies of @ubean/build that may exist due to package manager duplication
 * (e.g. pnpm creating separate instances for different version ranges).
 */

/**
 * Generic component resolver type compatible with unplugin-vue-components.
 * Accepts both function resolvers and object resolvers (ComponentResolverObject).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentResolver = ((name: string) => any) | { type: 'component' | 'directive'; resolve: (name: string) => any };

const REGISTRY_KEY = '__ubean_module_registry__';

interface GlobalRegistry {
  componentResolvers: ComponentResolver[];
  cssImports: string[];
}

function getRegistry(): GlobalRegistry {
  const g = globalThis as typeof globalThis & { [REGISTRY_KEY]?: GlobalRegistry };
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      componentResolvers: [],
      cssImports: []
    };
  }
  return g[REGISTRY_KEY];
}

/**
 * Register a component resolver (e.g. `UiResolver()` from `@soybeanjs/ui/resolver`).
 * The resolver will be merged into `unplugin-vue-components`'s `resolvers` array.
 */
export function registerComponentResolver(resolver: ComponentResolver): void {
  getRegistry().componentResolvers.push(resolver);
}

/**
 * Get all registered component resolvers.
 * Called by `ubeanVite` when constructing the `Components()` plugin.
 */
export function getComponentResolvers(): ComponentResolver[] {
  return [...getRegistry().componentResolvers];
}

/**
 * Register a CSS import path to be injected into the client entry.
 * e.g. `registerCssImport('@soybeanjs/ui/styles.css')` makes the client
 * entry module prepend `import '@soybeanjs/ui/styles.css'`.
 */
export function registerCssImport(cssPath: string): void {
  const reg = getRegistry();
  if (!reg.cssImports.includes(cssPath)) {
    reg.cssImports.push(cssPath);
  }
}

/**
 * Get all registered CSS import paths.
 * Called by `createClientEntryVirtualModule` to prepend CSS imports.
 */
export function getCssImports(): string[] {
  return [...getRegistry().cssImports];
}

/**
 * Reset the registry (for testing).
 * @internal
 */
export function resetModuleRegistry(): void {
  const reg = getRegistry();
  reg.componentResolvers.length = 0;
  reg.cssImports.length = 0;
}
