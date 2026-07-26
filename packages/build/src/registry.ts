/**
 * Module extension registry.
 *
 * Allows built-in extension modules (@ubean/ui, @ubean/icon, etc.) to inject
 * component resolvers and CSS imports into the core Vite plugin pipeline
 * without modifying ubeanVuePlugin directly.
 *
 * Registration happens at module load time (when ubeanUiPlugin() etc. are
 * called by the module system, before ubeanVuePlugin reads the registry).
 */

/**
 * Generic component resolver type compatible with unplugin-vue-components.
 * Accepts both function resolvers and object resolvers (ComponentResolverObject).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentResolver = ((name: string) => any) | { type: 'component' | 'directive'; resolve: (name: string) => any };

const componentResolvers: ComponentResolver[] = [];
const cssImports: string[] = [];

/**
 * Register a component resolver (e.g. `UiResolver()` from `@soybeanjs/ui/resolver`).
 * The resolver will be merged into `unplugin-vue-components`'s `resolvers` array.
 */
export function registerComponentResolver(resolver: ComponentResolver): void {
  componentResolvers.push(resolver);
}

/**
 * Get all registered component resolvers.
 * Called by `ubeanVuePlugin` when constructing the `Components()` plugin.
 */
export function getComponentResolvers(): ComponentResolver[] {
  return [...componentResolvers];
}

/**
 * Register a CSS import path to be injected into the client entry.
 * e.g. `registerCssImport('@soybeanjs/ui/styles.css')` makes the client
 * entry module prepend `import '@soybeanjs/ui/styles.css'`.
 */
export function registerCssImport(cssPath: string): void {
  if (!cssImports.includes(cssPath)) {
    cssImports.push(cssPath);
  }
}

/**
 * Get all registered CSS import paths.
 * Called by `createClientEntryVirtualModule` to prepend CSS imports.
 */
export function getCssImports(): string[] {
  return [...cssImports];
}

/**
 * Reset the registry (for testing).
 * @internal
 */
export function resetModuleRegistry(): void {
  componentResolvers.length = 0;
  cssImports.length = 0;
}
