# ubean Project Memory

> Consolidated engineering memory for the ubean framework. This file serves as the single source of truth for hard constraints, conventions, and lessons learned across all development sessions.

---

## Hard Constraints

### Routing & API

- API routes use void-style named exports (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS`/`HEAD`) in a single file, no method suffix
- `defineHandler` supports middleware chains; request validation uses hono-openapi's `validator(target, schema)` (re-exported from ubean) with 6 targets: `'json'`|`'form'`|`'query'`|`'param'`|`'header'`|`'cookie'` (Standard Schema v1); validated data accessed via `c.req.valid(target)` with automatic type inference from hono-openapi
- OpenAPI documentation uses hono-openapi's `describeRoute({ tags, summary, description, operationId, deprecated, responses })` middleware (re-exported from ubean); response schemas use `resolver(schema)`; OpenAPI definitions are auto-collected by hono-openapi at runtime
- `defineHandlerMeta` is used only for ubean-specific metadata: `public?: boolean` (for auth bypass), `cache`, `rateLimit`, and custom extension fields `[key: string]: unknown`; it is a pass-through middleware at runtime and extracted via AST at build time
- Page routes use `definePage()` macro for meta, layout, path/name override; layouts in `layouts/` (xx.vue or xx/index.vue); reuse files use `.reuse.ts`/`.reuse.vue`
- Middleware: `global`/`global.*` → `/*`; others mounted by directory prefix (e.g., `middleware/admin/auth.ts` → `/admin/*`)
- `public/` static files served with ETag/MIME/Cache-Control, skipping `/_` and `/api/`
- OpenAPI enabled by default in dev: `/_openapi.json` + `/_scalar` UI; auto-generated from hono-openapi's `describeRoute` + `validator` middleware

### UI & Styling

- ALWAYS prioritize `@soybeanjs/ui` `S*` components over custom implementations
- DevTools UI: Vue SFC (no inline HTML string templates), UnoCSS with `@soybeanjs/unocss-shadcn` preset, `generated: { reset: true, global: true, ui: true }`
- UnoCSS rules: utility-first (no scoped CSS except `:deep()`); shortcuts need ≥3 references; dynamic classes from `.ts` go to safelist; animations/keyframes in uno.config.ts theme; `style.css` only for structural resets
- Icons from Iconify; @soybeanjs/ui Icon can use any iconify icon

### i18n

- Built-in zero-dependency i18n (`runtime/i18n.ts`, `i18n-routing.ts`); do NOT recommend vue-i18n
- i18n routing: 3 strategies (`prefix`/`prefix_except_default`/`no_prefix`); detection order: URL path → cookie (`ubean_locale`) → Accept-Language → defaultLocale; 302 redirect on mismatch; sets `Content-Language` header
- P6-31~P6-35 track Vue reactivity, auto-load, SSR hydration, plural, Intl enhancements

### Extension Packages

- All `packages/` use `@ubean/` scope + kebab-case; Vite entry via `/vite` subpath (e.g., `@ubean/icon/vite`)
- Current packages: `ubean-icon`, `ubean-pwa`, `ubean-auth`, `ubean-image`, `ubean-content`, `ubean-fonts`
- `@ubean/icon`: `customCollections` accepts object-shape config (key→dir shorthand or `{dir,prefix,normalizeIconName}`), NOT array; nested subdirs → hyphenated prefixes; `/_iconify` dev route serves local SVGs before Iconify API fallback; `parseSvgToIconData()` extracts body+width/height/viewBox
- `@ubean/auth`: `ubeanAuthPlugin` mounts `/api/auth/*` in dev; `createAuthHandler()` dynamically imports better-auth with graceful fallback to built-in email/password; virtual `@ubean/auth/client` provides typed client; `useAuth()` provides reactive session/user/isAuthenticated
- `@ubean/pwa`: `ubeanPwaPlugin` generates manifest.webmanifest + sw.js at build; `registerType`: `autoUpdate`|`prompt`|`manual`; 5 cache strategies; `usePwa()` provides isInstalled/isUpdateAvailable/isOfflineReady/needRefresh

### Platform & Architecture

- Reference Nitro/honojs patterns; do NOT copy code directly
- View Transitions: native `document.startViewTransition()` for client nav with auto fallback; customize via `::view-transition-old/new`; shared elements via `view-transition-name` CSS

### Git

- Conventional Commits format; English scope/subject; body in Chinese or English as appropriate

---

## Engineering Conventions

### Routing & Data

- Type-safe fetch client: ofetch-based, OpenAPI-generated types from `.ubean/routes.d.ts` (from hono-openapi's describeRoute + validator)
- Cron jobs in `crons/` via `defineScheduled()`, numeric prefix ordering
- Route groups: `(group-name)/` directories don't contribute to URL segments
- `defineHandlerMeta` returns pass-through middleware with `.__meta` for AST extraction (only ubean-specific fields: public/cache/rateLimit/custom)
- Request validation: use hono-openapi's `validator(target, schema)` middleware (re-exported from ubean); `defineValidator` has been removed
- OpenAPI docs: use hono-openapi's `describeRoute()` and `resolver(schema)` for response schemas (re-exported from ubean)
- Layout chain: SSR/client both resolve via path hierarchy (admin/dashboard → admin → default), supports `resolveLayoutParent`
- Route rules: `*` single-segment wildcard, `**` multi-segment recursive; processed redirect > rewrite > headers (merged); cache rules → `Cache-Control` headers

### Presets

- `PresetMeta`: `name`/`aliases`/`stdName`/`static`/`dev`/`compatibilityDate`/`url`
- Supports `extends` inheritance (cycle detection, deep merge), function form for lazy loading
- Lifecycle hooks: `build:before`/`build:after`/`compiled`/`dev:setup`; aliases like `cf`→`cloudflare`, `default`→`standard`, `node-server`→`node`

### Vue & Islands

- Link component: `to` (string or `{name,params,query,hash}`), `activeClass`/`exactActiveClass`, auto external detection, slot exposes `isActive`/`isExactActive`
- Islands: `<Comp client:load|idle|visible|media|only />` → `<ubean-island>` custom elements with data-\* attrs; bootstrap IIFE sets `data-hydrating`; client `hydrateIslands()` uses MutationObserver; register via `compilerOptions.isCustomElement`

---

## Lessons Learned

- **Void's hardcoded App.vue SSR entry** limits plugin registration → use `defineApp()` to expose Vue instance/context
- **Custom validator implementation** is unnecessary → use battle-tested `hono-openapi` library's `validator`/`describeRoute`/`resolver` (re-exported from ubean) instead of custom `defineValidator`; it provides better type inference, standard schema support, and automatic OpenAPI collection
- **Direct code copying** from reference projects causes API inconsistency → learn architecture patterns instead
- **Vue SSR `renderer.ts` layout loop**: `vnode` captured by slot closure causes infinite recursion ("Maximum call stack size exceeded") → use `const child = vnode` in block scope to capture the value
- **Vite dev server async middleware** (Express/Connect) must be wrapped in `Promise.resolve().then().catch()` — never pass async functions directly to `server.middlewares.use()` or unhandled rejections will crash the dev server
- **Vite Service Worker code generation**: use hardcoded string `'ubean-runtime'` for RUNTIME global, not template substitution (avoids undefined reference errors in the generated SW)

---

## Test Baseline (as of 2026-07-12)

- Main package (`ubean`): 35 test files, **822 tests passing**
- Extension packages: `@ubean/icon` 32, `@ubean/auth` 13, `@ubean-pwa` 19, `@ubean-image` 42, `@ubean-content` 18, `@ubean-fonts` 21
- Total: **967 tests** across all packages
- TypeScript `pnpm typecheck`: passes
- Build `pnpm build`: passes (main + all 6 extension packages)
