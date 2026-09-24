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

`src/shared/api-packages.ts` is **the** curated package list. It feeds three consumers
that previously disagreed with each other, which produced four 404 sidebar links and four
pages prerendered with no data behind them:

1. `scripts/build-api.ts` — which `public/api/<slug>.json` files get generated
2. `build/docs-routes.ts` — which API routes are prerendered
3. `src/constants/menus.ts` — which API links the sidebar renders

Adding a package is a one-line change there. The script clears stale `*.json` from
`public/api/` first, so removing a package cannot leave month-old data served.

**TypeDoc is currently broken for 5 of 7 packages.** The root `pnpm-workspace.yaml` forces
`typescript: npm:typescript-native-bridge` (tsgo) workspace-wide, and TypeDoc drives the
TypeScript compiler API directly (`getChildAt`) — which the native bridge does not
implement. TypeDoc exits 6 and the script emits a stub, so those pages render "no entries"
rather than failing the build. Only `scan` and `auth` currently generate real data. Fixing
this requires giving TypeDoc a real TypeScript, which the root override prevents; that is a
repo-level decision, not an app-level one.

## RENDERING RULES

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
