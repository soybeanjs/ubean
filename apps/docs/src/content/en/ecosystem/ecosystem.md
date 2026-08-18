---
title: Ecosystem
description: Capability survey of Nuxt, Next.js, SvelteKit, and Analog, and ubean’s adoption order.
---

# Ecosystem

This document records the findings of a capability survey of Nuxt, Next.js, SvelteKit, and Analog, along with ubean's adoption order. It describes planned designs and does not represent currently provided APIs.

## 1. Design Principles

ubean already covers file routing, SSR/SSG, islands, route rules/ISR, OpenAPI, typed clients, Pages loader/action, DevTools, i18n, queues, WebSocket, and SSE. Going forward, the goal is not feature count but closing the gaps in protocols, performance, and operability between these capabilities.

- **Node-first**: Every capability is first delivered with verifiable, complete semantics on the Node preset; other presets declare support, degradation, or rejection via a capability matrix.
- **Lean core**: Images, content, fonts, icons, and PWA are official optional extensions. Native dependencies, remote SDKs, or large datasets must never be statically pulled into `packages/ubean`.
- **Offline by default, explicit remote**: Production builds must not silently degrade due to undeclared CDNs, public APIs, or remote resources. Remote fallbacks during development must be explicitly configured and surfaced.
- **Unified page protocol**: New capabilities should reuse the Pages loader/action, `internalFetch`, Head management, and the Hookable lifecycle, rather than creating parallel RPC, routing, or cache models.
- **Security first**: Remote resources use a precise allowlist. Untrusted input from content, SVG, and metadata must cross an explicit sanitization boundary.

## 2. Reference Frameworks and Adoption Focus

| Reference | Borrowable capability                                             | ubean decision                                                                                |
| --------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Nuxt      | Runtime plugins, route middleware, `waitUntil`, modular resources | Complete the plugin lifecycle dependency graph; Image, Content, Fonts, Icon as official extensions |
| Next.js   | Image/font optimization, typed metadata, dynamic OG images, OpenTelemetry | Promote SEO/OG and observability to framework-level public contracts                          |
| SvelteKit | Loader dependency tracking, precise invalidation, streaming Promise, request/error hooks, Service Worker | Finish the page data protocol first, then evaluate PPR; PWA stays opt-in                       |
| Analog    | Content collections, frontmatter, typed form actions, Markdown content routing | `@ubean/content` provides collections and renderers; continues to reuse the Pages action      |

## 3. Core Protocol Priorities

### 3.1 Page data, invalidation, and streaming (M2)

The Pages loader/action must form a single data protocol:

- The loader declares logical dependencies via `depends('domain:key')`; the framework collects route, params, URL, fetch, and explicit dependency information.
- `invalidate(key)`, `invalidateRoute(route)`, and the action's `invalidate` option only re-run affected loaders; navigation must reuse non-invalidated parent layout data.
- The loader uses request-scoped fetch: same-origin API calls prefer `internalFetch`, forwarding only the allowed authentication context, avoiding unconditional header/cookie passthrough.
- `defer()` or serialized Promises mark non-critical data and support SSR streaming; presets that do not support streams must declare buffered behavior in their capability matrix.
- Once streaming begins, changing status/header or throwing a redirect is forbidden; error boundaries, cancellation, timeouts, and hydration use a unified result model.

This takes priority over generic Server Functions/RPC. The existing OpenAPI typed client and Pages action already cover most read/write scenarios. Introducing a second call semantics earlier would expand the auth, caching, and serialization maintenance surface.

### 3.2 Observability (M3)

Provide an optional `@ubean/observability` that, by default, only exposes abstractions and hooks and is not vendor-locked:

- A request ID propagates through the HTTP handler, SSR, loader/action, `internalFetch`, queues, and logs.
- Hookable lifecycles build `request`, `route`, `loader`, `action`, `render`, and `fetch` spans, with an OpenTelemetry exporter adapter.
- `reportError` and `onError` generate safe public error IDs; the client must never receive stack traces, secrets, or internal request context.
- DevTools display waterfalls, cache hits, slow routes, plugin/middleware timings, and the associated request ID.

### 3.3 SEO, metadata, and OG (M3)

On top of the existing Head management, provide a structured, mergeable SEO layer:

- `useSeoMeta()` or `defineSeo()` supports title template, description, canonical, robots, alternate locale, Open Graph, and Twitter fields.
- Root layout, nested layouts, page, and content frontmatter use a deterministic bottom-up merge order; duplicate tags are deduplicated by key.
- Conventional `sitemap.ts`, `robots.ts`, `manifest.ts`, icons, and `og-image.ts` are supported.
- Dynamic OG images are an optional `@ubean/og`, implemented on top of Satori/resvg, etc.; its fonts and images are accessed only through the controlled asset interfaces of `@ubean/integrations/fonts` and `@ubean/image`.

## 4. Official resource and content extensions (M5)

### 4.1 `@ubean/image`: modeled on Nuxt Image

Provides `<UbeanImg>`, `<UbeanPicture>`, and `useImage()`. A provider is responsible for generating image transformation URLs; the component itself only emits standard `img`/`picture` elements and introduces no layout wrappers.

```vue
<UbeanPicture src="/images/cover.jpg" alt="Article cover" sizes="100vw md:720px" :formats="['avif', 'webp']" preload />
```

```typescript
export default defineConfig({
  image: {
    provider: 'ipx',
    remotePatterns: [{ protocol: 'https', hostname: 'images.example.com', pathname: '/assets/**' }],
    formats: ['avif', 'webp'],
    presets: { avatar: { width: 96, height: 96, fit: 'cover' } }
  }
});
```

- Node uses optional IPX/sharp for self-hosted transformation; these must not enter the Edge bundle.
- SSG pre-generates used transformations via crawl/manifest; dynamic undeclared sizes must be diagnosed and must not silently produce 404s.
- Providers support platform image services and external CDNs; remote URLs must validate protocol, hostname, port, and pathname to prevent SSRF and open proxies.
- `width`/`height`, `srcset`, `sizes`, lazy loading, placeholder, and LCP preload are auto-generated, prioritizing CLS/LCP improvements.

### 4.2 `@ubean/content`: modeled on Nuxt Content v3

The existing `pages/**/*.md` is a zero-config page shortcut; complex docs, blogs, and data directories use a separate collection rather than scattering content queries across loaders.

```typescript
// content.config.ts
export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: { include: 'docs/**/*.md', prefix: '/docs' },
      schema: z.object({ title: z.string(), updatedAt: z.coerce.date() }),
      indexes: [{ columns: ['updatedAt'] }]
    })
  }
});
```

- A `page` collection establishes a one-to-one mapping from content files to URLs and exposes path, title, description, seo, body, and navigation fields; a `data` collection is used only for structured queries.
- Markdown, YAML, JSON, and CSV flow through a unified source, schema, AST, and type-generation pipeline; queries use `queryCollection().where().order().select().all()`.
- Production builds write parsed results as a content dump; Node/Edge restore the query store via a driver to avoid reading the full file set on cold start. Browser SQLite, full-text search, remote Git sources, and a visual editor are not included in the first release.
- `<ContentRenderer>`, Prose components, Shiki, table of contents, and navigation belong to the `@ubean/content` Vue layer. Vue components can be embedded in Markdown, but only an explicitly registered allowlist is permitted, and props must be validatable; raw HTML is sanitized by default and arbitrary expression execution is forbidden.

### 4.3 `@ubean/integrations/fonts`: modeled on Nuxt Fonts

At build time, scan the `font-family` declarations actually used in CSS/Vue SFCs, resolve them via `local -> provider`, and self-host the used fonts as hashed public assets.

- The first release ships only `local` and `google` providers; other providers extend via adapters.
- `@font-face`, unicode range, `font-display: swap`, and preload hints are auto-generated; the build must download fonts so the first production visit does not depend on third-party font services.
- Optional font metric fallback uses capabilities like fontaine/capsize to reduce CLS; when metrics cannot be obtained, font declarations are still generated normally and the build does not fail.
- Font URLs and the preload manifest should be exposed to Head and `@ubean/og` so that regular pages and OG images use consistent assets.

### 4.4 `@ubean/icon`: modeled on Nuxt Icon

On-demand collections based on Iconify, local SVG collections (Custom Local Collections), static scanning, and offline client bundles; default SVG output, and silent fallback to the public Iconify API is forbidden in production.

```ts
// vite.config.ts
import { ubeanIconPlugin } from '@ubean/icon/vite';

export default {
  plugins: [
    ubeanIconPlugin({
      // Local custom icon collections (parallels @nuxt/icon Custom Local Collections)
      customCollections: {
        // Shorthand: key is the prefix, value is the SVG directory path
        'my-icons': './assets/icons',
        // Full config: custom normalizeIconName
        brand: {
          dir: './assets/brand-svgs',
          prefix: 'brand',
          normalizeIconName: name => name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        }
      }
    })
  ]
};
```

- `<Icon name="lucide:home" />` uses a remote Iconify collection (requires the matching `@iconify-json/lucide` to be installed)
- `<Icon name="my-icons:auth-login" />` uses local SVG (nested directory `assets/icons/auth/login.svg` → prefix-hyphenated naming)
- SVG width/height/viewBox attributes are auto-extracted; HMR in development supports local SVG add/remove/edit
- The dev server `/_iconify` route checks the local custom collection first and returns the SVG on hit, otherwise falls back to the Iconify API
- Node SSR can serve icons locally on demand; SSG/Edge use the offline bundle or an explicit remote provider

### 4.5 `@ubean/integrations/pwa`: modeled on vite-plugin-pwa / Nuxt PWA

Provides progressive web app support, including Web App Manifest generation, Service Worker registration, and caching strategies. Opt-in by default.

```ts
// vite.config.ts
import { ubeanPwaPlugin } from '@ubean/integrations/pwa';

export default {
  plugins: [
    ubeanPwaPlugin({
      enabled: true,
      manifest: {
        name: 'My Ubean App',
        short_name: 'Ubean',
        description: 'A Ubean PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/'
      },
      registerType: 'autoUpdate', // 'autoUpdate' | 'prompt' | 'manual'
      workbox: {
        precacheManifest: true,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{ urlPattern: /^https:\/\/fonts\.googleapis\.com/, handler: 'stale-while-revalidate' }]
      }
    })
  ]
};
```

```vue
<script setup lang="ts">
import { usePwa } from '@ubean/integrations';

const { needRefresh, updateServiceWorker, isOfflineReady, isInstalled } = usePwa();
</script>

<template>
  <div v-if="needRefresh">
    A new version is available
    <button @click="updateServiceWorker()">Refresh</button>
  </div>
  <div v-if="isOfflineReady">Ready for offline use</div>
</template>
```

- Build time auto-generates `manifest.webmanifest` and a version-hashed `sw.js`
- Built-in cache strategies: `cache-first`, `network-first`, `stale-while-revalidate`, `network-only`, `cache-only`
- Default runtimeCaching rules cover images/fonts/assets/api/pages
- HTML auto-injects the manifest link, theme-color meta, and either an inline registration script (inline mode) or auto-registration
- `usePwa()` exposes reactive state (isInstalled/isUpdateAvailable/isOfflineReady/needRefresh/registration)
- Workbox integration, prompt UI components, dev-mode SW debugging, and more manifest fields (shortcuts/share_target) will be refined in subsequent iterations

### 4.6 `@ubean/auth`: modeled on Nuxt Auth / Better Auth

An authentication plugin based on [Better Auth](https://better-auth.com) that provides a zero-config auth solution with a built-in email/password fallback implementation.

```ts
// vite.config.ts
import { ubeanAuthPlugin } from '@ubean/auth/vite';

export default {
  plugins: [
    ubeanAuthPlugin({
      enabled: true,
      basePath: '/api/auth',
      secret: process.env.AUTH_SECRET,
      trustedOrigins: ['https://example.com'],
      session: {
        cookieName: 'ubean_session',
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24 // 1 day
      },
      // Full Better Auth config (optional; built-in fallback is used if omitted)
      betterAuth: {
        emailAndPassword: { enabled: true },
        socialProviders: { github: { clientId: '...', clientSecret: '...' } }
      }
    })
  ]
};
```

```vue
<script setup lang="ts">
import { useAuth } from '@ubean/auth';

const { user, isAuthenticated, isLoading, signIn, signUp, signOut, session } = useAuth();
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <template v-else-if="isAuthenticated">
    <span>Hello, {{ user?.name }}</span>
    <button @click="signOut()">Sign out</button>
  </template>
  <button v-else @click="signIn(email, password)">Sign in</button>
</template>
```

- The server-side `createAuthHandler()` dynamically imports `better-auth` and automatically falls back to the built-in email/password implementation when it is not installed
- The Vite plugin mounts `/api/auth/*` routes on the dev server (Hono middleware) automatically
- The virtual module exposes a type-safe auth client at `ubean/auth/client`
- The `useAuth()` Vue composable provides reactive session/user/isLoading/isAuthenticated state
- Auto-registers fetchSession (onMounted + focus/visibilitychange listeners)
- Supports all Better Auth features: OAuth social login, session management, account linking, etc.

### 4.7 `@ubean/integrations/pinia`: modeled on Nuxt Pinia / official Pinia SSR

[Pinia](https://pinia.vuejs.org/) is the officially recommended state management library for Vue. ubean provides a thin wrapper via `@ubean/integrations/pinia` that handles dev pre-bundle optimization and SSR state hydration helpers without re-exporting the Pinia API.

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true // enable dev pre-bundle optimization
});
```

```ts
// src/app.ts — register the Pinia plugin + SSR hydration hooks
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

```ts
// src/stores/counter.ts — store definition is identical to regular Pinia
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  actions: {
    increment() { this.count++; }
  }
});
```

- Set `pinia: true` or `pinia: { ... }` in `ubean.config.ts` to automatically add `pinia` to `optimizeDeps.include`
- SSR state hydration integrates via the `defineApp({ serializeState, hydrateState })` hooks; state is serialized into an `__UBEAN_STATE__` script tag in the HTML
- `serializePiniaState(app)` extracts state from `app.config.globalProperties.$pinia.state.value`
- `hydratePiniaState(app, state)` is called after `applyAppConfig` (which registers the `createPinia()` plugin) and before `app.mount()`, injecting SSR state into the client pinia instance
- **Zero intrusion**: Pinia itself is still imported from the `pinia` package; `@ubean/integrations/pinia` only provides integration glue and SSR hydration helpers
- **Safe degradation**: serialization returns an empty object when `$pinia` is not detected; hydration is a no-op when `state` is null or lacks a `pinia` field

## 5. Deferred Capabilities

| Capability                                                  | Decision                          | Reason                                                                        |
| ----------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Partial Prerendering                                        | Deferred                          | Must first validate loader invalidation, streams, Suspense error boundaries, cache, and hydration semantics |
| Generic Remote Functions/RPC                                | Deferred                          | OpenAPI client and Pages action already cover the main needs; avoids parallel auth/cache models |
| PWA / Service Worker                                        | ✅ `@ubean/integrations/pwa` opt-in extension provided | Provides only versioned asset manifest, registration entry, and explicit cache strategy; does not cache business data by default |
| Auth                                                        | ✅ `@ubean/auth` opt-in extension provided | Better Auth integration + built-in fallback; supports email/password and social login |
| State management (Pinia)                                    | ✅ `@ubean/integrations/pinia` opt-in extension provided | Dev pre-bundle optimization + SSR state hydration helpers; Pinia itself is installed directly by the user |
| Content browser SQLite, full-text search, remote Git source, Studio | Future extension                  | The first release prioritizes stability of collections, typed queries, renderers, and the static dump |

## 6. Acceptance Requirements

- Page data protocol: browser end-to-end fixtures for SSR hydration, navigation reuse, precise invalidation, defer streaming, buffered fallback, cancellation, and error boundaries.
- Observability: unit tests for trace/request ID propagation across `internalFetch` and queues, error redaction, and the exporter adapter.
- SEO/OG: snapshot and security tests for layout/page/frontmatter merging, tag deduplication, and the robots/sitemap/OG handlers.
- Image/Fonts/Icon: no undeclared network requests in Node SSR, SSG, the Cloudflare experimental preset, or component tests; verify remote allowlists, font self-hosting, SVG sanitization, and bundle size limits respectively.
- Content: schema negative cases, AST/renderer, dump integrity, index queries, and raw HTML/component allowlist security tests.

## Next Steps

- [Routing](/architecture/routing) — file-based routing and route rules
- [App Modes](/guide/app-modes) — fullstack / spa / ssg / backend
- [Quickstart](/guide/quickstart) — get a project running in minutes
- [ubean API Reference](/reference/api/ubean) — core runtime exports
