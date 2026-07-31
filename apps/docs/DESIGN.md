# apps/docs — Design

> Design record for the ubean framework documentation site (`apps/docs`).
> Produced by a `grill-with-docs` session; see [GLOSSARY.md](./GLOSSARY.md) for terminology.

## 1. Context & Goals

`ubean` is a full-stack Vue meta-framework (Vite + Hono + Vue). Today its documentation is split across two disconnected locations:

- [`skills/ubean/docs/`](../../skills/ubean/docs) — user-facing guide / integrations / reference (English). Already referenced by [`skills/ubean/SKILL.md`](../../skills/ubean/SKILL.md) as the public docs.
- [`docs/`](../../docs) — internal architecture / engineering / roadmap docs (Chinese), classified in [`docs/README.md`](../../docs/README.md) into *architecture reference*, *historical design*, and *proposals*.

Goal: ship a single documentation site at `apps/docs` that **dogfoods the ubean framework itself**, merges both audiences under one IA, and matches the visual/interaction quality of the local reference project [`soybean-ui/apps/docs`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs) — while adapting it from a *component-library* doc site to a *framework* doc site.

## 2. Non-Goals (v1)

- **Multi-version switching** (the "版本控制" requirement). ubean is at `v0.0.1`; a version switcher has no data to switch between. v1 ships single-version, but the routing/content layout stays extensible so a `/v{n}/` prefix or frontmatter-driven filtering can be added later without rearchitecting. Tracked as a phase-2 item.
- **Live playground / interactive component editor.** The reference's `playground-gallery.vue`, `component-api.vue`, `type-table.vue`, `component-changelog.vue`, `tailwind-palette.vue` are component-library-specific and are **not** ported.
- **API reference for all 39 packages.** v1 covers a curated subset of ~7 (see §6).
- **Translation of every historical/proposal doc.** Those ship as-is with status badges; full bidirectional translation is a content task, not an architecture one.

## 3. Decision Log

Each entry: **Decision → Rationale → Alternatives considered**.

### D1. Content source — merge both doc directories
**Decision:** Publish both `skills/ubean/docs/` (user-facing Guide/Integrations/Reference) and `docs/` (architecture, engineering, roadmap, historical, proposals) as sections of one site.
**Rationale:** Two audiences (users + contributors) currently have no shared entry point; a single site with clear sectioning serves both and removes the "where does this doc live?" friction.
**Alternatives:** skills/ubean/docs only (loses contributor architecture docs); repo docs/ only (not user-facing, English gap).

### D2. Content location — move into `apps/docs` (single source of truth)
**Decision:** Move content from `skills/ubean/docs/` and the public-facing subset of `docs/` into `apps/docs/src/content/{en,zh}/`. `apps/docs` becomes the source of truth; `skills/ubean/SKILL.md` links are updated to point at the new locations.
**Rationale:** Avoids sync drift, keeps the app self-contained, and lets `.md` files become real ubean pages (per-page `definePage`/`head`/SEO) instead of queried data.
**Alternatives:** build-time sync copy (drift, CI complexity); `@ubean/content` collections (content-as-data, weaker per-page SEO, no `definePage`).

### D3. Build mode — SSG / prerender
**Decision:** `mode: 'ssg'` (or `fullstack` + prerender). Fully static HTML output.
**Rationale:** Docs are read-mostly and SEO-critical; static HTML is cheapest to deploy, best for search indexing, and matches the reference (`vite-ssg`). ubean's prerender is built for this.
**Alternatives:** SSR (needs runtime, no static hosting); SPA (poor SEO).

### D4. API reference — TypeDoc → JSON → custom `<ApiTable>` renderer, curated subset
**Decision:** A `build:api` script runs TypeDoc over a curated set of packages, emitting JSON consumed by a custom `<ApiTable>` Vue component.
**Rationale:** TypeDoc is the mature, battle-tested TypeScript doc extractor; a custom renderer keeps the output shape small and ubean-specific (`defineHandler`/`definePage` aware where useful). A curated subset ships v1 fast and expands later.
**Alternatives:** custom ts-morph generator (maintenance burden, reinvents TypeDoc); api-extractor (overkill); reuse ubean OpenAPI (only covers HTTP API, not composables/config types); hand-written markdown (no type sync, drifts).

### D5. TypeDoc trigger — pre-build script
**Decision:** `pnpm build:api` runs TypeDoc CLI over `packages/*/dist/*.d.ts` (build artifacts) → `apps/docs/public/api/*.json` before `ubean build`/`ubean dev`.
**Rationale:** Decoupled from Vite, debuggable, cacheable. Reads built `.d.ts` (not source) so it reflects the published type surface. Dev reruns manually (or via a watcher in a second phase).
**Alternatives:** Vite plugin (couples dev startup to TypeDoc); CI-generated committed JSON (stale risk).

### D6. Generator scope — curated 7 packages
**Decision:** v1 generates API JSON for: `ubean` (aggregator), `@ubean/runtime`, `@ubean/routing`, `@ubean/config`, `@ubean/auth`, `@ubean/ui`, `@ubean/pinia`.
**Rationale:** Covers the most-used surface (config + routing + runtime + the four most common extensions). Other packages added incrementally.
**Alternatives:** all 39 packages (noise, effort); main `ubean` only (loses sub-package granularity).

### D7. i18n — EN + zh-CN, both directions, ubean built-in i18n
**Decision:** Ship both locales. Use ubean's built-in zero-dependency i18n (`useI18n`, `defineLocale`), **not** vue-i18n (per project convention). Strategy: `prefix_except_default`. EN is default (unprefixed); zh-CN at `/zh/*`.
**Rationale:** `skills/ubean/docs` is English-first; `docs/` is Chinese-first. Two-way translation serves both audiences. Dogfooding ubean's i18n validates the framework. EN-default matches international convention.
**Alternatives:** EN only (limits reach); zh-CN default (less conventional for OSS); both prefixed + root redirect (redirect hop complicates prerender).

### D8. Visual fidelity — structural shell + new `<ApiTable>`
**Decision:** Port the reference's structural shell only: `AppHeader`, `SiderMenu`, `SearchDocument`, `CodeBlock` (shiki), `ToolBar` (theme + locale), `SAnchor` outline, `404`/`home`/`blank` layouts, breadcrumb. **Skip** the component-library-specific components (playground, component-api, type-table, component-changelog, tailwind-palette). Add a NEW `<ApiTable>` that consumes the TypeDoc JSON.
**Rationale:** The reference is purpose-built for a component registry; most of its bespoke components have no framework equivalent. The shell (header/sidebar/outline/search/theme) is the valuable, reusable part.
**Alternatives:** full port (dead code, component-library assumptions); fresh design (loses proven patterns, slower).

### D9. Styling — `@ubean/ui` UnoCSS mode + `@soybeanjs/unocss-shadcn`
**Decision:** `ubean.config.ts` sets `ui: { css: false }` (UnoCSS mode) + `@soybeanjs/unocss-shadcn` preset in `uno.config.ts`. This mirrors both the reference's visual system and the existing ubean DevTools styling convention.
**Rationale:** Consistent with project memory ("DevTools UI: UnoCSS with `@soybeanjs/unocss-shadcn` preset"). Utility-first, no scoped CSS. Same component primitives (`S*`) as the reference.
**Alternatives:** `@ubean/ui` CSS mode + Tailwind (diverges from reference + DevTools); direct `@soybeanjs/ui` (bypasses ubean integration, more manual).

### D10. Search — prerender-time fuse.js index
**Decision:** At prerender time, walk all markdown content + generated API JSON, build a fuse.js index (title + heading + body excerpt + route), emit to `public/search-index.json`. Client fetches it once and searches in-memory.
**Rationale:** Static-host friendly (no server runtime), simple, fuse.js is already a ubean workspace dependency (used by DevTools). Matches the reference's client-side `SearchDocument` pattern.
**Alternatives:** server-side `/api/search` (contradicts SSG); external (Algolia/Pagefind — vendor lock-in / new tool).

### D11. Code highlighting — shiki via `@ubean/markdown` `highlighter` option + `<CodeBlock>`
**Decision:** Two paths share one shiki setup (`one-light` / `one-dark-pro`, `defaultColor: false` for CSS-driven theming):
1. Markdown fences — pass a shiki `highlighter` into `@ubean/markdown`'s `MarkdownOptions.highlighter` (the package already exposes this hook).
2. Explicit inline samples — a ported `<CodeBlock>` component using `codeToHtml` directly.
**Rationale:** `@ubean/markdown`'s `highlighter` callback is the clean, supported integration point (verified in [`packages/markdown/src/index.ts`](../../packages/markdown/src/index.ts)). One theme config for both paths.
**Alternatives:** remark-shiki plugin (redundant — markdown package already pluggable); no highlighting (unacceptable for a framework docs site).

### D12. Outline — `parseMarkdown` headings → layout
**Decision:** `@ubean/markdown`'s `parseMarkdown` already returns `headings: MarkdownHeading[]` (level/text/id). Expose these to the layout (via page meta / a composable mirroring the reference's `useDocOutline` + `setDocOutline`), render with `SAnchor`.
**Rationale:** Headings are extracted at parse time for free; no runtime DOM scraping needed.
**Alternatives:** runtime DOM scraping (fragile, layout-shift).

### D13. Historical/proposal docs — include with status badges
**Decision:** Include `docs/` historical design + proposal docs (subpackage-splitting, modes, islands-auto-registry, ubean-studio) in the Architecture section, each with a status badge (`✅ Implemented` / `⬜ Proposal`) and "last updated" note. Mirrors the classification in [`docs/README.md`](../../docs/README.md).
**Rationale:** Honest, no information loss, preserves decision history, sets reader expectations.
**Alternatives:** exclude (loses history); separate "Design History" section (more sectioning overhead).

### D14. Home page — hero + features + comparison + ecosystem
**Decision:** Hero (name, tagline, primary CTAs: Get Started / GitHub), 3–6 feature cards (Full-stack SSR, File-based routing, Islands, Multi-platform, DevTools, i18n), a framework comparison table (rendered from `framework-comparison.md`), and an ecosystem/package grid.
**Rationale:** Richer first impression for a framework; the comparison table is high-value content that already exists. Accepts the maintenance tradeoff (comparison may need updates).
**Alternatives:** hero + features + quickstart only (faster but underwhelming); minimal hero (too thin for a framework).

### D15. `<ApiTable>` rendering — data-driven `STable` (columns/data/slots)
**Decision:** Render API parameter/property tables with `@soybeanjs/ui`'s `STable` in its data-driven form: `:columns` (array of `{key, dataIndex, title, minWidth}`) + `:data` (array of row objects) + `:row-key` + per-column named slots (`#name`, `#type`, …). Mirrors the reference's [`tables/type-data.vue`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/components/tables/type-data.vue).
**Rationale:** `STable` does **not** export `STableHeader`/`STableBody`/`STableHead` structural subcomponents (only `STable`/`STableRow`/`STableCell`); the supported API is data-driven. This is also mandated by the project convention "ALWAYS prioritize `@soybeanjs/ui` `S*` components over custom implementations".
**Alternatives:** plain HTML `<table>` with shadcn table classes (simpler/lighter, but violates the S* convention and diverges from the reference visual); definition lists (semantic, but visually inconsistent with reference). Verified by reading [`@soybeanjs/ui` table index](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/packages/ui/src/components/table/index.ts) and the headless `TableSlots` type.

### D16. Right-sidebar outline — decoupled `DocOutlineItem` + nested mapping in layout
**Decision:** Keep `use-doc-outline.ts`'s `DocOutlineItem { label, value, level }` UI-agnostic (as previously decided). Build a nested h2→h3 tree in `[...slug].vue` (h2 = top-level, h3 = `children`). Map `DocOutlineItem[]` → `AnchorOptionData[] { title, href: '#'+value, children }` in `default.vue` before passing to `SAnchor`.
**Rationale:** Respects the prior decision to keep the outline composable free of `@soybeanjs/headless/anchor` coupling. `SAnchor`'s `AnchorOptionData` requires `href` (not `value`) and supports `children` for indentation — the mapping is a thin layout-layer concern, not a domain concern. Gives the standard indented-h3 outline UX.
**Alternatives:** reshape `DocOutlineItem` to `{title,href,children}` to match `AnchorOptionData` directly (re-couples composable to UI shape); flat h2-only outline (loses subsection navigation). Verified against [`anchor/types.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/packages/headless/src/components/anchor/types.ts) (`AnchorOptionData` requires `href`).

### D17. Locale switching — `switchLocalePath` + `router.push`
**Decision:** `tool-bar.vue`'s locale toggle uses `switchLocalePath(next, route.path)` from `ubean/runtime/vue` + `router.push(target)` to navigate to the localized URL, NOT `useI18n().setLocale()`.
**Rationale:** With `strategy: 'prefix_except_default'`, the locale is encoded in the URL path; content is loaded per-locale by `[...slug].vue`'s path-prefix detection. `setLocale()` only mutates internal i18n state + cookie and does **not** navigate, so the content tree would not swap. `switchLocalePath` computes the equivalent path in the target locale (e.g. `/guide/quickstart` ↔ `/zh/guide/quickstart`), and the route change drives re-resolution. Also fixes the `locale === 'en'` bug (`locale` is a ref `{value}`; must compare `locale.value`).
**Alternatives:** `setLocale()` alone (no navigation, content stale); manual path-prefix swap (reinvents `switchLocalePath`). Verified against [`runtime/src/i18n.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/ubean/packages/runtime/src/i18n.ts) (`VueI18nInstance` exposes `availableLocales`, not `locales`; `setLocale` does not call the router).

### D18. SSG prerender fix — bundle ubean + inline islands-registry stub
**Decision:** The SSR build's `rollupOptions.external` must NOT include the `/^ubean(\/.*)?$/` pattern when `ssr.noExternal: ['ubean']` is set. Additionally, an inline `ubean:islands-ssr-stub` Vite plugin (`enforce: 'pre'`) resolves `virtual:ubean-islands-registry` to `export const islands = {};` during SSR build.
**Rationale:** `ubean/runtime/vue` (pulled into the SSR bundle via `virtual:ubean-app`) imports `virtual:ubean-islands-registry` — a client-only virtual module populated by `ubeanIslandsPlugin` during the client build. When ubean was externalized by `rollupOptions.external`, Node.js loaded it from `node_modules` at prerender time, where the `virtual:` import is unresolved, causing `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'virtual:'`. The fix has two parts: (1) filter the ubean pattern out of `rollupOptions.external` so Vite bundles ubean and the inline stub plugin can intercept the virtual import; (2) the inline stub plugin provides an empty registry (SSR renders islands server-side, no client hydration needed). Also added `UBEAN_KEEP_SSR=1` env var to skip SSG cleanup for debugging.
**Alternatives:** `resolve.alias` mapping (didn't work — Vite's SSR externalizer ran before alias resolution for `noExternal` packages); keeping ubean external and patching `ubean/runtime/vue` to conditionally import (invasive, couples build-time concerns to runtime code). Fix is in [`packages/build/src/production.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/ubean/packages/build/src/production.ts) SSR build section.

## 4. Architecture Overview

```
                    ┌─────────────────────────────────────────────┐
                    │  apps/docs/                                  │
                    │                                              │
   markdown ──────► │  src/content/{en,zh}/   (.md pages)          │
   (moved)          │  src/pages/             (vue routes + 404)  │
                    │  src/layouts/           (default/home/blank)│
                    │  src/components/        (shell + ApiTable)  │
                    │  src/composables/       (outline/search)    │
                    │  src/constants/menus.ts  (sidebar IA)       │
                    │  uno.config.ts          (shadcn preset)      │
                    │  ubean.config.ts        (ssg + ui + i18n)   │
                    └──────────────┬──────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
   prerender builds        TypeDoc pre-build       search index
   static HTML            emits public/api/*.json  public/search-index.json
              │                    │                    │
              └────────────────────►│◄───────────────────┘
                                    ▼
                          deployed static site
```

**Pipelines:**
1. **Content** — `.md` files in `src/content/{en,zh}/` are ubean pages (via `@ubean/markdown` Vite plugin), each with frontmatter (`title`, `description`, `status`, `since`) → `definePage` head + SEO.
2. **API reference** — `pnpm build:api` (TypeDoc over `packages/*/dist/*.d.ts` for the curated 7) → `public/api/<pkg>.json`. A `[...slug].vue` route under `/reference/api/` renders `<ApiTable>` from the JSON.
3. **Search** — prerender hook walks content + API JSON → fuse index → `public/search-index.json`.
4. **i18n** — ubean i18n (`prefix_except_default`, EN default). Content trees `src/content/en/` and `src/content/zh/` map to `/...` and `/zh/...`.

## 5. Directory & Route Structure

```
apps/docs/
├── ubean.config.ts            # mode: 'ssg', ui: { css: false }, i18n, prerender
├── uno.config.ts              # @soybeanjs/unocss-shadcn preset
├── package.json               # scripts: dev/build/preview/build:api/build:search
├── tsconfig.json
├── DESIGN.md                  # this file
├── GLOSSARY.md
├── public/
│   ├── api/                   # ← generated by build:api (TypeDoc JSON)
│   │   ├── ubean.json
│   │   ├── runtime.json
│   │   ├── routing.json
│   │   ├── config.json
│   │   ├── auth.json
│   │   ├── ui.json
│   │   └── pinia.json
│   ├── search-index.json      # ← generated by prerender
│   └── favicon.svg
└── src/
    ├── content/               # ← moved from skills/ubean/docs + repo docs/
    │   ├── en/
    │   │   ├── guide/         # quickstart, app-modes, routing-modes, pages-routing/*, i18n, islands
    │   │   ├── integrations/  # auth, database, electron, icons, pinia, ui
    │   │   ├── architecture/  # overview, routing, runtime, engineering, roadmap, ecosystem,
    │   │   │                   #   framework-comparison, subpackage-splitting, modes,
    │   │   │                   #   islands-auto-registry, ubean-studio (with status badges)
    │   │   └── reference/      # API reference landing pages (per package)
    │   └── zh/                 # mirror of en/
    ├── pages/
    │   ├── index.vue          # home (hero + features + comparison + ecosystem)
    │   ├── [...slug].vue       # renders content/{locale}/*.md by route, or ApiTable for /reference/api/*
    │   ├── 404.vue
    │   └── loading.vue
    ├── layouts/
    │   ├── default.vue        # header + sidebar + outline + content
    │   ├── home.vue          # header + content (no sidebar)
    │   └── blank.vue
    ├── components/
    │   ├── app-header.vue    # logo + search + nav + toolbar
    │   ├── app-logo.vue
    │   ├── sider-menu.vue    # renders constants/menus.ts IA
    │   ├── search-document.vue # fuse client-side search
    │   ├── code-block.vue    # shiki explicit samples
    │   ├── copy-button.vue
    │   ├── tool-bar.vue      # theme + locale togglers
    │   ├── header-nav.vue    # top-level nav
    │   ├── top-bar.vue       # context bar (breadcrumb)
    │   ├── api-table.vue     # ← NEW: renders TypeDoc JSON
    │   ├── status-badge.vue  # ← NEW: ✅/⬜ for architecture docs
    │   └── doc-md.vue        # markdown render wrapper (sets outline)
    ├── composables/
    │   ├── use-doc-outline.ts
    │   ├── use-search.ts     # fuse index loader + query
    │   └── use-api-i18n.ts   # api labels i18n
    └── constants/
        └── menus.ts          # sidebar IA (5 sections)
```

**Route map (EN default, zh-CN prefixed):**

| Route (EN)                         | Source                                   |
| ---------------------------------- | ---------------------------------------- |
| `/`                                | `pages/index.vue`                        |
| `/guide/quickstart`                | `content/en/guide/quickstart.md`         |
| `/guide/app-modes`                 | `content/en/guide/app-modes.md`          |
| `/guide/routing-modes`             | `content/en/guide/routing-modes.md`      |
| `/guide/pages-routing/overview`    | `content/en/guide/pages-routing/overview.md` |
| `/guide/pages-routing/loaders`    | `content/en/guide/pages-routing/loaders.md` |
| `/guide/pages-routing/actions`    | `content/en/guide/pages-routing/actions.md` |
| `/guide/i18n`                      | `content/en/guide/i18n.md`               |
| `/guide/islands`                   | `content/en/guide/islands.md`            |
| `/integrations/{auth,database,electron,icons,pinia,ui}` | `content/en/integrations/*.md` |
| `/reference/api/ubean`             | `public/api/ubean.json` via `<ApiTable>` |
| `/reference/api/{runtime,routing,config,auth,ui,pinia}` | `public/api/<pkg>.json` |
| `/architecture/{overview,routing,runtime,engineering,roadmap,ecosystem,framework-comparison,subpackage-splitting,modes,islands-auto-registry,ubean-studio}` | `content/en/architecture/*.md` |
| `/zh/...`                          | mirror of the above from `content/zh/`  |
| `/:pathMatch(.*)*`                 | `pages/404.vue`                          |

## 6. Sidebar IA (5 sections)

Defined in `src/constants/menus.ts`:

1. **Getting Started** — Introduction, Quick Start, App Modes, Routing Modes
2. **Guide** — Pages Routing (Overview, Loaders, Actions), i18n, Islands
3. **Integrations** — Auth, Database, Electron, Icons, Pinia, UI
4. **Reference** — the 7 generated API packages (ubean, runtime, routing, config, auth, ui, pinia)
5. **Architecture** — Overview, Routing, Runtime, Engineering, Roadmap, Ecosystem, Framework Comparison, Subpackage Splitting, Modes, Islands Auto-Registry, ubean-studio (each with status badge)

## 7. Risks & Mitigations

| Risk                                         | Mitigation                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| TypeDoc JSON shape is verbose / unstable     | Pin TypeDoc version; write a thin mapper to a small ubean-specific JSON schema.          |
| Two-way translation is a large content task  | v1 ships EN complete + zh-CN for high-traffic pages (guide + home); rest translated progressively. |
| Moving content breaks `skills/ubean/SKILL.md` links | Update `SKILL.md` + `AGENT_PROMPT.md` references in the same PR as the move.        |
| shiki adds bundle weight                     | Use `shiki/bundle/web` + only the 2 themes; lazy-load the SearchDocument if needed.    |
| Prerender of `/zh/*` doubles build time      | Acceptable for v1; can parallelize later.                                              |
| Comparison table goes stale                  | Add a "last verified" note + a CI check that the table file was touched in the last N releases. |

## 8. Open Questions / Future Work

- **Version switching (phase 2):** `/v{n}/` prefix + per-version content trees, or frontmatter `since`/`deprecated` filtering. Architecture in §5 keeps the content tree shape compatible with either.
- **Live code playground:** a `<Playground>` island for runnable ubean examples. Depends on `@ubean/islands` + a sandboxed runner; out of scope for v1.
- **API reference for remaining 32 packages:** incremental, as each package stabilizes.
- **Dev-time TypeDoc watcher:** rerun `build:api` on `packages/*/dist/*.d.ts` change for smoother DX.
- **Search relevance tuning:** fuse.js weights (title > heading > body) need empirical tuning after content lands.
