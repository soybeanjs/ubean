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
- **Translation of every architecture doc.** Full bidirectional translation of the Architecture section is a content task, not an architecture one. (Per ADR-0007, dev-task docs live in repo `docs/`, outside the public site.)

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
**Decision:** v1 generates API JSON for: `ubean` (aggregator), `@ubean/runtime`, `@ubean/scan`, `@ubean/config`, `@ubean/auth`, `@ubean/ui`, `@ubean/pinia`.
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

> ⚠️ **Reversed by [ADR-0007](../../docs/adr/0007-docs-content-classification.md):** dev-task docs (roadmap, ubean-studio, framework-comparison, modes, subpackage-splitting, islands-auto-registry) moved back to repo `docs/`; the site's Architecture section now holds only explanatory content. `status-badge.vue` was removed.

### D14. Home page — hero + features + comparison + ecosystem
**Decision:** Hero (name, tagline, primary CTAs: Get Started / GitHub), 3–6 feature cards (Full-stack SSR, File-based routing, Islands, Multi-platform, DevTools, i18n), a framework comparison table (rendered from `framework-comparison.md`), and an ecosystem/package grid.
**Rationale:** Richer first impression for a framework; the comparison table is high-value content that already exists. Accepts the maintenance tradeoff (comparison may need updates).
**Alternatives:** hero + features + quickstart only (faster but underwhelming); minimal hero (too thin for a framework).

> **Updated:** the framework-comparison block was removed from the home page during the ADR-0007 restructure; `framework-comparison.md` now lives in repo `docs/`.

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
**Alternatives:** `resolve.alias` mapping (didn't work — Vite's SSR externalizer ran before alias resolution for `noExternal` packages); keeping ubean external and patching `ubean/runtime/vue` to conditionally import (invasive, couples build-time concerns to runtime code). Fix is in [`packages/builder/src/production.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/ubean/packages/builder/src/production.ts) SSR build section.

## 3B. Style Refactor Decision Log (Round 2)

> Sub-session: full style parity with [`soybean-ui/apps/docs`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs).
> Triggered by reported dark-mode anomalies, markdown formatting chaos, and divergent responsive/interaction states.
> Each entry: **Decision → Rationale → Alternatives considered**.

### D19. Dark-mode fix — `presetWind3({ dark: 'class' })` + `SConfigProvider` wrap
**Decision:** Update `uno.config.ts` to include `presetWind3({ dark: 'class' })` (placed before `presetSoybean()`, matching the reference's preset order) and `presetAnimations()`. Wrap the app root in `SConfigProvider` from `@soybeanjs/ui` (in a new `src/App.vue`).
**Rationale:** Without `presetWind3({ dark: 'class' })`, UnoCSS `dark:` variants use the default `media` strategy (system-driven), not the explicit `.dark` class on `<html>` that `@soybeanjs/unocss-shadcn` tokens assume. This is the root cause of "dark mode anomalies": shadcn `bg-background`/`text-foreground` resolve correctly but `dark:`-prefixed utilities did not flip in lockstep with the runtime class. `SConfigProvider` is the supported `@soybeanjs/ui` integration point for component theming context (SToast/SDialog positioning, locale, etc.).
**Alternatives:** `presetWind3` only (works for utilities but `@soybeanjs/ui` components lack theming context — toast/dialog mis-themed); `SConfigProvider` only (utilities still on `media` strategy, out of sync with `<html>.dark`).
**Verified against:** [`soybean-ui/apps/docs/uno.config.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/uno.config.ts#L14-L23) and [`soybean-ui/apps/docs/src/App.vue`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/App.vue#L1-L11).

### D20. Color-mode bootstrap — inline no-flash script + `SConfigProvider`, drop ubean `colorMode`
**Decision:** Remove the `colorMode` block from `ubean.config.ts`. Add a small inline script to `index.html` that reads `localStorage.ubean_color_mode` (falling back to `prefers-color-scheme`) and sets the `.dark` class on `<html>` *before* Vue mounts. `SConfigProvider` reads the same class at runtime for theming context; `tool-bar.vue` continues to use `useColorMode()` from `ubean/runtime/vue` for the toggle UI (it writes the same localStorage key + class).
**Rationale:** Single source of truth = the `.dark` class on `<html>`. The ubean `colorMode` runtime and the inline script both target this class; keeping both creates two writers and a hidden coupling. SSG-prerendered HTML is the same for both light and dark visitors, so the no-flash inline script is *required* — `SConfigProvider` runs only at Vue mount, which is too late for any first paint on a static page. The inline script is the proven pattern (vite-ssg, Nuxt color-mode, next-themes all do this).
**Alternatives:** keep ubean `colorMode` for bootstrap only + `SConfigProvider` for runtime (two systems writing the same class — works but coupling is implicit); accept flash-of-wrong-theme (unacceptable UX for a framework docs site).
**Verified against:** [`soybean-ui/apps/docs/src/main.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/main.ts#L1-L22) (no `colorMode` config in vite-ssg; the `<html>.dark` class is set by an inline script + `SConfigProvider`).

### D21. Markdown styling — port `markdown.css` + `global.css` + `frosted.css` + Manrope; rename wrapper to `markdown-wrapper`
**Decision:** Create three stylesheets under `src/styles/`:
1. `markdown.css` — verbatim port of the reference's 179-line prose stylesheet (headings, lists, code, blockquote, table, details, `.md-code-block`, `.code-btn`, `.code-btn-outline`).
2. `global.css` — verbatim port defining all `--docs-*` CSS variables (light + dark variants), `--scrollbar-*`, `--docs-font-sans`, shiki token overrides, and `@import` of `markdown.css` + `frosted.css`.
3. `frosted.css` — verbatim port of the `.docs-header-shell[data-scrolled]` / `.docs-topbar-shell[data-scrolled]` glass effect.
Add `@fontsource-variable/manrope` to `package.json` and import it in `app.ts` before `uno.css`. Import `./styles/global.css` in `app.ts` after `uno.css`. Rename the markdown wrapper class from `.markdown-body` to `.markdown-wrapper` everywhere (`[...slug].vue`, `vite.config.ts` markdown plugin `wrapperClass`, `doc-md.vue`).
**Rationale:** The current project has *zero* markdown typography CSS — the prose renders as unstyled browser defaults, which is the root cause of "markdown page format chaos". The reference's stylesheet is mature, dark-mode-aware (uses `--docs-*` variables that swap with `.dark`), and uses UnoCSS `--uno:` directives (which `transformerDirectives` already enables). The `--docs-*` variables are tightly coupled to `markdown.css` (it references 12 of them) and must ship together. Manrope is referenced first in the current `uno.config.ts` `fontFamily.sans` but never imported, so system-ui silently substitutes — porting the font closes that divergence.
**Alternatives:** port + retarget to `.markdown-body` (find/replace drift risk, diverges from upstream); write fresh CSS for `.markdown-body` (re-invents mature upstream work, drift risk); skip `frosted.css` (header scroll-state visual diverges); skip Manrope (typography diverges from reference).
**Verified against:** [`soybean-ui/apps/docs/src/styles/markdown.css`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/styles/markdown.css), [`soybean-ui/apps/docs/src/styles/global.css`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/styles/global.css), [`soybean-ui/apps/docs/src/styles/frosted.css`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/styles/frosted.css), [`soybean-ui/apps/docs/src/main.ts`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/main.ts#L4-L6).

### D22. `doc-md.vue` — port the reference's `<article>` wrapper verbatim
**Decision:** Port the reference's `doc-md.vue` template verbatim: outer `<div ref="contentRef" class="min-w-0">` → `<article class="relative min-w-0 border border-border/50 dark:border-border rounded-xl overflow-hidden">` with `aria-hidden` gradient header (`from-primary/8 via-warning/6 to-info/8`) → inner `<div class="relative min-w-0 px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10">` → `<component :is="cp" />`. Adapt the script to keep the current project's markdown loading mechanism (`defineProps<{ component: any }>()` passthrough from `[...slug].vue`), since the reference's `import.meta.glob` + `path` prop logic is tied to its `src/docs` content layout.
**Rationale:** The current `doc-md.vue` is a 1-line passthrough that renders raw markdown with no card framing — visually inconsistent with the reference's framed article and its decorative gradient header. Full port closes the gap. The script logic (glob, locale, outline) differs between the two projects (ubean resolves markdown at the route level, the reference resolves it inside `doc-md.vue`); only the *template* is portable verbatim.
**Alternatives:** article + border + padding, no gradient header (loses visual flourish that distinguishes the reference's docs); keep passthrough, rely on markdown.css alone (loses the article card framing that the reference uses to visually contain prose).
**Verified against:** [`soybean-ui/apps/docs/src/components/doc-md.vue`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/components/doc-md.vue#L174-L192).

### D23. Tool-bar — single-file, style-align only (no split, no `ThemeConfigurator`)
**Decision:** Keep `tool-bar.vue` as a single inline component (current structure). Align its visual states (hover/active/disabled/focus) and dark-mode color tokens with the reference's `theme-schema-toggler.vue` + `locale-toggler.vue` patterns. Skip the `ThemeConfigurator` (palette editor from `@playground/components/theme-configurator.vue`) entirely — it is component-library-specific (per D8).
**Rationale:** The reference splits tool-bar into three sub-components because its `ThemeConfigurator` is a complex palette editor with no framework-docs equivalent. Splitting the current single-file tool-bar into separate `theme-schema-toggler.vue` + `locale-toggler.vue` files would be churn for parity's sake without functional gain. Style alignment (button states, color tokens, dark-mode handling) is the actual gap.
**Alternatives:** split into separate toggglers (closer to reference file structure, but D8 already excludes the configurator that justifies the split); full port including `ThemeConfigurator` (dead code, no palette data to edit).
**Verified against:** [`soybean-ui/apps/docs/src/components/tool-bar.vue`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/components/tool-bar.vue#L1-L40).

### D24. D8 reaffirmation — "exactly the same" applies to the SHELL only; markdown prose styling IS in scope
**Decision:** D8 stands unchanged: port the reference's structural shell, skip the reference's component-library-specific components (playground, type-table, component-api, changelog, tailwind-palette). The user's "视觉/交互/布局完全一致" requirement is interpreted as applying to the *ported shell* (header, sidebar, toolbar, outline, search, codeblock, markdown prose, doc-md card framing). This sub-session explicitly clarifies that markdown prose styling (markdown.css + global.css + frosted.css, per D21) and the doc-md article wrapper (per D22) ARE shell concerns, not component-library-specific.
**Rationale:** D8 originally listed "doc-md.vue" as a ported shell component but did not explicitly enumerate the prose stylesheet as in scope. The reported "markdown formatting chaos" makes that enumeration necessary. The clarification closes the ambiguity without re-opening D8.
**Alternatives:** amend D8 to port more (split tool-bar, port `ThemeConfigurator` — both rejected per D23); amend D8 to port everything including component-library specifics (dead code, no framework equivalent).
**Verified against:** original D8 above.

### D25. App root — create `src/App.vue` wrapping `RouterView` in `SConfigProvider`
**Decision:** Create `src/App.vue` whose template is `<SConfigProvider><RouterView /></SConfigProvider>` (no props — `provideThemeContext` from `@playground/theme` is a component-library-specific helper that we skip per D8). ubean's `defineApp` in `app.ts` continues to own head/meta/rootId. The ubean runtime picks up `src/App.vue` as the root component (verify against ubean runtime convention; if not, fall back to wiring `App` in `defineApp.root`).
**Rationale:** `SConfigProvider` must wrap the entire render tree so `@soybeanjs/ui` components (SToast, SDialog, SPopover) inherit theme context. Putting it in a layout (default.vue/home.vue/blank.vue) would re-mount the provider on layout transitions and lose toast/dialog state. The reference puts it at `App.vue` for the same reason. Skipping `provideThemeContext` keeps the surface minimal — `SConfigProvider` with no props still applies the theme tokens via the `.dark` class on `<html>` (set by the D20 inline script).
**Alternatives:** wrap in `default.vue` only (loses provider on home/blank routes, re-mounts on transitions); replicate `provideThemeContext` locally (couples to a playground-specific abstraction we don't need).
**Verified against:** [`soybean-ui/apps/docs/src/App.vue`](file:///Users/soybean/Web/Projects/SoybeanJS/soybean-ui/apps/docs/src/App.vue#L1-L11).

### D26. Verification matrix — manual cross-browser × 3 viewports × light/dark
**Decision:** After implementation, spin up `pnpm dev` and manually verify in Chrome, Safari, Firefox (latest stable on macOS). For each browser, test 2 color modes (light, dark) × 3 viewports (mobile 375px, tablet 768px, desktop 1280px) on 4 key routes: home `/`, a markdown doc `/guide/quickstart`, an API table `/reference/api/ubean`, the 404 `/__nonexistent__`. Document results as a checklist in the PR description; no committed test files.
**Rationale:** Cross-browser divergence is most likely on `backdrop-filter` (Safari prefix), `color-mix` (Safari 16.2+), and `scroll-snap` (Safari quirks) — all used by the ported stylesheets. Manual smoke at 3 viewports catches the responsive regressions the user reported. Playwright snapshot tests would add CI-runnable guarantees but also test-maintenance overhead disproportionate to a docs site with ~30 templates.
**Alternatives:** Playwright snapshot tests (CI-runnable but maintenance overhead, esp. for shiki token colors that flake on font rendering); Chrome-only manual smoke (fast but misses Safari/Firefox divergence on the exact CSS features we're porting).
**Verified against:** the user's original requirement ("多浏览器兼容性测试及不同屏幕尺寸的响应式测试").

### D27. Component-alignment scope — 4 components beyond the primary fixes
**Decision:** After the primary fixes (D19–D25) land and verify, additionally style-align 4 components: `app-header.vue` (border/scroll-state/responsive classes + new `frosted.css` integration with `docs-header-shell`/`docs-header-frame` shortcuts already present in `uno.config.ts`), `sider-menu.vue` (active-item/hover/disabled states + dark-mode border tokens), `code-block.vue` + `copy-button.vue` (shiki token colors + copy-button hover/active/copy-feedback states), `search-document.vue` (modal/trigger/results-item states + dark-mode tokens).
**Rationale:** These four components are the user-visible shell surfaces where dark-mode and interaction-state divergences are most noticeable after the primary fixes. Aligning them after the foundation lands avoids changing component styles against a moving CSS-variable baseline.
**Alternatives:** align all components (over-scope; shell-only per D8); align none and rely on the foundation fixes (works for color tokens but not for component-specific hover/active/disabled state classes).
**Verified against:** the user's original requirement ("统一导航栏、侧边栏、页脚等公共组件的样式" and "确保所有交互元素的状态样式...一致").

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
├── ubean.config.ts            # mode: 'ssg', ui: { css: false }, i18n, prerender (colorMode removed per D20)
├── uno.config.ts              # presetWind3 dark:class + presetAnimations + presetSoybean + presetShadcn (D19)
├── index.html                 # no-flash inline script sets .dark on <html> before Vue mount (D20)
├── package.json               # scripts: dev/build/preview/build:api/build:search; +@fontsource-variable/manrope (D21)
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
    ├── App.vue                # NEW (D25): wraps RouterView in SConfigProvider
    ├── app.ts                 # imports manrope + uno.css + styles/global.css (D21)
    ├── styles/                # NEW (D21): ported verbatim from soybean-ui/apps/docs/src/styles/
    │   ├── global.css         # --docs-* CSS vars (light + dark), scrollbar, shiki overrides
    │   ├── markdown.css       # .markdown-wrapper prose styles (headings/lists/code/table/blockquote/details)
    │   └── frosted.css        # docs-header-shell/docs-topbar-shell scrolled glass effect
    ├── content/               # ← moved from skills/ubean/docs + repo docs/
    │   ├── en/
    │   │   ├── guide/         # quickstart, app-modes, routing-modes, pages-routing/*, i18n, islands
    │   │   ├── integrations/  # auth, database, electron, icons, pinia, ui
    │   │   ├── architecture/  # overview, architecture, routing, runtime (explanatory only, per ADR-0007)
    │   │   ├── ecosystem/     # ecosystem
    │   │   ├── contributing/  # engineering
    │   │   └── reference/     # API reference landing pages + reference guides (cache/env/i18n/...)
    │   └── zh/                 # mirror of en/
    ├── pages/
    │   ├── index.vue          # home (hero + features + ecosystem)
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
    │   └── doc-md.vue        # markdown render wrapper (sets outline)
    ├── composables/
    │   ├── use-doc-outline.ts
    │   ├── use-search.ts     # fuse index loader + query
    │   └── use-api-i18n.ts   # api labels i18n
    └── constants/
        └── menus.ts          # sidebar IA (8 sections)
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
| `/architecture/{overview,architecture,routing,runtime}` | `content/en/architecture/*.md` |
| `/reference/{cache,database,env,i18n,response-helpers,route-helpers}` | `content/en/reference/*.md` |
| `/ecosystem/ecosystem`             | `content/en/ecosystem/ecosystem.md` |
| `/contributing/engineering`        | `content/en/contributing/engineering.md` |
| `/zh/...`                          | mirror of the above from `content/zh/`  |
| `/:pathMatch(.*)*`                 | `pages/404.vue`                          |

## 6. Sidebar IA (8 sections)

Defined in `src/constants/menus.ts`:

1. **Getting Started** — Introduction, Quick Start, App Modes, Routing Modes
2. **Guide** — Pages Routing (Overview, Loaders, Actions), i18n, Islands
3. **Integrations** — Auth, Database, Electron, Icons, Pinia, UI
4. **Reference** — the 7 generated API packages (ubean, runtime, routing, config, auth, ui, pinia)
5. **Reference Guides** — Cache, Database, Env, I18n, Response Helpers, Route Helpers
6. **Architecture** — Overview, Architecture, Routing, Runtime (explanatory only, per ADR-0007)
7. **Ecosystem** — Ecosystem
8. **Contributing** — Engineering

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
