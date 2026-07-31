---
title: Islands Auto-Registry
---

# Islands Auto-Registry

> This document outlines an improvement to `@ubean/islands`: a Vite plugin that automatically scans `client:xxx` directive usage during build/dev, resolves the corresponding component import paths, and generates a virtual module serving as the island component registry — eliminating the burden of manually maintaining a `components` map in `app.ts`.
>
> Status legend: ⬜ Not started | 🔄 In progress | ✅ Completed | ⏸️ Deferred
>
> Current overall status: **Completed (all tasks ✅, including auto-hydration)**. Document version: v1.1 (2026-07-29).

---

## 1. Background and Problem Statement

### 1.1 Current Islands Usage (Before v1.0)

ubean's Islands architecture follows a **component-level** directive-based design: in any `.vue` page, you mark a component as an island using a `client:xxx` directive. During SSR, the framework transforms it into a `<ubean-island>` custom element, and the client hydrates it at the appropriate time based on the directive strategy.

```vue
<!-- pages/islands-test.vue -->
<template>
  <IslandCounter client:load />
  <IslandMedia client:media="(min-width: 768px)" />
</template>
```

```ts
// app.ts — (before v1.0) had to manually maintain the components registry and call hydrateIslands
import IslandCounter from './components/IslandCounter.vue';
import IslandMedia from './components/IslandMedia.vue';

const islandComponents = {
  IslandCounter,
  IslandMedia
};

export default defineApp({
  onClientReady: app => {
    hydrateIslands({
      components: islandComponents,
      appContext: app
    });
  }
});
```

> **v1.0+ update**: The component registry is now auto-generated (Plan C), and the framework automatically calls `hydrateIslands()`. No islands-related code is needed in `app.ts` anymore.

### 1.2 Core Pain Points in the Current State

| Pain point | Description | Impact |
| --- | --- | --- |
| **Manual registry maintenance** | Every time you add an island component, beyond importing it in the page, you must also modify the `components` map in `app.ts` | Easy to forget, leading to islands silently not hydrating |
| **Name string coupling** | SSR outputs `data-component="IslandCounter"`, and the client-side map key must exactly match the component name | When renaming a component, the SSR tag name changes but the `app.ts` key isn't synced → component not found at runtime |
| **Redundant declarations** | A component is imported once in the page's `<script setup>`, then imported and registered again in `app.ts` | Redundant, violates DRY |
| **No tree-shaking** | All island components are bundled into the client bundle, even if an island is only used on a single page | Bundle size bloat |
| **Hard to diagnose errors** | When component names don't match, the framework's `resolveComponent` returns `null`, and the island silently fails to hydrate with no warning | Difficult debugging |

### 1.3 Review of the Current Implementation Mechanism

Key files and responsibilities of the current Islands implementation:

| File | Responsibility |
| --- | --- |
| [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) | Vite plugin: scans `<Comp client:xxx />` during SSR, transforms to `<ubean-island data-component="Comp" ...>` |
| [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) | Client runtime: `collectIslands` scans the DOM, `hydrateIslands` hydrates per directive strategy, `resolveComponent` looks up by name |
| [packages/islands/src/bootstrap.ts](../packages/islands/src/bootstrap.ts) | Bootstrap script injected into HTML: sets `data-hydrating` attributes based on directives after DOM ready to trigger hydration |
| [examples/ubean-test/src/app.ts](../examples/ubean-test/src/app.ts) | Manual registration entry in the example project |

**Key constraint**: The SSR-side `transformTemplate` ([vite.ts#L160](../packages/islands/src/vite.ts#L160)) only preserves the component's **name string** (`data-component="IslandCounter"`) when transforming templates — it does not preserve the component's file path or module reference. This is the root cause of the current need for manual registry maintenance.

---

## 2. Reference Project Comparison: void's Import Attributes Approach

### 2.1 void's Design

void ([github: earendil-works/void](https://github.com/earendil-works/void)) adopts a **page-level** + **import attributes** Islands design:

```vue
<!-- pages/blog/index.island.vue -->
<script setup>
import Counter from './_Counter.vue' with { island: 'load' };
import PostForm from './_PostForm.vue' with { island: 'visible' };
</script>

<template>
  <Counter />
  <PostForm />
</template>
```

**Core characteristics**:

1. **Page-level Islands**: The `.island.vue` suffix makes the entire page an island page — this page **has no router, no Inertia protocol**, and navigation between pages is a full page load
2. **Import attributes as the registry**: `with { island: 'load' }` serves two purposes:
   - Marks the import as an island (rendered as static HTML + `<island>` marker during SSR)
   - Lets the bundler automatically include the module in the client bundle (the import statement itself is the registration)
3. **Zero manual registration**: The bundler auto-generates the client-side component mapping based on import attributes — users don't need to maintain any map

### 2.2 Architectural Differences Between void and ubean

| Dimension | void | ubean |
| --- | --- | --- |
| **Islands granularity** | Page-level (`.island.vue` — whole page, no router) | Component-level (page is an SPA with router, specific components escape as islands) |
| **Marker location** | Import statement (`with { island: 'load' }`) | Template tag (`<Comp client:load />`) |
| **Registration mechanism** | Automatic via bundler (import graph is the registry) | Manual `components` map |
| **Page router** | Island page has no router, full page load navigation | Page always has router/pinia/i18n, island is an independent Vue instance |
| **Multi-purpose components** | A component is either an island or not (determined by import) | The same component can be an island in place A and a normal component in place B (determined by usage directive) |
| **Navigation experience** | Full page load between island pages, no SPA transitions | Full SPA experience, islands only affect specific components' hydration timing |

### 2.3 Why Not Directly Adopt void's Approach

| Reason | Description |
| --- | --- |
| **Different architectural premises** | void's import attributes design depends on the "page-level no router" premise; ubean is component-level islands where pages are always SPAs — directly adopting void's approach would break the SPA experience |
| **Directive syntax is established** | ubean's `client:xxx` directive syntax is already in place — example projects, docs, and AGENTS.md all use it as the standard; switching to import attributes would be a breaking change |
| **Loss of flexibility** | Under void's approach, the same component can't use different directives in different places (one import can only have one `island` value); ubean's existing design allows `<Comp client:load />` and `<Comp client:idle />` to coexist |
| **Import attributes compatibility** | Requires `"module": "ESNext"` tsconfig, which is a migration barrier for some users |
| **AGENTS.md lesson #15** | "Don't copy reference project code — learn the architectural pattern and reimplement"; we should borrow the "auto-registration" concept, not copy the syntax |

---

## 3. Plan C: Directive Scanning + Auto-Generated Registry

### 3.1 Core Idea

**Keep the existing `client:xxx` directive syntax unchanged. At the Vite plugin layer, automatically collect island components and generate a virtual module as the registry, making the `components` parameter of `hydrateIslands()` go from "required" to "optional". The framework also automatically calls `hydrateIslands()` at the client entry (double rAF timing) and auto-hydrates after SPA navigation — users no longer need to call it manually in `onClientReady`.**

Workflow:

```
Dev/Build phase:
  1. ubeanIslandsPlugin.transform() scans .vue file templates
  2. Finds <IslandCounter client:load /> → records component name "IslandCounter"
  3. Parses the <script setup> import statements in the same file → gets IslandCounter's file path
  4. Replaces the component tag with <ubean-island v-once> custom element (v-once prevents Vue re-render overwriting)
  5. Aggregates all files' "component name → file path" mappings into the plugin's module graph
  6. New virtual module "virtual:ubean-islands-registry"
     - Imports all collected island components
     - Exports a { name: component } registry

Runtime (client-side):
  7. Client entry (virtual:ubean-app) automatically calls hydrateIslands() after app.mount() via double rAF
  8. hydrateIslands() gets the registry from the virtual module by default
  9. After SPA navigation, auto-hydrates new page islands via router.afterEach
 10. Users can still pass components explicitly in onClientReady as an escape hatch for manual registration
```

### 3.2 User-Side Experience Comparison

#### Current (Manual Registration)

```ts
// app.ts
import IslandCounter from './components/IslandCounter.vue';
import IslandClock from './components/IslandClock.vue';
import IslandMedia from './components/IslandMedia.vue';
import IslandOnly from './components/IslandOnly.vue';
import IslandVisibility from './components/IslandVisibility.vue';

const islandComponents = {
  IslandCounter, IslandClock, IslandVisibility, IslandMedia, IslandOnly
};

export default defineApp({
  onClientReady: app => {
    hydrateIslands({
      components: islandComponents,
      appContext: app
    });
  }
});
```

#### After Plan C (Zero-Config + Auto-Hydration)

```ts
// app.ts — no islands-related code needed
export default defineApp({
  // islands auto-registered + auto-hydrated, no onClientReady needed
});
```

> **Auto-hydration mechanism**: The client entry (`virtual:ubean-app`) automatically calls `hydrateIslands()` after `app.mount()` via double `requestAnimationFrame`, and auto-hydrates new page islands after SPA navigation via `router.afterEach`. You only need to call `hydrateIslands({ components })` in `onClientReady` when manual registration is needed (global components, dynamic imports, etc. — escape hatch scenarios).

Page-side usage remains completely unchanged:

```vue
<!-- pages/islands-test.vue — zero changes -->
<template>
  <IslandCounter client:load />
  <IslandMedia client:media="(min-width: 768px)" />
</template>
```

### 3.3 Detailed Design

#### 3.3.1 Vite Plugin Extension

Extend the `transform` hook in `ubeanIslandsPlugin` within [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) to add island component collection logic.

**New data structures**:

```ts
interface IslandComponentEntry {
  /** Component name, i.e. "IslandCounter" from <IslandCounter client:load /> */
  name: string;
  /** Absolute path to the component file, resolved from <script setup> import statements */
  importPath: string;
  /** Source file path where this island was discovered, for debugging */
  sourceFile: string;
}

/** Plugin's internal island component collection table: component name → entry */
type IslandComponentMap = Map<string, IslandComponentEntry>;
```

**Extended transform hook pseudocode**:

```ts
export function ubeanIslandsPlugin(_options: UbeanIslandsPluginOptions = {}): Plugin {
  let viteConfig: ViteResolvedConfig;
  let enabled = true;
  // New: island component collection table
  const islandComponents: IslandComponentMap = new Map();
  // New: virtual module request ID
  const VIRTUAL_REGISTRY_ID = 'virtual:ubean-islands-registry';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_REGISTRY_ID;

  return {
    name: 'ubean:islands',
    enforce: 'pre',

    configResolved(config) {
      viteConfig = config;
      enabled = _options.enabled !== false;
    },

    resolveId(id) {
      if (id === VIRTUAL_REGISTRY_ID) return RESOLVED_VIRTUAL_ID;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      // Generate virtual module content: import all island components and export the registry
      return generateRegistryModule(islandComponents);
    },

    transform(code, id) {
      if (!enabled) return null;
      if (!isVueSfc(id)) return null;
      if (!DIRECTIVE_RE.test(code)) return null;

      // 1. Existing template transform logic (unchanged)
      const filePath = /* ... */;
      const result = transformVueSfcIslands(code, filePath);

      // 2. New: collect island component names + resolve import paths
      const collected = collectIslandComponents(code, filePath);
      for (const entry of collected) {
        islandComponents.set(entry.name, entry);
      }

      // 3. If new components were added, invalidate the virtual module
      if (collected.length > 0 && viteConfig.command === 'serve') {
        // In dev mode, reload the virtual module
        const server = viteConfig.server;
        if (server) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      }

      return result;
    }
  };
}
```

#### 3.3.2 Component Name → Import Path Resolution

Add a `collectIslandComponents` function responsible for extracting island component names and their import paths from `.vue` files.

```ts
import { parse } from '@vue/compiler-sfc';

/**
 * Collect island component info from Vue SFC source code.
 *
 * Steps:
 * 1. Parse the SFC with @vue/compiler-sfc, extract <script setup> content
 * 2. Parse import statements with regex or oxc-parser, build { local name → import path } mapping
 * 3. Scan the template for <Comp client:xxx /> directives, get the set of component names
 * 4. Intersection: components that are both in the import mapping and in the island directive set
 * 5. Resolve relative import paths to absolute paths
 */
function collectIslandComponents(code: string, sourceFile: string): IslandComponentEntry[] {
  const { descriptor } = parse(code, { filename: sourceFile });
  if (!descriptor.template) return [];

  // Step 1: parse <script setup> import statements
  const importMap = parseScriptImports(descriptor.scriptSetup?.content ?? '');
  // importMap: Map<string, string>  e.g. { "IslandCounter" => "../components/IslandCounter.vue" }

  // Step 2: scan template for island directives, get set of component names
  const islandNames = scanIslandDirectiveNames(descriptor.template.content);
  // islandNames: Set<string>  e.g. { "IslandCounter", "IslandMedia" }

  // Step 3: intersection + resolve to absolute paths
  const entries: IslandComponentEntry[] = [];
  for (const name of islandNames) {
    const importPath = importMap.get(name);
    if (!importPath) {
      // Component may be globally registered or from node_modules — log warning, leave for manual registration
      console.warn(
        `[ubean:islands] Component "${name}" used with client:xxx directive ` +
        `in ${sourceFile} has no corresponding import in <script setup>. ` +
        `It will not be auto-registered. Add it manually via hydrateIslands({ components: {...} }).`
      );
      continue;
    }
    const absolutePath = resolveImportPath(importPath, sourceFile);
    entries.push({ name, importPath: absolutePath, sourceFile });
  }
  return entries;
}
```

**Two implementation choices for import statement parsing**:

| Implementation | Pros | Cons |
| --- | --- | --- |
| **Regex matching** | Zero dependencies, simple | Can't handle complex imports (multi-line, dynamic imports, re-exports) |
| **oxc-parser** | Robust, consistent with ubean's other packages (`@ubean/build` already uses it) | Increases bundle size (but ubean already depends on it) |

**Recommendation**: Use oxc-parser or `@vue/compiler-sfc`'s `compileScript`, consistent with ubean's existing toolchain.

#### 3.3.3 Virtual Module Generation

Add a `generateRegistryModule` function that generates virtual module code based on the collected component map.

```ts
/**
 * Generate the virtual:ubean-islands-registry module content.
 *
 * Example output:
 *   import __island_0 from '/src/components/IslandCounter.vue';
 *   import __island_1 from '/src/components/IslandMedia.vue';
 *   export const islands = {
 *     IslandCounter: __island_0,
 *     IslandMedia: __island_1
 *   };
 */
function generateRegistryModule(components: IslandComponentMap): string {
  if (components.size === 0) {
    return 'export const islands = {};';
  }

  const imports: string[] = [];
  const entries: string[] = [];

  let idx = 0;
  for (const [name, entry] of components) {
    const varName = `__island_${idx++}`;
    imports.push(`import ${varName} from ${JSON.stringify(entry.importPath)};`);
    entries.push(`  ${JSON.stringify(name)}: ${varName}`);
  }

  return [
    ...imports,
    '',
    'export const islands = {',
    ...entries,
    '};'
  ].join('\n');
}
```

#### 3.3.4 Runtime Layer Changes

Modify the `hydrateIslands` function in [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) to make the `components` parameter optional and default to importing from the virtual module.

**Problem**: runtime.ts is currently "dependency-free" pure browser code (it hand-writes DOM/MutationObserver interface types to avoid importing Vue types). Directly `import { islands } from 'virtual:ubean-islands-registry'` would make the runtime hard-depend on the Vite environment.

**Solution**: Layered approach:

1. **Keep runtime.ts pure**: The `components` parameter of `hydrateIslands` remains optional, but does **not** directly import the virtual module
2. **Add a bridge module**: Provide a wrapped version of `hydrateIslands` in `@ubean/runtime/vue` (client entry) that auto-imports the registry from the virtual module

```ts
// packages/runtime/src/vue/islands.ts (new bridge module)
import { hydrateIslands as _hydrateIslands } from '@ubean/islands/runtime';
import { islands as autoIslands } from 'virtual:ubean-islands-registry';

export function hydrateIslands(options: Omit<HydrateIslandsOptions, 'components'> & {
  components?: Record<string, Component>;
} = {}) {
  const { components: manual = {}, ...rest } = options;
  // Manual registration takes precedence, auto-registration as fallback
  const components = { ...autoIslands, ...manual };
  return _hydrateIslands({ components, ...rest });
}
```

3. **User-side import path adjustment**:

```ts
// app.ts
// Before: import hydrateIslands from ubean/runtime/vue
import { hydrateIslands } from 'ubean/runtime/vue';

// After: unchanged (ubean/runtime/vue internally re-exports the bridge module)
import { hydrateIslands } from 'ubean/runtime/vue';
// But now the components parameter is optional
```

#### 3.3.5 Hot Reload in Dev Mode

In dev mode, users may add new island component usage, requiring the virtual module to update in real time.

```ts
// In the transform hook, when new island components are discovered
if (viteConfig.command === 'serve' && collected.length > 0) {
  const server = viteConfig.server;
  if (server) {
    // Invalidate the virtual module, trigger reload
    const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
    if (mod) {
      server.moduleGraph.invalidateModule(mod);
      // Notify modules that depend on this virtual module to reload
      server.ws.send({ type: 'full-reload' });
    }
  }
}
```

**Optimization**: HMR boundaries could be used for precise updates instead of full-reload, but the first version can use full-reload to ensure correctness.

#### 3.3.6 No Impact on SSR Side

The SSR side **requires no changes**: `transformVueSfcIslands` still outputs only `<ubean-island data-component="...">`, and the component name remains a string. The change is only in how the client-side registry is generated.

#### 3.3.7 Compatibility with Existing `components` Parameter

```ts
// runtime.ts resolveComponent logic unchanged
function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return components[name];   // Check registry first
  if (getComponent) return getComponent(name);
  return null;
}
```

The bridge module merges auto-registered and manually-registered components:

```ts
const components = { ...autoIslands, ...manual };
// Manual registration overrides auto-registration, allowing special handling for specific components
```

### 3.4 Edge Case Handling

| Scenario | Handling |
| --- | --- |
| **Component name differs from import local name** (`import Foo from './Bar.vue'` then `<Foo client:load />`) | Use the tag name used in the template (`Foo`), look it up in the import map by local name `Foo` |
| **Dynamic components** (`<component :is="dynamicName" client:load />`) | Cannot be statically analyzed → log warning, leave for manual registration |
| **Globally registered components** (`app.component('IslandCounter', ...)`) | Not found in import map → log warning, user must pass `components` manually |
| **Components from `node_modules`** (`import Foo from 'some-lib'`) | Works normally — import path is a bare specifier, Vite can resolve it |
| **`defineAsyncComponent` wrapper** (`const Foo = defineAsyncComponent(() => import('./Foo.vue'))`) | Not auto-detected in first version → log warning, user registers manually; parsing can be enhanced later |
| **Same component used as island in multiple files** | Map deduplicates, uses the import path from first discovery; if different files have different import paths, log a warning |
| **Same component used as island multiple times in the same file** (`<Foo client:load />` + `<Foo client:idle />`) | Works normally — same component name, registered only once, directives are serialized separately by SSR |
| **Adding new island usage in dev mode** | transform hook re-scans → updates map → invalidates virtual module → HMR |
| **Build mode (production build)** | All .vue files are transformed once during build, registry generated in one pass |

### 3.5 Enhanced Error Diagnostics

Currently `resolveComponent` fails silently when returning `null`. Plan C also enhances diagnostics:

```ts
// In runtime.ts hydrateIsland
function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return components[name];
  if (getComponent) return getComponent(name);

  // New: diagnostic warning
  console.warn(
    `[ubean:islands] Island component "${name}" not found in registry.\n` +
    `Possible causes:\n` +
    `  1. Component is globally registered or dynamically imported — pass it via hydrateIslands({ components: { ${name}: YourComp } })\n` +
    `  2. Component name mismatch between template tag and import\n` +
    `Registered components: ${Object.keys(components).join(', ') || '(none)'}`
  );
  return null;
}
```

---

## 4. Implementation Plan

### 4.1 Task Breakdown

| ID | Task | Description | Status |
| --- | --- | --- | --- |
| IS-01 | Extend `@ubean/islands` Vite plugin | Add `collectIslandComponents`, `generateRegistryModule`, virtual module `load`/`resolveId` hooks | ✅ |
| IS-02 | Select and integrate import statement parser | Evaluate `@vue/compiler-sfc` `compileScript` vs oxc-parser, align with `@ubean/build` existing deps | ✅ |
| IS-03 | Add `@ubean/runtime/vue` bridge module | `hydrateIslands` wrapper, auto-merge auto registry + manual registry | ✅ |
| IS-04 | Dev mode HMR support | Virtual module invalidation + hot reload notification | ✅ |
| IS-05 | Enhanced error diagnostics | Output warning + registered component list when `resolveComponent` fails | ✅ |
| IS-06 | Update `examples/ubean-test` | Remove manual `components` map from `app.ts`, verify zero-registration works | ✅ |
| IS-07 | Unit tests | `collectIslandComponents`, `generateRegistryModule`, bridge module merge logic | ✅ |
| IS-08 | Integration tests | Dev mode new island → HMR works; production build → registry correctly generated | ✅ |
| IS-09 | Documentation updates | Update [skills/ubean/docs/guide/islands.md](../skills/ubean/docs/guide/islands.md) (if exists), AGENTS.md relevant sections, this document's status | ✅ |
| IS-10 | Type declarations | TypeScript type declarations for `virtual:ubean-islands-registry` (`src/vite-env.d.ts` or `@ubean/islands/types`) | ✅ |

### 4.2 Dependencies

```
IS-02 ──► IS-01 ──► IS-03 ──► IS-06
              │           │
              ▼           ▼
             IS-04       IS-07
              │           │
              ▼           ▼
             IS-08 ◄──── IS-05
              │
              ▼
             IS-09, IS-10
```

### 4.3 Compatibility and Migration

**Backward compatibility**: ✅ Fully compatible

- The `components` parameter goes from "required" to "optional" — old code needs no changes
- Manually registered components merge with auto-registered ones (manual takes precedence)
- Existing `<Comp client:xxx />` syntax requires zero changes
- Existing SSR transform logic requires zero changes

**Migration path**:

1. Upgrade `@ubean/islands` to a version containing Plan C
2. (Optional) Remove the `components` map and related imports from `app.ts`
3. Verify islands still hydrate correctly

**Progressive adoption**: Users can choose to:
- Fully rely on auto-registration (remove manual map)
- Fully rely on manual registration (don't use auto-registration, behavior identical to current)
- Hybrid mode (mostly auto-registration, with manual supplements for edge cases)

---

## 5. Trade-offs and Alternative Approaches

### 5.1 Advantages of Plan C

| Advantage | Description |
| --- | --- |
| **Zero manual registration** | Eliminates duplicate imports + registration in `app.ts`, prevents omissions |
| **Zero breaking changes** | Preserves `client:xxx` directive syntax, `components` parameter becomes optional |
| **Automatic tree-shaking** | Only components actually used with `client:xxx` enter the registry — unused island components aren't bundled |
| **Preserves flexibility** | Same component can be an island in place A and a normal component in place B; different directives can be used in different places |
| **Fits ubean's architecture** | Leverages the existing virtual module pattern (`virtual:ubean-pages`, `virtual:ubean-routes`, etc.) |
| **Diagnostic-friendly** | Auto-registration + enhanced warnings greatly reduce the cost of debugging "island silently not hydrating" |
| **Escape hatch preserved** | `components` parameter can still be passed manually for `node_modules`, global registration, dynamic imports, and other edge cases |

### 5.2 Costs of Plan C

| Cost | Description | Mitigation |
| --- | --- | --- |
| **Implementation complexity** | Needs to parse `<script setup>` import statements, handle various import forms | Reuse `@vue/compiler-sfc` or oxc-parser — ubean already depends on them |
| **Static analysis limitations** | Can't handle dynamic components, global registration, `defineAsyncComponent` | Log warnings + escape hatch manual registration |
| **Dev HMR complexity** | New island usage needs to trigger virtual module rebuild | First version uses full-reload, optimize to precise HMR later |
| **Bundle size** | `@ubean/islands` gains SFC parsing dependencies | `@vue/compiler-sfc` is already an indirect dependency of ubean; or share `@ubean/build`'s oxc-parser dependency |

### 5.3 Alternative Approach Comparison

| Approach | Idea | Pros | Cons | Conclusion |
| --- | --- | --- | --- | --- |
| **A. Copy void (import attributes)** | `import Foo from './Foo.vue' with { island: 'load' }` | Zero registration, bundler auto-collects | Breaks existing directive syntax, loses component-level flexibility, import attributes compatibility barrier | ❌ Not adopted |
| **B. Convention-based glob registration** | Auto-register components in `components/islands/` directory or with `.island.vue` suffix | Simple implementation, zero registration | Requires directory/suffix convention, glob imports all matching files (depends on tree-shaking), can't handle `node_modules` components | ⚠️ Can be a supplement, not first choice |
| **C. Directive scanning + auto registry (this plan)** | Scan `client:xxx` usage + resolve import paths, generate virtual module | Zero registration, zero breakage, auto tree-shake, preserves flexibility | Implementation complexity, static analysis limitations | ✅ Adopted |
| **D. Component path injected into data-* attribute** | SSR additionally stores `data-import-path` on `<ubean-island>`, client dynamically `import()`s | Zero registration, no virtual module needed | HTML exposes file paths (security issue), bundler can't statically analyze dynamic import paths → can't chunk | ❌ Not adopted |

### 5.4 Plan B as a Supplement

Plan C can coexist with Plan B: Plan C handles "island components with explicit imports", while Plan B handles "candidate island components under convention directories". However, only Plan C is implemented in the first version to avoid over-engineering.

---

## 6. Open Questions (All Resolved)

| # | Question | Final Decision | Notes |
| --- | --- | --- | --- |
| Q1 | Use `@vue/compiler-sfc`'s `compileScript` or oxc-parser for import statement parsing? | **Regex matching** | Ultimately chose a zero-dependency regex implementation supporting default imports, `default as` aliases, and mixed imports — no extra package needed, `@ubean/islands` bundle size unchanged |
| Q2 | Virtual module naming: `virtual:ubean-islands-registry` or `ubean:islands`? | **`virtual:ubean-islands-registry`** | Follows AGENTS.md §8 lesson #7: use `virtual:ubean-` prefix |
| Q3 | Should the bridge module go in `@ubean/runtime/vue` or `@ubean/islands/runtime`? | **`ubean/runtime/vue`** | Client entry, avoids introducing Vite dependency into runtime.ts; `ubean` main package's `runtime/vue` subpath overrides `@ubean/runtime`'s `hydrateIslands` |
| Q4 | How to handle the same component having different import paths in different files? | **Warning + first-discovery priority** | `updateRegistry` logs a warning when it detects inconsistent import paths, uses the first-discovered path |
| Q5 | Should island directives in `.tsx`/`.jsx` be supported? | **First version only supports `.vue`** | ubean is a Vue-specific framework, `.vue` SFC is the only page format |
| Q6 | How to ensure registry completeness in production builds? | **Full scan during build-time transform** | All `.vue` files are transformed once during build, registry is generated in one pass in the `load` hook |

---

## 7. Acceptance Criteria (All Passed)

| # | Criterion | Verification Method | Result |
| --- | --- | --- | --- |
| AC-1 | After removing the `components` map from `app.ts` in `examples/ubean-test`, islands still hydrate correctly | Manual testing + integration tests | ✅ |
| AC-2 | When adding new island component usage, dev mode auto-detects it without modifying `app.ts` | Manual testing | ✅ |
| AC-3 | Production build client bundle only includes actually-used island components | Bundle analysis | ✅ |
| AC-4 | When passing `components` parameter manually, it correctly merges with auto-registration (manual takes precedence) | Unit tests | ✅ |
| AC-5 | When component name doesn't match, console outputs a clear diagnostic warning | Manual testing | ✅ |
| AC-6 | All existing tests pass, no regressions | `pnpm test` | ✅ 33 tests passing |
| AC-7 | Type checking passes | `pnpm typecheck` | ✅ |

---

## 8. References

- [packages/islands/src/vite.ts](../packages/islands/src/vite.ts) — Current Vite plugin implementation
- [packages/islands/src/runtime.ts](../packages/islands/src/runtime.ts) — Current client runtime
- [packages/islands/src/bootstrap.ts](../packages/islands/src/bootstrap.ts) — Bootstrap script
- [examples/ubean-test/src/app.ts](../examples/ubean-test/src/app.ts) — Current manual registration example
- [examples/ubean-test/src/pages/islands-test.vue](../examples/ubean-test/src/pages/islands-test.vue) — Islands test page
- [skills/void/docs/guide/pages-routing/islands.md](file:///Users/soybean/Web/Projects/OpenSource/void/skills/void/docs/guide/pages-routing/islands.md) — void Islands documentation (reference)
- [AGENTS.md](../AGENTS.md) §8 lessons #7, #15 — Virtual module prefix and reference project handling conventions

---

## Next Steps

- [Overview](/architecture/overview) — ubean's overall architecture and design principles
- [Islands Guide](/guide/islands) — Practical usage of the Islands architecture
- [Runtime](/architecture/runtime) — Client and server runtime internals
- [Routing](/architecture/routing) — File-based routing system
