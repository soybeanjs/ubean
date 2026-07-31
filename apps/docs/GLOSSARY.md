# Glossary — apps/docs

> Ubiquitous language for the ubean documentation site (`apps/docs`).
> Terms used consistently across DESIGN.md, code, and content.

## Content model

**Doc Page** — a single addressable documentation unit. Either a markdown file under `src/content/{locale}/` rendered as a ubean page, or a generated API reference page rendered from `public/api/<pkg>.json`. Has one route, one locale, one optional layout.

**Content Tree** — the per-locale directory tree (`src/content/en/`, `src/content/zh/`) mirroring the public route structure. The EN tree is the canonical source; the zh-CN tree is its translation. A page exists in both trees (even if zh-CN is a placeholder) so routing is symmetric.

**Doc Section** — a top-level grouping in the sidebar IA. Exactly five: *Getting Started*, *Guide*, *Integrations*, *Reference*, *Architecture*. Defined in `src/constants/menus.ts`.

**Sidebar IA** — the Information Architecture expressed as the sidebar menu: the 5 sections and their child page entries. Drives `SiderMenu` and the home page's section links.

**Status Badge** — a per-page marker on Architecture docs classifying the doc's lifecycle: `✅ Implemented` (current architecture fact), `📝 Historical` (implemented design record, kept for decisions), or `⬜ Proposal` (not yet implemented). Mirrors the classification in [`docs/README.md`](../../docs/README.md). Rendered by `<StatusBadge>`.

**Locale Variant** — the same Doc Page in a different language. EN and zh-CN are locale variants of each other. Switching locale preserves the route path (modulo the `/zh` prefix).

**Version Slice** *(future, not in v1)* — a versioned snapshot of the content tree served under `/v{n}/`. The v1 architecture keeps the content tree shape compatible with introducing version slices without rearchitecting.

## API reference pipeline

**API Reference Entry** — a single documented export (function / interface / type / const) extracted from a package's `.d.ts` by TypeDoc. Has a name, kind, signature, JSDoc summary, parameters/properties/returns.

**API Reference Page** — a route under `/reference/api/<pkg>/` that renders one package's API Reference Entries via the `<ApiTable>` component, reading `public/api/<pkg>.json`.

**Curated Subset** — the 7 packages v1 generates API reference for: `ubean`, `@ubean/runtime`, `@ubean/routing`, `@ubean/config`, `@ubean/auth`, `@ubean/ui`, `@ubean/pinia`. Other packages are added incrementally.

**`build:api`** — the pre-build script (`pnpm build:api`) that runs TypeDoc over the Curated Subset's built `dist/*.d.ts` and emits `public/api/<pkg>.json`. Must run before `ubean build` and (in dev) before first `ubean dev` after a package API change.

## Navigation & layout

**Outline** — the right-side table of contents for the current Doc Page, listing its H2/H3 headings. Sourced from `@ubean/markdown`'s `parseMarkdown().headings` (no runtime DOM scraping). Rendered by `SAnchor`. Only shown on pages with ≥2 headings and not on the home/landing routes.

**Shell** — the structural layout chrome ported from the reference: `AppHeader`, `SiderMenu`, `SearchDocument`, `ToolBar`, `Outline`, breadcrumb. Excludes the reference's component-library-specific components (playground, type-table, component-api, changelog, palette).

**`<ApiTable>`** — the NEW framework-specific component that renders API Reference Entries from TypeDoc JSON. Replaces the reference's `type-table.vue` / `component-api.vue` (which are tied to a component registry ubean doesn't have). Renders parameter/property tables via `@soybeanjs/ui`'s `STable` in its **data-driven form** (`:columns`/`:data`/`:row-key` + per-column slots), since `STable` does not export structural `STableHeader`/`STableBody`/`STableHead` subcomponents. See D15.

**`<CodeBlock>`** — the shiki-powered code renderer for explicit inline samples in Vue pages. Distinct from markdown fence highlighting (which goes through `@ubean/markdown`'s `highlighter` option), but shares the same shiki theme config (`one-light` / `one-dark-pro`, `defaultColor: false`).

## Search

**Search Index** — the `public/search-index.json` file produced at prerender time. Contains one entry per addressable doc unit (markdown pages + API reference pages) with `{ route, locale, title, section, headings[], bodyExcerpt }`. Consumed client-side by fuse.js.

**`<SearchDocument>`** — the client-side search component. Fetches the Search Index once on first open, builds a fuse.js instance in-memory, returns ranked route matches.

## Build & deploy

**Prerender** — the SSG step that renders every route to static HTML. Excludes `/api/**`, `/_**` (ubean defaults); includes all `/` + `/zh/**` + `/reference/api/**` content routes.

**`build:search`** — the prerender-time hook (or separate script) that walks content + API JSON and emits the Search Index. Runs after `build:api` and as part of (or just before) the prerender pass.

## i18n

**Default Locale** — EN. Served unprefixed (`/guide/...`).

**Prefixed Locale** — zh-CN. Served under `/zh/...`.

**Strategy** — `prefix_except_default` (ubean i18n). Detection order at runtime: URL path → `ubean_locale` cookie → `Accept-Language` → default (EN). A 302 redirect resolves mismatches.

**Locale Switch** — the act of changing the active locale. In routing strategy `prefix_except_default` this is performed by `switchLocalePath(next, currentPath)` + `router.push(target)`, which navigates to the localized URL (e.g. `/guide/x` ↔ `/zh/guide/x`). The route change drives `[...slug].vue` to re-resolve content from the target Content Tree. `useI18n().setLocale()` is **not** used for switching (it only mutates internal i18n state + cookie and does not navigate). See D17.

## What we deliberately did NOT port

**Playground** — the reference's interactive component editor (`playground-gallery.vue`). Component-library-specific; no framework equivalent in v1.

**Component Registry** — the `public/r/*.json` auto-generated component metadata in the reference. ubean has no component registry; its analog is the TypeDoc-generated `public/api/*.json` (API reference, not component demos).

**Changelog** — the reference's per-component changelog (`component-changelog.vue` + `generated/changelog/*.json`). v1 has no per-API changelog generator; the repo's top-level `CHANGELOG.md` is linked from the home page instead.

**ThemeConfigurator** — the reference's palette editor (`@playground/components/theme-configurator.vue`), invoked from `tool-bar.vue`. Component-library-specific (no palette data to edit for a framework); excluded by D8 + D23.

## Style refactor (Round 2 — see DESIGN.md §3B, D19–D27)

**Markdown Wrapper** — the outer `<div class="markdown-wrapper">` that wraps rendered markdown prose. (Renamed from `.markdown-body` per D21.) Owned by `@ubean/markdown`'s `wrapperClass` option (configured in `vite.config.ts`) for fence-rendered markdown, and by `<article>` inside `doc-md.vue` for the framed prose card. Styled by `src/styles/markdown.css`.

**`--docs-*` CSS variables** — a family of design tokens (chip-bg, panel-bg, panel-border, panel-radius, panel-shadow, panel-inset, panel-blur, surface-strong, shell-bg, shell-border, shell-blur, table-head-bg, table-row-border) defined in `src/styles/global.css` with light + `.dark` variants. Consumed by `markdown.css` (prose surfaces: code blocks, blockquotes, tables, details) and `frosted.css` (header scroll glass). Mirroring the reference's design-token system; renaming or removing any of them breaks the ported stylesheets.

**Frosted Shell** — the glass effect applied to `.docs-header-shell[data-scrolled='true'] .docs-header-frame` (and the topbar equivalent) when the page is scrolled. Defined in `src/styles/frosted.css`, depends on `--docs-shell-bg`, `--docs-shell-border`, `--docs-shell-blur` (defined in `global.css`). The `docs-header-shell` / `docs-header-frame` UnoCSS shortcuts (already in `uno.config.ts`) provide the structural frame; `frosted.css` adds the visual glass surface.

**No-flash Bootstrap** — the inline `<script>` in `index.html` that reads `localStorage.ubean_color_mode` (falling back to `prefers-color-scheme: dark`) and sets the `.dark` class on `<html>` *before* Vue mounts. Required for SSG-prerendered HTML to render with the correct theme on first paint; without it, dark-mode visitors see a light → dark flicker. Replaces the ubean `colorMode` runtime (removed per D20). `SConfigProvider` (in `App.vue`) reads the same `.dark` class at mount for `@soybeanjs/ui` component theming context; `useColorMode()` in `tool-bar.vue` writes the same localStorage key + class on user toggle.

**`<DocMd>` Article Card** — the framed prose container rendered by `doc-md.vue`: an `<article class="border border-border/50 dark:border-border rounded-xl overflow-hidden">` with an `aria-hidden` decorative gradient header (`from-primary/8 via-warning/6 to-info/8`) and inner padding (`px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10`). Ported verbatim from the reference per D22; distinct from the prose-typography `.markdown-wrapper` styling inside it.

**Style Parity Scope (D24)** — the set of shell surfaces that must visually match the reference: `AppHeader`, `SiderMenu`, `ToolBar`, `Outline` (`SAnchor`), `SearchDocument`, `CodeBlock` + `CopyButton`, `<DocMd>` article card, `.markdown-wrapper` prose. Component-library-specific surfaces (playground, type-table, component-api, changelog, tailwind-palette, theme-configurator) remain excluded per D8.
