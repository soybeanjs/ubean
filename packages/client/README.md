# @ubean/client

**English | [中文](./README.zh-CN.md)**

Framework client runtime for ubean — the lean `@ubean/vue` kernel plus app factories, unhead, i18n, the data layer, islands hydration and SSR state helpers.

`@ubean/client` is the client entry of a full ubean application. It **re-exports the lean kernel** (`@ubean/vue` — components, router wiring, page cache, transitions, matchers) so the two share one implementation, then adds the framework layer on top: app factories, head/SEO facades, i18n, data fetching, islands hydration, SSR state and the Vue SSR renderer.

```ts
import { createClientHead, createUbeanClientApp } from '@ubean/client';

const head = createClientHead();
const { app, router, page } = createUbeanClientApp({
  routes,
  resolveLayoutComponent: name => import(`../layouts/${name}.vue`),
  head
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [App Factories](#app-factories)
  - [`@ubean/client/app`](#ubeanclientapp)
  - [`@ubean/client/define-app`](#ubeanclientdefine-app)
- [Entry Points](#entry-points)
  - [`@ubean/client/server`](#ubeanclientserver)
  - [`@ubean/client/ssr`](#ubeanclientssr)
- [Router Factory](#router-factory)
- [Head and SEO](#head-and-seo)
- [i18n](#i18n)
- [Data Layer](#data-layer)
- [Islands Hydration](#islands-hydration)
- [Color Mode](#color-mode)
- [Partytown](#partytown)
- [Search](#search)
- [SSR State](#ssr-state)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/client` is the **framework client runtime**, layered on the lean `@ubean/vue` kernel:

| Layer                              | Responsibility                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/vue` (kernel, re-exported) | Page routing, components (`PageView` / `Link` / `SlotView` / `LayoutChainRenderer` / `ErrorBoundary` / `ClientOnly`), page cache (keep-alive), transitions, reload signal, `definePage` macro, matchers |
| `@ubean/client` (this package)     | App factories, `defineApp`, unhead/SEO facades, i18n, data layer, islands hydration bridge, color mode, partytown, Pagefind search, SSR state helpers, Vue SSR renderer                                 |
| `@ubean/app`                       | Server side: `createUbeanApp` (Hono) and `defineServer` — **not** here                                                                                                                                  |
| `@ubean/pages`                     | Owns the data layer implementation (`useData` / `useFetch` / `defer`); this package re-exports it                                                                                                       |

**Included:**

- App factories `createUbeanClientApp` (client) and `createUbeanSSRApp` (SSR) — they own the client wiring: history selection, layout-chain resolution, i18n bridge, islands directive, hydration
- `defineApp` / `applyAppConfig` / `mergeAppConfig` / `createDefaultAppConfig`
- Head facades: `createClientHead`, `createServerHead`, `useHead`, `useSeoMeta`, `Head`, `useHeadInstance`, `useSchemaOrg`
- i18n: `createUbeanI18n`, `configureI18nRuntime`, `setLocale`, `getLocale`, `useLocalePath`, `useSwitchLocalePath`, `useLocaleRoute`, `useLocaleHead`
- Data layer re-exports: `useData`, `useAsyncData`, `useFetch`, `setDefaultFetch`, `invalidateData`, `defer`, `useDeferredData`
- Islands hydration: `hydrateIslands`, `collectIslands`, `hydrateIsland`, `hasPendingIslands`, `scheduleIslandHydration`, `defineIsland`, `defineServerIsland`
- Color mode, Partytown script loading, Pagefind search composables
- SSR state: `getInitialPageData`, `getInitialState`, and the `serializeState` / `hydrateState` hooks
- `createVueRenderer` (Vue SSR renderer) behind the `/ssr` subpath

**NOT included:**

- Server routing and the Hono app — `@ubean/app` (`createUbeanApp`) and `@ubean/routes` (`defineHandler`)
- The page-routing Vite plugin and file conventions — `@ubean/vue/vite`
- The islands Vite plugin (directive transform, `.server.vue` / `.client.vue`, registry) — `@ubean/islands/vite`
- robots.txt / sitemap.xml / manifest / JSON-LD **implementations** — `@ubean/seo` (this package only re-exports the pure JSON-LD helpers and provides the usable `useSchemaOrg`)
- The data layer **implementation** — `@ubean/pages`

**Runtime dependency whitelist (main entry): `@ubean/vue` (re-exported kernel), `@ubean/i18n`, `@ubean/islands`, `@ubean/pages`, `@ubean/shared`, `@unhead/vue`, `vue`, `vue-i18n`, `vue-router`, `@ubean/seo`.** `@ubean/seo` is an **optional peer** — it is the only static third-party import of the main entry, and it is installed with `ubean` in every full-framework project. No `node:*` import appears in `dist/index.js`.

## Install

```bash
pnpm add ubean          # or: pnpm add @ubean/client
# the optional peer (installed as part of ubean):
pnpm add @ubean/seo
```

## Quick Start

**1. App config** — `src/app.ts` describes the shell; the framework merges it into both the client and the SSR app:

```ts
// src/app.ts
import { defineApp } from '@ubean/client';

export default defineApp({
  router: {
    setup(router) {
      router.beforeEach(to => {
        if (to.meta.requiresAuth) return '/login';
      });
    }
  }
});
```

**2. Page** — `useData` is auto-imported and awaited in `<script setup>`:

```vue
<script setup lang="ts">
const { data: posts } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});
</script>

<template>
  <ul>
    <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
  </ul>
</template>
```

**3. Islands** — mark the interactive component, nothing else to wire:

```vue
<script setup lang="ts">
import Counter from '~/components/Counter.vue';
</script>

<template>
  <Counter v-client.load />
</template>
```

## App Factories

```ts
import { createUbeanClientApp, createUbeanSSRApp } from '@ubean/client';

const instance = createUbeanClientApp({
  routes, // RouteRecordRaw[]
  resolveLayoutComponent: name => import(`../layouts/${name}.vue`),
  defaultLayout: 'default',
  initialPage, // SSR-injected page data, read by getInitialPageData()
  head, // required: a @unhead/vue/client instance
  viewTransitions: true,
  router: { setup }
});
// instance = { app, router, head, page, preloadLayouts }

const ssr = createUbeanSSRApp(initialPage, { routes, resolveLayoutComponent, head });
```

- `createUbeanClientApp` throws `'[ubean] createUbeanClientApp requires a head instance from @unhead/vue/client'` when `head` is missing; `createUbeanSSRApp` throws the `@unhead/vue/server` variant.
- Both are normally called by the framework's generated client/server entry — you only call them by hand when building a custom entry.
- `preloadLayouts()` resolves the layout chain for the current route up-front so the first render already includes layouts.

### Getting the app instance outside a component

`useRouter()` only works inside `setup()`. When you need the router from a navigation guard, a plugin, a utility module, or anywhere else, the framework generated client entry registers the instance as a module-level singleton:

```ts
import { useUbeanApp, useUbeanRouter } from 'ubean/client';

const { router, head, page } = useUbeanApp(); // full instance
const router2 = useUbeanRouter(); // shorthand for useUbeanApp().router
```

On the server this singleton is deliberately **not** written — SSR creates one instance per request, so a module-level variable would be overwritten by concurrent requests. Inside an SSR component, inject instead:

```ts
import { inject } from 'vue';
import { UBEAN_APP_KEY } from 'ubean/client';

const { router } = inject(UBEAN_APP_KEY)!;
```

- Both entry points provide `UBEAN_APP_KEY`, so `inject` works on client and server alike. Prefer it (or `useRouter()`) inside components; use `useUbeanApp()` where there is no component context.
- `getUbeanAppInstance()` returns `null` instead of throwing — for isomorphic code that needs to test whether an instance exists. It is `null` on the server, always.
- `setUbeanAppInstance()` is internal wiring for `createUbeanClientApp()`. You do not call it.

### `@ubean/client/app`

The app subpath re-exports the kernel surface for framework consumers (`PageView`, `SlotView`, `Link`, `ClientOnly`, `ubeanVue`, `useViewTransition`, `usePage`, the injection keys, `LayoutChainRenderer`, the no-op macros `definePage` / `defineMeta` / `defineMiddleware`, `createUbeanRouter`, `Head` / `useHead` / `useSeoMeta`) together with the two app factories.

### `@ubean/client/define-app`

App configuration — no Vue instance is created here:

```ts
import { defineApp, applyAppConfig, mergeAppConfig } from '@ubean/client/define-app';

export default defineApp({
  plugins: [{ plugin: myPlugin, mode: 'client' }], // or a plain plugin / [plugin, ...args]
  globalComponents: { MyButton },
  provides: { theme: 'dark' },
  rootId: 'app',
  rootAttrs: { class: 'dark' },
  appRoot: AppRoot, // wrapper component; the framework outlet goes into its default slot
  router: {
    setup(router) {
      router.beforeEach(to => (to.meta.requiresAuth ? '/login' : true));
    }
  },
  onAppCreated: app => {},
  onClientReady: app => {},
  errorComponent: ErrorPage, // overrides pages/error.vue auto-detection
  loadingComponent: LoadingPage, // overrides pages/loading.vue auto-detection
  viewTransitions: true,
  serializeState: app => ({}), // SSR: read state after renderToString
  hydrateState: (app, state) => {} // client: restore it before mount
});
```

- `rootId` defaults to `'app'`; `appRoot` priority is `defineApp({ appRoot })` > `src/app.vue` > `src/App.vue`.
- `onClientReady` runs after mount — the documented escape hatch for manual islands.
- `mergeAppConfig` merges shared config with the mode-specific one (`src/app.server.ts` / `src/app.client.ts`); the two `router.setup` callbacks **accumulate**, shared first.
- `applyAppConfig(app, config, 'client' | 'server')` installs plugins, global components and provides — the generated entry calls it, and you call it yourself for a custom entry.

## Entry Points

### `@ubean/client/server`

Server-side head plus the whole `./app` surface: `createServerHead` is `createHead` from `@unhead/vue/server`, the counterpart of `createClientHead` from the main entry. Used by the generated server entry and by `createUbeanSSRApp`.

### `@ubean/client/ssr`

The Vue SSR renderer, isolated from the main entry because it statically imports `@vue/server-renderer` and `@unhead/vue/server`:

```ts
import { createVueRenderer } from '@ubean/client/ssr';

const renderer = createVueRenderer({ routes, resolveLayoutComponent, resolveAppConfig });
const result = await renderer.render(url, context);
```

`VueRendererOptions` accepts either `{ routes, ... }` (router-driven) or `{ resolvePageComponent, ... }` (simple); both take `resolveLayoutComponent`, an optional `defaultLayout`, and an optional `resolveAppConfig`.

## Router Factory

`@ubean/vue` ships **no** router factory — SPAs create their own with stock `vue-router`. The framework layer owns this convenience:

```ts
import { createUbeanRouter } from '@ubean/client';

const router = createUbeanRouter({
  routes,
  ssr: false, // true → createMemoryHistory (plus an initial router.push(initialUrl))
  base: '/',
  setup(router) {
    router.beforeEach(to => (to.meta.requiresAuth ? '/login' : true));
  },
  scrollBehavior: (to, from, saved) => saved ?? { top: 0 } // optional override
});
```

The default `scrollBehavior` returns to the top and scrolls smoothly to a hash target **only when the element already exists** (a client-rendered anchor may not exist yet on the first navigation); otherwise it skips scrolling to avoid vue-router's `VUE_ROUTER_R0042` warning.

## Head and SEO

```ts
import { createClientHead, useHead, useSeoMeta, useSchemaOrg } from '@ubean/client';

const head = createClientHead(); // -> @unhead/vue/client's createHead

useSeoMeta({ title: 'Home', description: '…' });
useHead({ htmlAttrs: { lang: 'en' } });
useSchemaOrg(schemaOrg.organization({ name: 'ubean', url: 'https://ubean.dev' }));
```

- `useHead` / `Head` / `useSeoMeta` come from `@unhead/vue`; `createServerHead` (from `./server`) is the SSR counterpart.
- `useSchemaOrg()` is the **usable** JSON-LD entry: it pushes `application/ld+json` through unhead's `useHead`, using the escaping of `@ubean/seo`'s `serializeJsonLd`. The identically named function re-exported from `@ubean/seo` is the isomorphic fallback and cannot reach a head instance on its own.
- The main entry also re-exports the pure helpers `defineJsonLd`, `renderJsonLdScript`, `renderJsonLdScripts`, `mergeJsonLd` and the `schemaOrg.*` factories — a client module never needs the aggregate `ubean` barrel for them.

## i18n

```ts
import { createUbeanI18n, configureI18nRuntime, setLocale, useLocalePath } from '@ubean/client';

configureI18nRuntime({
  config: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    strategy: 'prefix_except_default',
    fallbackLocale: 'en',
    cookieName: 'ubean_locale',
    baseUrl: 'https://example.com'
  },
  loadLocale: code => import(`./locales/${code}.json`)
});

const i18n = createUbeanI18n();
await setLocale('zh-CN'); // load messages + cookie + router.replace(switchLocalePath)
```

- `useLocalePath` / `useSwitchLocalePath` / `useLocaleRoute` / `useLocaleHead` are the path and SEO-head composables; `localizePath` / `switchLocalePath` / `extractLocaleFromPath` are the pure functions.
- The app factory provides `LOCALIZE_PATH_KEY`, which is how the kernel's `<Link>` localizes internal paths — a lean `@ubean/vue` SPA renders paths verbatim unless it provides one itself.
- `useI18n` itself is **not** re-exported here; import it from `vue-i18n` directly.

## Data Layer

The implementation lives in `@ubean/pages`; the client entry re-exports it so pages import from one place:

```ts
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json()),
  ttl: 60_000, // cache for 60s
  tags: ['posts'], // group invalidation: invalidateData('posts')
  dedupe: true // share in-flight requests with the same key (default)
});
```

- `UseDataOptions<T>` = `{ key?, tags?, ttl?, staleWhileRevalidate?, fetcher, dedupe? }`; `DataResult<T>` = `{ data, error, loading, pending, status, timestamp, invalidate(), refresh() }`.
- `useAsyncData(key, fn, options?)` is the positional alias; `useFetch(key, url, options?)` wraps it.
- ubean ships **no** HTTP client: call `setDefaultFetch(createRequest())` once (from `@soybeanjs/fetch`) so `useFetch` has a client, or let it fall back to native `fetch`.
- `defer(factory)` / `useDeferredData(key, deferred)` stream non-blocking data after the initial render.

## Islands Hydration

```ts
import { defineApp, hydrateIslands } from '@ubean/client';

export default defineApp({
  onClientReady: app => {
    // Escape hatch only: auto-registered islands are already hydrated.
    hydrateIslands({ appContext: app, components: { DynamicIsland } });
  }
});
```

- Islands hydrate **automatically** — the framework calls `hydrateIslands()` after mount (double `requestAnimationFrame`) and after each SPA navigation. A `v-client.*` component needs no code here.
- Manual entries passed in `onClientReady` take precedence over the auto-registry; already-hydrated islands are skipped through their `data-hydrated` attribute.
- `defineIsland(Component, strategy, options?)` and `defineServerIsland(Component, options?)` are the programmatic wrappers, re-exported from `@ubean/islands/runtime`. See [`@ubean/islands`](../islands/README.md) for the directive family, the registry and the `.server.vue` / `.client.vue` conventions.

## Color Mode

```ts
import { useColorMode } from '@ubean/client';

const colorMode = useColorMode();
colorMode.value; // resolved mode: 'light' | 'dark' | …
colorMode.preference; // 'system' | 'light' | 'dark' | …
colorMode.toggle();
```

`resolveColorModeConfig` / `configureColorMode` / `getColorModeScript` configure the mode and produce the no-FOUC inline script that runs before first paint (`classPrefix=''`, `classSuffix='-mode'`, `storageKey` / `cookieName` = `'ubean-color-mode'` by default).

## Partytown

```ts
import { useScript } from '@ubean/client';

const { load, remove } = useScript('https://www.googletagmanager.com/gtag/js?id=GA_ID', {
  trigger: 'idle', // 'load' | 'idle' | 'visible' | 'manual'
  partytown: true
});
```

Partytown is **opt-in** (`PartyTownConfig.enabled` defaults to `false`); `getPartyTownScript` / `getPartyTownHeadContent` emit the inline config that runs third-party scripts in a Web Worker.

## Search

```ts
import { useSearch } from '@ubean/client';

const { query, results, loading, search, clear, preload } = useSearch({ debounce: 200, limit: 10 });
```

Pagefind-backed full-text search: the index is generated at build time and the browser bundle loads lazily from `/pagefind/pagefind-modern.js`. `initPagefind` / `executeSearch` / `isPagefindLoaded` are the imperative counterparts.

## SSR State

```ts
import { getInitialPageData, getInitialState } from '@ubean/client';

const page = getInitialPageData(); // reads __UBEAN_PAGE_DATA__
const state = getInitialState(); // reads __UBEAN_STATE__
```

`getInitialPageData()` returns the SSR-serialized `PageObject` (or `null` on the server / before hydration). `getInitialState()` returns what `defineApp({ serializeState })` produced on the server; pair it with `hydrateState` to restore stores (e.g. Pinia) **before** `app.mount()`.

## Type Safety

- `UbeanAppOptions`, `UbeanAppInstance`, `DefineAppOptions`, `ResolvedAppConfig`, `CreateUbeanRouterOptions` describe the factory and config surface.
- Re-exported kernel types (`UbeanVuePage`, `UbeanVuePageData`, `LayoutChainContext`, `MatcherGuardOptions`, cache/transition return types) and data types (`DataResult`, `UseAsyncDataOptions`, `UseFetchOptions`, `DeferredValue`) keep a single import site.
- The kernel's `vue-router` `RouteMeta` augmentation (page name, layout, cache, matchers, head) applies to framework projects too — no local `declare module` needed.

## Architecture Notes

- **One implementation:** the kernel is not forked — `@ubean/client` re-exports `@ubean/vue`, so components, cache and transitions have a single source of truth.
- **Client imports use this package, not the aggregate barrel.** Importing the `ubean` main entry from a client module pulls the whole aggregation chain into the client bundle. Measured in `examples/ubean-test`: one `import { defineMatcher } from 'ubean'` grew the entry chunk from 45.2 kB to 111.9 kB gzip (+148 %); switching to `'ubean/client'` brought it back to +1.5 %. Guarded by `packages/cli/test/example-imports.test.ts` and `pnpm analyze:check`.
- **Lazy renderer:** the SSR renderer lives behind `/ssr` so client bundles never see `@vue/server-renderer` or `@unhead/vue/server`.
- **Two heads:** `createClientHead` (main entry, `@unhead/vue/client`) and `createServerHead` (`./server`, `@unhead/vue/server`) are intentionally distinct — the factories reject a mismatched instance.
- **The lean escape hatch:** an SPA that only needs routing, cache and transitions should depend on `@ubean/vue` directly (`vue` + `vue-router` only). See [`examples/client-only-spa`](../../examples/client-only-spa).
- **Naming:** `createUbeanClientApp` (Vue app) is distinct from `@ubean/app`'s `createUbeanApp` (Hono app).
