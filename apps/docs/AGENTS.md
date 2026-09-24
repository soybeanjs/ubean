# apps/docs — @ubean/docs

The **user-facing** ubean documentation site. Not published. Distinct from the repo's
top-level `docs/` directory (maintainer docs) — do not move content between them.

## STACK

- **SSG on ubean itself, not VitePress.** `ubean.config.ts` sets `mode: 'ssg'`. The site
  dogfoods the framework, so a framework regression shows up here first.
- **Styling is `@vean/ui` in UnoCSS mode.** `ui: { css: false }` — no `styles.css`
  injection; everything comes from `presetUi` in `uno.config.ts`.
- **`colorMode: false` deliberately.** `@vean/theme`'s `createThemeInitScript` owns
  first-paint theme application (see `src/app.ts`). Leaving the built-in color mode on
  would create a second, conflicting source of truth. Do not add a custom no-flash script.
- **`src/app.vue` (lowercase) is required.** It wraps the layout chain in
  `SConfigProvider`; without it every `S*` component throws
  `ThemeConsumer must be used within UiThemeContext` during SSR and **all prerendering
  fails silently** (0 routes, build still "succeeds"). Note macOS is case-insensitive —
  `App.vue` and `app.vue` are the same file, so don't try to keep both.
- **i18n**: `prefix_except_default`, default `en`, so zh lives under `/zh`. Message
  catalogs are `src/locales/{en,zh}.json`. A `|` inside a message is vue-i18n's plural
  separator — escape literal pipes as `{'|'}` (see `home.features.islands.desc`).
- **Writing or translating content? Read [TRANSLATION.md](./TRANSLATION.md) first.** It is
  the terminology table plus the link rules. The load-bearing rule: internal links in
  content use `<Link to="/path">` (no `/zh` prefix, no bare markdown link) so the framework
  localizes them — `prefix_except_default` yields `/guide/x` for en and `/zh/guide/x` for zh.

## CONTENT → ROUTE MAPPING

`src/shared/content-route.ts` is the single slug→route function, shared by the prerender
collector (`build/docs-routes.ts`), the sitemap writer (`build/seo.ts`), the LLM export
(`build/llms.ts`) and client search. A wrong slug therefore breaks all four at once.

The content tree is section-first, so the mapping is nearly 1:1:

| Content path (relative to `src/content/<locale>/`) | Public route          |
| -------------------------------------------------- | --------------------- |
| `guide/quickstart.md`                              | `/guide/quickstart`   |
| `guide/pages-routing/loaders.md`                   | `/guide/pages-routing/loaders` |
| any trailing `index`                               | collapses to its directory root |

**The `/zh` mirrors are not listed.** Under `prefix_except_default` the SSG renderer's
`expandRoutes` generates them from the collected routes; only zh-only pages are listed
explicitly. `build/docs-routes.ts` handles this — don't hand-write route lists.

## API REFERENCE PIPELINE

`src/generated/api/<pkg>.json` is the TypeDoc output. **Its location is load-bearing**:
it lives under `src/` (not `public/`) because `<ApiTable>` imports it through
`import.meta.glob`.

Two failures follow from serving it over HTTP instead, and both were real:

1. **The request never reaches the file.** ubean's static middleware skips `/api/*`
   (`packages/server/src/static.ts`) to leave that prefix for `src/routes/` handlers.
   This site has no API routes, so `/api/<pkg>.json` fell through to the 404 fallback
   and returned HTML — the browser then threw `Unexpected token '<', "<!doctype "…`.
   Any path without the `/api/` prefix serves normally; that prefix, and only that
   prefix, is intercepted.
2. **Prerender captured the loading state.** `onMounted` runs only in the browser, so
   the SSG output was `<p>Loading…</p>` and nothing else — no content for a crawler.

Importing the JSON fixes both at once. Don't reintroduce a fetch here.

`src/shared/api-packages.ts` is **the** curated package list. It feeds three consumers
that previously disagreed with each other, which produced four 404 sidebar links and four
pages prerendered with no data behind them:

1. `scripts/build-api.ts` — which `src/generated/api/<slug>.json` files get generated
2. `build/docs-routes.ts` — which API routes are prerendered
3. `src/constants/menus.ts` — which API links the sidebar renders

Adding a package is a one-line change there. The script clears stale `*.json` from
`src/generated/api/` first, so removing a package cannot leave month-old data served.

**TypeDoc runs on a real TypeScript, via an aliased dependency + loader.** It drives the
compiler API directly (`declaration.type.getChildAt`), which the workspace's forced
`typescript-native-bridge` (tsgo) does not fully implement — TypeDoc exits 6 and every
package but `scan`/`auth` rendered as "stub data".

The obstacle is that the root `pnpm-workspace.yaml` sets
`overrides.typescript: 'catalog:'`, which rewrites **every** `typescript` specifier in the
graph. That override is load-bearing: drop it and the graph holds two TypeScript instances,
vue-router's types resolve from both, and `packages/client` fails with
`RouteLocationNormalizedLoadedGeneric is not assignable to …`. So it cannot be relaxed.

These do **not** work — don't retry them: `overrides['typedoc>typescript']` in any spelling
(`@0.28.20>`, `>typedoc>`, npm alias), `packageExtensions.typedoc.{dependencies,peer}`,
declaring a real version in `apps/docs`, or patching TypeDoc to skip `getChildAt` (the error
just moves to the next compiler API).

What works: `typescript-real: npm:typescript@5.9.3` in `apps/docs` — the alias name isn't
`typescript`, so the override leaves it alone — plus a Node loader
(`scripts/typedoc-typescript-loader.mjs`, registered by `typedoc-register.mjs`) that points
TypeDoc's bare `import ts from "typescript"` at it. The graph still holds exactly one
`typescript`, so every package keeps typechecking on tsgo; only `build:api` sees the real
compiler. Do not "simplify" this back to `npx typedoc`.

## RENDERING RULES

- **Sidebar labels are i18n keys, not display text.** `src/constants/menus.ts` holds
  routes; the label for each is resolved from `sidebar_items.<key>`, where `<key>` is the
  route path with `/`→`_` and `-`→`_` (`sidebarItemKey()`, e.g.
  `/guide/pages-routing/loaders` → `guide_pages_routing_loaders`). Sub-groups use
  `sidebar_groups.<slug(label)>`. Keep the derivation purely mechanical: an earlier
  version special-cased a trailing `overview`, which produced `architecture` where the
  catalogue said `architecture_overview`, and the sidebar silently fell back to English
  for those entries. Add a route ⇒ add its key to **both** `src/locales/{en,zh}.json`.
- **`doc-md.vue` renders the untranslated notice itself.** The page's render happens before
  a child's `onServerPrefetch` resolves, so a parent-owned `v-if` never reaches the
  prerendered HTML. Anything that must appear in the static output has to be owned by the
  component doing the async load.
- **Content fallback is per-page, not per-file.** A zh page that exists but carries
  `status: translated-stub` in frontmatter has no usable body, so the English one is shown
  with a notice. Mere file existence is not enough to decide a translation is real.
- **Fence highlighting is wired through `markdownExit.highlight`** (`build/highlight.ts`).
  `markdown.theme` only tells the CSS which theme pair to expect — it does not install a
  highlighter, so without the hook fences render as plain `<pre><code>`.
- **Do not wrap prerendered content in `<ClientOnly>`.** ubean's `ClientOnly` renders a
  comment on the server by design, so it silently removes content from the static HTML.
- **Internal content links use `<Link to="/path">`, never a bare markdown link.** A bare
  `[text](/path)` compiles to a plain `<a>`, which ubean does **not** localize, so a zh page
  sends readers to the English page. `<Link>` goes through `LOCALIZE_PATH_KEY` and yields
  `/guide/x` for en and `/zh/guide/x` for zh. `localizePath` strips an existing prefix
  before re-applying the current locale, so the result is idempotent — still write
  prefixless paths and let the framework decide. See [TRANSLATION.md](./TRANSLATION.md).

## LOCALIZATION

`src/content/en/**` is the source of truth; `src/content/zh/**` must mirror it (same files,
same section order, same fenced blocks). [TRANSLATION.md](./TRANSLATION.md) holds the
terminology table and the per-page checklist — read it before writing either locale.

- **`status: translated-stub` is a render-time signal, not decoration.** `doc-md.vue`
  reads frontmatter via a `?raw` glob and treats a stubbed page as *absent content*, so the
  English body shows with a notice instead of the placeholder. Deleting a stub's marker
  without supplying a real translation silently downgrades the page to the placeholder text.
- **Content is per-page, not per-file**: a locale can exist on disk and still be a stub.
- **`build/llms.ts` writes `/zh/…/<route>.md` mirrors** in addition to the English ones,
  and skips stubbed zh pages so no LLM export contains a "not translated" notice.
  `createLlmsOutput` reads both content directories; it previously read only `en`, so the
  site shipped English-only `.md` mirrors while the HTML had both locales.
- **English files must not contain Chinese**, including code comments (the reverse is fine
  and expected — zh code comments are translated per TRANSLATION.md §3).

## BUILD

```
pnpm build        # build:api → ubean build → build:seo
pnpm dev          # ubean dev
pnpm typecheck    # vue-tsc
```

`build:seo` and the `docsLlmsPlugin` in `vite.config.ts` write `sitemap.xml`, `robots.txt`,
`llms.txt`, `llms-full.txt` and per-route `<route>.md` into `dist/public` **after**
`ubean build`: ubean registers sitemap/robots as runtime routes but excludes them from
prerender output, so an SSG deploy would 404 them without this step. `DOCS_SITE_URL` sets
the hostname.

The docs build runs in CI (`.github/workflows/ci.yml`), which is what catches prerender
failures — a build that prerenders 0 routes still exits 0.
