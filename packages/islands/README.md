# @ubean/islands

**English | [中文](./README.zh-CN.md)**

Islands architecture for ubean — partial hydration for Vue components, plus the server-component protocol.

`@ubean/islands` owns everything about **partial hydration** in ubean: the `v-client.*` directive family, the build-time transform that turns directives into `<ubean-island>` elements, the auto-generated registry virtual module, the client hydration runtime, the `.server.vue` / `.client.vue` file conventions, and the `POST /__server-component` endpoint for re-rendering server islands.

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
</script>

<template>
  <Counter v-client.load :initial="0" />
</template>
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [The `v-client` Directive](#the-v-client-directive)
  - [`v-client.only` vs `<ClientOnly>`](#v-clientonly-vs-clientonly)
- [Directive API](#directive-api)
- [Programmatic Wrappers](#programmatic-wrappers)
- [Server / Client Components](#server--client-components)
  - [Constraints](#constraints)
- [Islands Registry](#islands-registry)
- [Server Component Endpoint](#server-component-endpoint)
- [Vite Plugin API](#vite-plugin-api)
- [SSR Helpers](#ssr-helpers)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/islands` is the **islands runtime and build-time transform**:

| Layer                       | Responsibility                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ubean/islands` (this pkg) | `v-client.*` directive, island/registry transform, hydration runtime, `.server.vue` / `.client.vue`, `POST /__server-component`                  |
| `@ubean/vue`                | Page routing and the lean kernel; `<ClientOnly>` and the page/cache/transition layer live there — this package only adds island hydration on top |
| `@ubean/client`             | Calls `hydrateIslands()` automatically after mount and after each SPA navigation — the framework's bridge to this runtime                        |
| `@ubean/build`              | Wires `ubeanIslandsPlugin()` into `ubeanPlugin()`; the app factory mounts `createServerComponentMiddleware()`                                    |

**Included:**

- The `v-client.load` / `.idle` / `.visible` / `.media` / `.only` directive family and its strategy resolvers
- `defineIsland` (client island) / `defineServerIsland` (server island) / `defineClientComponent` / `definePairedComponent`
- The client hydration runtime: `hydrateIslands`, `collectIslands`, `hydrateIsland`, `hasPendingIslands`, `scheduleIslandHydration`
- The bootstrap script (`getIslandsBootstrapScript`) and its clear script
- The server-component protocol: `SERVER_COMPONENT_ENDPOINT`, `registerServerComponent`, `getServerComponent`, `createServerComponentMiddleware`
- The Vite plugin (`/vite` subpath): directive scan, `<ubean-island>` transform, registry virtual module, `.server.vue` / `.client.vue` resolution and the restricted-parent check
- SSR helpers for rendering placeholders (`createIslandsContext`, `registerIsland`, `getIslandsScript`, `generateIslandPlaceholder`, `renderIslandPlaceholder`, `hydrationStrategyMeta`)

**NOT included:**

- Page routing, `<ClientOnly>`, page cache, page transitions, `definePage` — `@ubean/vue`
- App factories, `defineApp`, the automatic post-mount hydration call and the data layer — `@ubean/client`
- Full SSR rendering (streaming, head merging, deferred payloads) — `@ubean/client/ssr` and `@ubean/pages`
- Server routing and the Hono app — `@ubean/app`

**Runtime dependency whitelist (main entry): `vue`.** The main entry imports only `./directive` and `./runtime` — no `node:*`, no `vite`. `hono` and `pathe` are used by the server-component middleware and the Vite plugin, which live behind the `/server` and `/vite` subpaths. `vite` is an **optional peer** used only by the build-time subpath.

## Install

```bash
pnpm add ubean          # or: pnpm add @ubean/islands
# build-time (the /vite subpath):
pnpm add -D vite
```

## Quick Start

**1. Vite config** — the plugin scans `.vue` files, transforms `v-client.*` tags and generates the registry:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default {
  plugins: [vue(), ubeanIslandsPlugin()]
};
```

**2. Mark the interactive component** — put the directive on the **component element**, not a plain `<div>`:

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
import HeavyChart from '~/components/HeavyChart.vue';
</script>

<template>
  <Counter v-client.load />
  <HeavyChart v-client.idle />
</template>
```

**3. Nothing else.** Import the component in `<script setup>` and the framework hydrates it after mount — no code in `app.ts` is required.

A complete example lives in [`apps/docs/src/content/en/guide/islands.md`](../../apps/docs/src/content/en/guide/islands.md).

## The `v-client` Directive

The modifier selects the hydration strategy — one directive per strategy, all declared on the component tag:

| Directive          | Strategy    | Hydrates when                                      |
| ------------------ | ----------- | -------------------------------------------------- |
| `v-client.load`    | `'load'`    | Immediately on page load                           |
| `v-client.idle`    | `'idle'`    | Browser is idle (`requestIdleCallback`)            |
| `v-client.visible` | `'visible'` | Element scrolls into view (`IntersectionObserver`) |
| `v-client.media`   | `'media'`   | A CSS media query matches (value is the query)     |
| `v-client.only`    | `'only'`    | Client only — no SSR output for this component     |

```vue
<template>
  <Counter v-client.load />
  <HeavyChart v-client.idle />
  <Comments v-client.visible />
  <MobileNav v-client.media="'(max-width: 768px)'" />
  <ClientOnlyWidget v-client.only />
</template>
```

The value of `.media` is a Vue expression, so a string literal must be quoted. Props passed to an island must be JSON-serializable (strings, numbers, booleans, arrays, plain objects).

### `v-client.only` vs `<ClientOnly>`

`<ClientOnly>` (from `@ubean/vue` / `@ubean/client`) covers the non-island case and takes a `fallback` prop / `#fallback` slot:

| Use `v-client.only`                                           | Use `<ClientOnly>`                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Component-level islands (registry-driven hydration)           | Template fragments / plain HTML (the islands transform only matches capitalized component tags) |
| Needs a deferral strategy alongside (load/idle/visible/media) | Same-tree rendering with full app context                                                       |
| Content is replaced by a separate app on hydration            | Must not sit inside an island placeholder (it is wiped when the island hydrates)                |

## Directive API

```ts
import {
  vClient,
  resolveClientStrategy,
  strategyToLegacyDirective,
  legacyDirectiveToStrategy
} from '@ubean/islands/directive';

vClient; // the Vue directive object (ObjectDirective<HTMLElement, string, ClientStrategy>)
resolveClientStrategy({ load: true, media: true }); // → 'load' | 'idle' | 'visible' | 'media' | 'only'
```

- `ClientStrategy = 'load' | 'idle' | 'visible' | 'media' | 'only'`; `ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only'`.
- `applyStrategy(el, strategy, mediaQuery?)` / `cleanupStrategy(el)` are the imperative primitives the directive uses.
- The `data-*` protocol attributes are exported for tooling: `CLIENT_DIRECTIVE_ATTR` (`data-client-directive`), `CLIENT_MEDIA_ATTR` (`data-media`), `CLIENT_ONLY_ATTR` (`data-client-only`).
- The `/directive` subpath is browser-safe and has no build-time dependency — it is what `@ubean/client` imports.

## Programmatic Wrappers

```ts
import { defineIsland, defineServerIsland } from '@ubean/islands';
import AsyncChart from '~/components/AsyncChart.vue';
import Counter from '~/components/Counter.vue';

// Client island; strategy: 'load' | 'idle' | 'visible' | 'media' | 'only'
const CounterIsland = defineIsland(Counter, 'load');

// 'media' requires a mediaQuery; props can be pre-bound
const MobileNavIsland = defineIsland(MobileNav, 'media', {
  mediaQuery: '(max-width: 768px)',
  props: { theme: 'dark' }
});

// Server island — wraps the async component in <Suspense> with a fallback
const Chart = defineServerIsland(AsyncChart, { fallback: '<div class="skeleton">Loading…</div>' });
```

- `IslandOptions = { mediaQuery?: string, props?: Record<string, unknown> }`.
- `ServerIslandOptions = { fallback?: Component | string, rerenderOnPropsChange?: boolean }`. When omitted, a `<ubean-defer-fallback>` placeholder is used.
- With `rerenderOnPropsChange: true`, the client requests the server-rendered HTML once after mount and again whenever props change, replacing the container's content; the SSR side registers the component so the endpoint can find it. The Vite plugin injects the component's absolute path as the third argument — without it the option degrades to `false`.
- `defineClientComponent(component)` and `definePairedComponent(ServerComp, ClientComp)` are the runtime halves of the `.client.vue` and `.server.vue` + `.client.vue` conventions; both are normally generated by the plugin, not written by hand.

## Server / Client Components

Two file-name conventions for components that belong to exactly one build graph. The plugin handles resolution — no import change and no directive needed.

- **`Foo.client.vue`** — renders only on the client. SSR emits a `<!--client-only-->` comment placeholder and the real component replaces it after mount. For components that need browser APIs.
- **`Foo.server.vue`** — renders only on the server. The client build swaps the import for a stub, so neither the implementation nor its imports reach the client bundle. For server-only access (env vars, databases).
- **`Foo.server.vue` + `Foo.client.vue` together** — import the base name (`import Foo from './Foo.vue'`); that file must **not** exist. SSR renders the server half, the client half takes over after mount.

### Constraints

**A `.server.vue` must be a `<template>`-form SFC.** The server wraps the template in `<ubean-server-only v-once>` so hydration can match it; a render-function SFC (or `export { default } from …`) has nothing to wrap and the build fails with that reason.

**A `.server.vue` occupies a wrapper element, so its context matters.** The client keeps a stub in the tree and hydration preserves the server-rendered children by matching that element. The wrapper is an ordinary flow element, so a server component may only be used where a flow element is allowed:

```html
<!-- breaks: the wrapper is not valid inside <tr>, so the parser hoists it out of the table -->
<table>
  <tr>
    <ServerGreeting />
  </tr>
</table>

<!-- fine: the server component renders the container itself -->
<ServerTable />
```

**The plugin rejects this at transform time** (dev overlay / `vite build` error), naming the parent and the component. The failure is deliberate: the symptom it prevents is silent in production — content appears _outside_ the container before hydration, and afterwards Vue reports `Hydration node mismatch` / `Hydration children mismatch` and removes the content.

The check covers table ancestors (`table`, `thead`, `tbody`, `tfoot`, `tr`, `colgroup`) and `select` / `optgroup`. It deliberately does **not** cover `ul` / `ol` / `dl`: there the wrapper stays put, so both sides produce the same DOM and hydration is fine.

Workarounds: let the server component render the container (the whole `<table>` / `<ul>`), or place it inside an allowed child (`<td>`, `<li>`). `.client.vue` has no such constraint — a comment node is legal in every context.

## Islands Registry

`virtual:ubean-islands-registry` is generated by the plugin from the `<script setup>` imports of every file that uses a `v-client.*` directive:

```ts
declare module 'virtual:ubean-islands-registry' {
  export const islands: Record<string, Component | (() => Promise<Component>)>;
}
```

- The key is the **template tag name**; the value is a lazy loader, so island components never land in the entry chunk.
- The module exports `{}` when nothing was scanned.
- `ISLANDS_REGISTRY_VIRTUAL_ID` (from `/vite`) is the virtual module id; the `/virtual-registration` subpath is **types-only** (`"import": null`) — it exists so editors can resolve the module's type without pulling in the plugin.
- A component reached only through a global registration, `defineAsyncComponent` or a dynamic import cannot be auto-registered; pass it manually through `hydrateIslands({ components })` (manual entries win).
- Only components actually used with a `v-client.*` directive are included in the client bundle.

The pipeline, end to end: **scan** `.vue` files → **transform** island tags into `<ubean-island v-once>` (with serialized props in data attributes) → **resolve** import paths → **generate** the registry virtual module → **bridge** it through `hydrateIslands` in `@ubean/client` → **auto-hydrate** after mount (double `requestAnimationFrame`) and after each SPA navigation.

## Server Component Endpoint

`createServerComponentMiddleware()` handles `POST /__server-component` — the endpoint the client island wrapper posts to when it needs fresh server HTML:

```ts
import { SERVER_COMPONENT_ENDPOINT, createServerComponentMiddleware } from '@ubean/islands/server';

SERVER_COMPONENT_ENDPOINT; // '/__server-component'
app.use('*', createServerComponentMiddleware());
```

- Request body: `{ "path": "/abs/path/Foo.server.vue", "props": { … } }`.
- Responses: `200` HTML / `400` missing path / `404` unregistered component / `500` render failure; every response carries `Cache-Control: no-store`.
- `registerServerComponent(path, component)` / `getServerComponent(path)` are the registry accessors the SSR renderer and the middleware share.
- The registry deliberately lives on **`globalThis`**: in dev the SSR graph inlines this package's runtime while `@ubean/app` resolves `@ubean/islands/server` through Node, so a module-level `Map` would give the two instances different registries — the middleware would 404 for components that were registered (guard: `packages/islands/test/server-component-registry-singleton.test.ts`).
- `isServerComponentRequest(c)` / `isServerComponentResponse(response)` and `SERVER_COMPONENT_RESPONSE_HEADER` (`x-ubean-server-component`) let a request-logging or proxy layer identify these calls.

## Vite Plugin API

```ts
import { ubeanIslandsPlugin } from '@ubean/islands/vite';

export default {
  plugins: [ubeanIslandsPlugin({ enabled: true })]
};
```

`UbeanIslandsPluginOptions = { enabled?: boolean }`. The subpath also exposes the transform's building blocks for advanced integrations: `isServerComponentFile`, `isClientComponentFile`, `hasServerComponentTemplate`, `wrapServerComponentTemplate`, `findRestrictedServerComponentUsage`, `injectServerComponentPath`, `transformVueSfcIslands`, `collectIslandComponents`, `generateRegistryModule`, `parseScriptImports`, `resolveIslandImportPath`, `scanIslandDirectiveNames`, plus the virtual ids `ISLANDS_REGISTRY_VIRTUAL_ID`, `SERVER_COMPONENT_STUB_VIRTUAL_ID` and `CLIENT_COMPONENT_PLACEHOLDER_VIRTUAL_ID`.

The plugin is intentionally **not** re-exported from the main entry — it pulls `node:fs` / `node:path`, which must not reach a browser bundle.

## SSR Helpers

```ts
import { createIslandsContext, registerIsland, getIslandsScript, renderIslandPlaceholder } from '@ubean/islands';

const ctx = createIslandsContext();
const id = registerIsland(ctx, 'Counter', 'client:load', { initial: 10 });
const html = renderIslandPlaceholder({ component: 'Counter', directive: 'client:load', props: { initial: 10 } });
const script = getIslandsScript([...ctx.islands.values()]);
```

- `getIslandsBootstrapScript()` emits the IIFE that marks islands for hydration according to their strategy; `getIslandsClearScript()` its counterpart.
- `hydrationStrategyMeta` maps each directive to its strategy metadata.
- These are for custom SSR pipelines; the framework's own renderer already calls them.

## Type Safety

- `ClientStrategy` / `ClientDirective` / `ClientDirectiveBinding` / `VClientDirective` type the directive; `IslandStrategy` / `IslandOptions` / `ServerIslandOptions` the wrappers.
- `IslandRecord` / `IslandHydrateOptions` / `HydrateIslandsOptions` / `IslandHydrationScheduler` type the hydration runtime; `IslandsContext` / `IslandDefinition` / `IslandSsrOptions` the SSR helpers.
- `declare module 'virtual:ubean-islands-registry'` ships with the package, so the virtual module is typed without extra setup.

## Architecture Notes

- **Two layers, one job:** the `v-client.*` directive is the authoring surface; the registry plus the hydration runtime is the mechanism. You never call `hydrateIslands()` by hand in a normal app.
- **Browser-safe main entry:** `dist/index.js` imports only `./directive` and `./runtime`. The Vite plugin (`/vite`) and the Hono middleware (`/server`) are separate subpaths.
- **Registry on `globalThis`:** required because dev loads two module instances (see above); a module-scoped `Map` would silently split the registry.
- **The transform is deliberate about HTML parsing:** only parents where the parser actually reparents or drops the wrapper are rejected; `ul` / `ol` / `dl` are left alone to avoid false positives.
- **Progressive enhancement of the transform:** the plugin errors at build time rather than letting hydration remove content silently in production.
- **Ownership:** `@ubean/build` wires the plugin; `@ubean/client` owns the automatic hydration call; `@ubean/islands` owns the mechanism.
