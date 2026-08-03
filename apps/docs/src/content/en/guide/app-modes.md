---
title: App Modes
description: Application modes (fullstack / spa / ssg / backend) and how the mode field drives the build.
---

# Application Modes

ubean's `mode` config field declares the application shape and controls which build steps run. This is orthogonal to `preset` (deployment platform) and `routing.mode` (route data generation).

## Mode Overview

| Mode | Client bundle | SSR bundle | Server bundle | Prerender | Typical use case |
| --- | --- | --- | --- | --- | --- |
| `fullstack` (default, `ssr: true`) | ✅ | ✅ | ✅ | optional | Vue pages + Hono API + SSR (default behavior) |
| `fullstack` + `ssr: false` | ✅ | ❌ | ✅ | ❌ | Vue pages + Hono API, no SSR (admin dashboards) |
| `spa` | ✅ | ❌ | ❌ | ❌ | Pure client-side render, static HTML + JS, no server |
| `ssg` | ✅ | ✅ (temporary) | ❌ | ✅ (forced) | Build-time prerender to static HTML (marketing/blog) |
| `backend` | ❌ | ❌ | ✅ | ❌ | Pure Hono API service, no Vue pages, no SSR |

## Configuration

Set `mode` (and optionally `ssr`) in `ubean.config.ts`:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  mode: 'fullstack', // 'fullstack' | 'spa' | 'ssg' | 'backend'
  ssr: true // only effective when mode === 'fullstack'
});
```

CLI flags override the config file:

```bash
ubean build --mode spa
ubean build --mode fullstack --ssr false
ubean build --ssg          # shortcut for --mode ssg
```

## Mode Details

### `fullstack` (default)

The default mode — Vue pages + Hono API + SSR. Zero config needed.

- Build output: `dist/public/` (client) + `dist/server/` (server)
- Dev: Vite middleware mode + Hono app
- Preview: Node server (`server.mjs`)
- Prerender: optional (controlled by `prerender.enabled`)

### `fullstack` + `ssr: false`

Full-stack without SSR. Suitable for apps with no SEO requirements (admin panels, internal tools).

- Skips SSR bundle build (~40% build time saved)
- Server bundle still built (Hono app handles API routes)
- Pages render client-side; API routes respond normally
- Preview still uses the Node server

### `fullstack` + SSR exclude (`ssr: { exclude: [...] }`)

Most pages SSR, but exclude specific routes (e.g. admin dashboards, highly interactive pages that don't need SEO).

```typescript
export default defineConfig({
  mode: 'fullstack',
  ssr: {
    exclude: ['/admin/**', '/dashboard/*', '/realtime']
  }
});
```

- SSR bundle is still built (global `ssr` is `true` by default)
- Matching pages return a client-only HTML shell (CSR) instead of SSR
- Non-excluded pages render server-side normally
- Glob patterns: `*` (single segment), `**` (multi-segment recursive)
- Use case: mix of content pages (SSR) and app-like pages (CSR) in the same project

### Per-route SSR override via `routeRules` (P9-03)

For finer-grained control than `ssr.exclude`, use `routeRules.ssr` to override the global SSR setting per route. This takes precedence over `ssr.exclude`:

```typescript
export default defineConfig({
  mode: 'fullstack',
  ssr: {
    exclude: ['/admin/**']           // admin pages → CSR by default
  },
  routeRules: {
    '/admin/share-screen': { ssr: true },        // ...except this one (force SSR)
    '/feed': { ssr: 'streaming' },                // force streaming SSR for /feed
    '/dashboard/realtime': { ssr: false }         // force CSR even if not in exclude list
  }
});
```

| `routeRules.ssr` value | Behavior                                                                  |
| ---------------------- | ------------------------------------------------------------------------- |
| `true`                 | Force SSR for matching routes (overrides `ssr.exclude`)                   |
| `false`                | Force CSR for matching routes (treats them as if in `ssr.exclude`)        |
| `'streaming'`          | Force streaming SSR for matching routes (overrides `SsrOptions.streaming`) |

Combine with `routeRules.isr` for incremental static regeneration, or `routeRules.prerender` for build-time prerendering. See [Route Rules](/guide/pages-routing/overview#per-route-rendering-rules-p9-03) for the full field reference.

### `spa`

Pure client-side rendering, no server.

- Build output: `dist/public/` only (static `index.html` + assets)
- No SSR bundle, no server entry, no prerender
- Dev: Vite dev server, `app.fetch()` returns client HTML for all routes
- Preview: static file server serving `dist/public/`

### `ssg`

Static site generation — prerender at build time.

- Builds client + a temporary SSR bundle used only for prerendering
- Forces `prerender.enabled = true`
- Output: static HTML files under `dist/public/**/*.html`
- Temporary `dist/server/` is cleaned up after prerender
- Preview: static file server serving `dist/public/`

### `backend`

Pure API backend, no frontend.

- Skips page-related virtual modules and Vue plugins
- No client bundle, no SSR bundle
- Builds server bundle only (Hono app + API routes)
- Output: `dist/server/` only
- Preview: Node server (same as `fullstack`)

## Relationship to Other Config

| Config field | Relationship to `mode` |
| --- | --- |
| `build.preset` | Orthogonal — `mode` controls architecture, `preset` controls deployment platform (standard/node/cloudflare/vercel/vercel-edge/netlify/bun/deno) |
| `routing.mode` | Orthogonal — controls route file generation (virtual/file/both), independent of app `mode` |
| `prerender.enabled` | `ssg` forces it on; `spa`/`backend`/`fullstack`+`ssr:false` force it off |
| `ssr` | Sub-option of `fullstack` only; ignored by other modes |
| `icon`/`pwa`/`auth`/`i18n` | Orthogonal — loaded on demand, unaffected by `mode` |

## Mode Selection Guide

| Scenario | Recommended mode |
| --- | --- |
| Full-stack app (pages + API + SEO) | `fullstack` (default) |
| Full-stack app (pages + API, no SEO) | `fullstack` + `ssr: false` |
| Pure API service (no frontend) | `backend` |
| Marketing site / blog (static) | `ssg` |
| Pure frontend app (no API, no SEO) | `spa` |

## Notes

- `mode` defaults to `fullstack` and `ssr` defaults to `true` — existing projects need no changes (zero breaking change).
- `fullstack` + `ssr: true` (default) build flow is identical to pre-`mode` behavior.
- The legacy `ssr` mode alias was removed; use `fullstack` + `ssr: false` instead.
- `fullstack` + `ssr: false` still generates a server bundle because API routes need it. If you need neither SSR nor API, use `spa`.
