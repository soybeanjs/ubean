# Changelog

## [main](https://github.com/soybeanjs/ubean/compare/v0.3.1...main) (2026-09-01)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **client**: await layout preload before first render so SSR HTML includes layouts &nbsp;-&nbsp; by @soybeanjs [<samp>(12066)</samp>](https://github.com/soybeanjs/ubean/commit/12066bb)
- **projects**: fix example route params &nbsp;-&nbsp; by @soybeanjs [<samp>(5f1ba)</samp>](https://github.com/soybeanjs/ubean/commit/5f1ba29)
- **routes**: convert vue-router regex params to Hono syntax so custom catch-all paths match &nbsp;-&nbsp; by @soybeanjs [<samp>(282f9)</samp>](https://github.com/soybeanjs/ubean/commit/282f94c)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [main](https://github.com/soybeanjs/ubean/compare/v0.3.0...main) (2026-09-01)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **builder**: fix double-joined srcDir and components.d.ts orphan entries &nbsp;-&nbsp; by @soybeanjs [<samp>(3bf32)</samp>](https://github.com/soybeanjs/ubean/commit/3bf3225)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**: update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(07e44)</samp>](https://github.com/soybeanjs/ubean/commit/07e4441)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [main](https://github.com/soybeanjs/ubean/compare/v0.2.2...main) (2026-08-23)

### &nbsp;&nbsp;&nbsp;🚀 Features

- land 2027 H1 server functions, select SSR, and analyze &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(a2679)</samp>](https://github.com/soybeanjs/ubean/commit/a267976)
- land production fs cache, studio contracts, content SSR snapshot, and gzip baseline &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(c6096)</samp>](https://github.com/soybeanjs/ubean/commit/c6096a0)
- wire SEO conventions, production IPX and crons, and gzip CI gate &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(a4fd9)</samp>](https://github.com/soybeanjs/ubean/commit/a4fd97a)
- add Bun/Deno/Netlify drivers, skip idle island rAF, and unbundle vite from icon &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(ddcbc)</samp>](https://github.com/soybeanjs/ubean/commit/ddcbccf)
- **app**:
  - mount CSRF, security headers, and data cache by default &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(6bbce)</samp>](https://github.com/soybeanjs/ubean/commit/6bbce46)
- **build-core**:
  - unify SSR singleton runtime policy &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(4e353)</samp>](https://github.com/soybeanjs/ubean/commit/4e353c0)
- **image**:
  - serve local files from /_ipx in development &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(0e2ea)</samp>](https://github.com/soybeanjs/ubean/commit/0e2ea7e)
- **routes**:
  - execute rewrite and proxy from routeRules &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(01f36)</samp>](https://github.com/soybeanjs/ubean/commit/01f3694)
  - treat ppr as a streaming alias &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(8161d)</samp>](https://github.com/soybeanjs/ubean/commit/8161dfe)
- **server**:
  - add filesystem and storage cache stores &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(67071)</samp>](https://github.com/soybeanjs/ubean/commit/67071f1)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- resolve remaining monorepo typecheck errors &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(f9025)</samp>](https://github.com/soybeanjs/ubean/commit/f9025e8)
- **devtools**:
  - drop the ubean peer that cycled with cli &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(dee77)</samp>](https://github.com/soybeanjs/ubean/commit/dee7706)
- **i18n**:
  - type CoreContext from the catalog factory instead of never &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(c11de)</samp>](https://github.com/soybeanjs/ubean/commit/c11dee4)
- **image**:
  - adapt IPX Response body to fetch BodyInit &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(0a041)</samp>](https://github.com/soybeanjs/ubean/commit/0a04182)
- **markdown**:
  - keep vite external in the DTS pack &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(4a24a)</samp>](https://github.com/soybeanjs/ubean/commit/4a24a9c)
- **server**:
  - cache handler responses that also set cookies &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(644fb)</samp>](https://github.com/soybeanjs/ubean/commit/644fb85)
  - treat entries as expired at expiresAt, not after &nbsp;-&nbsp; by @soybeanjs [<samp>(1bd4a)</samp>](https://github.com/soybeanjs/ubean/commit/1bd4a64)
- **ubean**:
  - keep a single HttpMethod export from scan &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(cbdbc)</samp>](https://github.com/soybeanjs/ubean/commit/cbdbce2)

### &nbsp;&nbsp;&nbsp;💅 Refactors

- **packages**:
  - refactor "@ubean/i18n" based on vue-i18n &nbsp;-&nbsp; by @soybeanjs [<samp>(bf4a3)</samp>](https://github.com/soybeanjs/ubean/commit/bf4a3e2)
  - merge hygiene packages into shared, config, and build &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(83a32)</samp>](https://github.com/soybeanjs/ubean/commit/83a3263)
  - fold ssr, actions, dev-server, and codegen into client, routes, cli, and build &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(91555)</samp>](https://github.com/soybeanjs/ubean/commit/9155538)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **projects**:
  - clear docs &nbsp;-&nbsp; by @soybeanjs [<samp>(08fab)</samp>](https://github.com/soybeanjs/ubean/commit/08fab08)
  - mark Q4 architecture debt complete &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(188ac)</samp>](https://github.com/soybeanjs/ubean/commit/188ac2f)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**:
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(92d6e)</samp>](https://github.com/soybeanjs/ubean/commit/92d6edf)
  - refresh catalog pins and release-age excludes &nbsp;-&nbsp; by @soybeanjs and @cursoragent [<samp>(4800e)</samp>](https://github.com/soybeanjs/ubean/commit/4800ec0)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;[![cursoragent](https://github.com/cursoragent.png?size=48)](https://github.com/cursoragent)&nbsp;&nbsp;

## [main](https://github.com/soybeanjs/ubean/compare/v0.2.1...main) (2026-08-21)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **projects**: update logo link and svg &nbsp;-&nbsp; by @soybeanjs [<samp>(b40b3)</samp>](https://github.com/soybeanjs/ubean/commit/b40b38d)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**: update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(8cd62)</samp>](https://github.com/soybeanjs/ubean/commit/8cd623b)
- **vite**: remove oxc-transform dependency and switch to vite built-in transform &nbsp;-&nbsp; by @soybeanjs [<samp>(ed30e)</samp>](https://github.com/soybeanjs/ubean/commit/ed30e30)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [main](https://github.com/soybeanjs/ubean/compare/v0.2.0...main) (2026-08-20)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **projects**: update CHANGELOG &nbsp;-&nbsp; by @soybeanjs [<samp>(5cafb)</samp>](https://github.com/soybeanjs/ubean/commit/5cafb9f)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**: update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(c5711)</samp>](https://github.com/soybeanjs/ubean/commit/c571121)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.2.0](https://github.com/soybeanjs/ubean/compare/v0.1.13...v0.2.0) (2026-08-20)

### &nbsp;&nbsp;&nbsp;🚀 Features

- implement P9-04 Partial Prerendering / Server Islands &nbsp;-&nbsp; by @soybeanjs [<samp>(1c083)</samp>](https://github.com/soybeanjs/ubean/commit/1c083b8)
- add AWS/Azure presets + CDN/edge cache (roadmap P2/P3 complete) &nbsp;-&nbsp; by @soybeanjs [<samp>(c0db0)</samp>](https://github.com/soybeanjs/ubean/commit/c0db028)
- **actions**:
  - implement Server Actions / Form Actions (P9-02) &nbsp;-&nbsp; by @soybeanjs [<samp>(c6ef5)</samp>](https://github.com/soybeanjs/ubean/commit/c6ef531)
- **ai**:
  - add @ubean/ai package with defineAgent + Vue runtime (thins over Vercel AI SDK) &nbsp;-&nbsp; by @soybeanjs [<samp>(e646d)</samp>](https://github.com/soybeanjs/ubean/commit/e646d80)
- **api-routes**:
  - per-route rendering rules + ISR (P9-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(c3961)</samp>](https://github.com/soybeanjs/ubean/commit/c396127)
  - add bot detection for streaming SSR metadata fallback [P1] &nbsp;-&nbsp; by @soybeanjs [<samp>(8b18d)</samp>](https://github.com/soybeanjs/ubean/commit/8b18d36)
- **app**:
  - add global hooks handle/handleFetch/handleError (P9-09) &nbsp;-&nbsp; by @soybeanjs [<samp>(c6cf9)</samp>](https://github.com/soybeanjs/ubean/commit/c6cf9b1)
- **apps**:
  - init apps docs &nbsp;-&nbsp; by @soybeanjs [<samp>(0e76d)</samp>](https://github.com/soybeanjs/ubean/commit/0e76dba)
- **content**:
  - add Live Content Collections (P9-19) &nbsp;-&nbsp; by @soybeanjs [<samp>(73d81)</samp>](https://github.com/soybeanjs/ubean/commit/73d8104)
- **docs**:
  - polish UI styles and finalize docs refactor &nbsp;-&nbsp; by @soybeanjs [<samp>(c7650)</samp>](https://github.com/soybeanjs/ubean/commit/c765026)
  - add architecture optimization tasks document &nbsp;-&nbsp; by @soybeanjs [<samp>(29de8)</samp>](https://github.com/soybeanjs/ubean/commit/29de810)
- **islands**:
  - refactor client directives to v-client.* Vue directive (P9-29) &nbsp;-&nbsp; by @soybeanjs [<samp>(ff598)</samp>](https://github.com/soybeanjs/ubean/commit/ff59864)
  - add .server.vue / .client.vue Server Components [P1.5] &nbsp;-&nbsp; by @soybeanjs [<samp>(bb8be)</samp>](https://github.com/soybeanjs/ubean/commit/bb8be57)
  - implement 9.3 paired components and 9.4 props re-render &nbsp;-&nbsp; by @soybeanjs [<samp>(53e33)</samp>](https://github.com/soybeanjs/ubean/commit/53e332d)
- **logger**:
  - add "@ubean/logger" use tslog and remove consola &nbsp;-&nbsp; by @soybeanjs [<samp>(01b35)</samp>](https://github.com/soybeanjs/ubean/commit/01b35fe)
- **markdown**:
  - add real MDX compilation (P9-20) &nbsp;-&nbsp; by @soybeanjs [<samp>(6284c)</samp>](https://github.com/soybeanjs/ubean/commit/6284c4d)
- **pages**:
  - add defer() streaming deferred data API [P0] &nbsp;-&nbsp; by @soybeanjs [<samp>(5e660)</samp>](https://github.com/soybeanjs/ubean/commit/5e66050)
- **prerender**:
  - extract SSG payload to __data.json + useData hydration [P0] &nbsp;-&nbsp; by @soybeanjs [<samp>(aa8ee)</samp>](https://github.com/soybeanjs/ubean/commit/aa8ee73)
- **preset**:
  - add Vercel/Netlify/Bun/Deno platform presets (P9-10) &nbsp;-&nbsp; by @soybeanjs [<samp>(7caa3)</samp>](https://github.com/soybeanjs/ubean/commit/7caa392)
- **routing**:
  - add parallel routes and intercepting routes (P9-18) &nbsp;-&nbsp; by @soybeanjs [<samp>(5d414)</samp>](https://github.com/soybeanjs/ubean/commit/5d41414)
  - add dynamic route matchers [P1] &nbsp;-&nbsp; by @soybeanjs [<samp>(8f5b5)</samp>](https://github.com/soybeanjs/ubean/commit/8f5b5e5)
- **runtime**:
  - add nested layouts support (P9-17) &nbsp;-&nbsp; by @soybeanjs [<samp>(17998)</samp>](https://github.com/soybeanjs/ubean/commit/1799806)
  - add color mode support (P9-21) &nbsp;-&nbsp; by @soybeanjs [<samp>(1a2d4)</samp>](https://github.com/soybeanjs/ubean/commit/1a2d495)
  - add Partytown integration and useScript composable (P9-22) &nbsp;-&nbsp; by @soybeanjs [<samp>(cad0c)</samp>](https://github.com/soybeanjs/ubean/commit/cad0caa)
  - add Pagefind full-text search integration (P9-26) &nbsp;-&nbsp; by @soybeanjs [<samp>(f33d6)</samp>](https://github.com/soybeanjs/ubean/commit/f33d66a)
- **seo**:
  - implement file convention SEO (P9-05) &nbsp;-&nbsp; by @soybeanjs [<samp>(6f3ec)</samp>](https://github.com/soybeanjs/ubean/commit/6f3ec64)
  - add JSON-LD / Schema.org structured data module (P9-07) &nbsp;-&nbsp; by @soybeanjs [<samp>(16c7b)</samp>](https://github.com/soybeanjs/ubean/commit/16c7bd5)
  - add OG Image dynamic generation module (P9-06) &nbsp;-&nbsp; by @soybeanjs [<samp>(42940)</samp>](https://github.com/soybeanjs/ubean/commit/42940d4)
  - add metadata dedupe and layered merge [P1] &nbsp;-&nbsp; by @soybeanjs [<samp>(d0f63)</samp>](https://github.com/soybeanjs/ubean/commit/d0f63ef)
- **server**:
  - add component-level cache directive (P9-08) &nbsp;-&nbsp; by @soybeanjs [<samp>(d34ea)</samp>](https://github.com/soybeanjs/ubean/commit/d34ea43)
  - add CSRF protection and security headers middleware (P9-12, P9-13) &nbsp;-&nbsp; by @soybeanjs [<samp>(87511)</samp>](https://github.com/soybeanjs/ubean/commit/8751143)
  - add Sessions API, after(), and fetch memoization (P9-11, P9-14, P9-15) &nbsp;-&nbsp; by @soybeanjs [<samp>(44a9a)</samp>](https://github.com/soybeanjs/ubean/commit/44a9ae3)
  - add single-flight, draft-mode, email, analytics, feature-flags (P9-16, P9-23, P9-25, P9-27, P9-28) &nbsp;-&nbsp; by @soybeanjs [<samp>(a06ca)</samp>](https://github.com/soybeanjs/ubean/commit/a06cadb)
  - add fetch Data Cache with revalidateTag/revalidatePath [P0] &nbsp;-&nbsp; by @soybeanjs [<samp>(f8676)</samp>](https://github.com/soybeanjs/ubean/commit/f8676df)
- **ssr**:
  - implement streaming SSR (P9-01) &nbsp;-&nbsp; by @soybeanjs [<samp>(afef0)</samp>](https://github.com/soybeanjs/ubean/commit/afef08c)
  - add streaming metadata support (P9-24) &nbsp;-&nbsp; by @soybeanjs [<samp>(fd08a)</samp>](https://github.com/soybeanjs/ubean/commit/fd08ad7)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **api-routes**:
  - normalize array layout for 404 page (P9-17 followup) &nbsp;-&nbsp; by @soybeanjs [<samp>(f0849)</samp>](https://github.com/soybeanjs/ubean/commit/f0849c8)
  - fix 3 failing ISR cache unit tests &nbsp;-&nbsp; by @soybeanjs [<samp>(aaa0a)</samp>](https://github.com/soybeanjs/ubean/commit/aaa0a98)
- **test**:
  - fix ubean-test test &nbsp;-&nbsp; by @soybeanjs [<samp>(38801)</samp>](https://github.com/soybeanjs/ubean/commit/3880177)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **docs**:
  - optimize docs apps style &nbsp;-&nbsp; by @soybeanjs [<samp>(d11ee)</samp>](https://github.com/soybeanjs/ubean/commit/d11ee13)
  - optimize docs locale &nbsp;-&nbsp; by @soybeanjs [<samp>(c41d7)</samp>](https://github.com/soybeanjs/ubean/commit/c41d774)
- **favicon**:
  - optimize favicon config &nbsp;-&nbsp; by @soybeanjs [<samp>(c3e2e)</samp>](https://github.com/soybeanjs/ubean/commit/c3e2e94)

### &nbsp;&nbsp;&nbsp;💅 Refactors

- complete architecture optimization tasks OPT-01~OPT-11 &nbsp;-&nbsp; by @soybeanjs [<samp>(c8383)</samp>](https://github.com/soybeanjs/ubean/commit/c8383b9)
- **ai**:
  - replace zod with valibot for tool schemas &nbsp;-&nbsp; by @soybeanjs [<samp>(db245)</samp>](https://github.com/soybeanjs/ubean/commit/db245a0)
- **api**:
  - rename clear cache api avoid conflict &nbsp;-&nbsp; by @soybeanjs [<samp>(fab12)</samp>](https://github.com/soybeanjs/ubean/commit/fab1229)
- **framework**:
  - migrate directives to function-call APIs &nbsp;-&nbsp; by @soybeanjs [<samp>(03eac)</samp>](https://github.com/soybeanjs/ubean/commit/03eac2f)
- **packages**:
  - rename "packages/build" to "packages/builder" &nbsp;-&nbsp; by @soybeanjs [<samp>(617f6)</samp>](https://github.com/soybeanjs/ubean/commit/617f63f)
  - refactor packages structure &nbsp;-&nbsp; by @soybeanjs [<samp>(360e8)</samp>](https://github.com/soybeanjs/ubean/commit/360e8f8)
- **ubean**:
  - rename clearDataCache in server &nbsp;-&nbsp; by @soybeanjs [<samp>(4b695)</samp>](https://github.com/soybeanjs/ubean/commit/4b695ce)
  - simplify `.reuse.ts` content &nbsp;-&nbsp; by @soybeanjs [<samp>(49c12)</samp>](https://github.com/soybeanjs/ubean/commit/49c12f5)
- **website**:
  - optimize docs &nbsp;-&nbsp; by @soybeanjs [<samp>(33c03)</samp>](https://github.com/soybeanjs/ubean/commit/33c030d)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- mark Phase 9 as complete in roadmap &nbsp;-&nbsp; by @soybeanjs [<samp>(aa986)</samp>](https://github.com/soybeanjs/ubean/commit/aa98688)
- mark OPT-07 as done — extension contract table implemented &nbsp;-&nbsp; by @soybeanjs [<samp>(0a5fc)</samp>](https://github.com/soybeanjs/ubean/commit/0a5fcc5)
- clean up completed task artifacts from docs/ &nbsp;-&nbsp; by @soybeanjs [<samp>(3c4e1)</samp>](https://github.com/soybeanjs/ubean/commit/3c4e167)
- **apps**:
  - update docs &nbsp;-&nbsp; by @soybeanjs [<samp>(dd3be)</samp>](https://github.com/soybeanjs/ubean/commit/dd3beed)
- **projects**:
  - add meta framework comparison and update roadmap &nbsp;-&nbsp; by @soybeanjs [<samp>(083f1)</samp>](https://github.com/soybeanjs/ubean/commit/083f1af)
  - add @ubean/ai package documentation and update monorepo stats &nbsp;-&nbsp; by @soybeanjs [<samp>(2582e)</samp>](https://github.com/soybeanjs/ubean/commit/2582e12)
  - update logo link in README &nbsp;-&nbsp; by @soybeanjs [<samp>(74be2)</samp>](https://github.com/soybeanjs/ubean/commit/74be2be)
  - update logo link &nbsp;-&nbsp; by @soybeanjs [<samp>(010ea)</samp>](https://github.com/soybeanjs/ubean/commit/010ea41)
- **roadmap**:
  - mark Task 1/2/3/6 as implemented in priority table &nbsp;-&nbsp; by @soybeanjs [<samp>(29ad8)</samp>](https://github.com/soybeanjs/ubean/commit/29ad8b9)
- **ubean**:
  - restructure docs site and align content with code &nbsp;-&nbsp; by @soybeanjs [<samp>(0bbcf)</samp>](https://github.com/soybeanjs/ubean/commit/0bbcfb5)
  - consolidate completed dev-task docs into the docs site &nbsp;-&nbsp; by @soybeanjs [<samp>(77be8)</samp>](https://github.com/soybeanjs/ubean/commit/77be86c)
  - update framework comparison table and nuxt server components support details &nbsp;-&nbsp; by @soybeanjs [<samp>(b2efa)</samp>](https://github.com/soybeanjs/ubean/commit/b2efa50)
  - align docs with refactored packages and drop legacy content &nbsp;-&nbsp; by @soybeanjs [<samp>(1042e)</samp>](https://github.com/soybeanjs/ubean/commit/1042ee0)
- **website**:
  - add i18n support and fix multiple site issues &nbsp;-&nbsp; by @soybeanjs [<samp>(f9782)</samp>](https://github.com/soybeanjs/ubean/commit/f9782c2)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**:
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(e6343)</samp>](https://github.com/soybeanjs/ubean/commit/e6343d9)
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(c792d)</samp>](https://github.com/soybeanjs/ubean/commit/c792d58)
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(08fee)</samp>](https://github.com/soybeanjs/ubean/commit/08fee62)
- **docs**:
  - bump docs package version to 0.1.13 &nbsp;-&nbsp; by @soybeanjs [<samp>(b1369)</samp>](https://github.com/soybeanjs/ubean/commit/b136925)
- **projects**:
  - remove prepare script in apps docs &nbsp;-&nbsp; by @soybeanjs [<samp>(9b13f)</samp>](https://github.com/soybeanjs/ubean/commit/9b13f9a)
  - update script &nbsp;-&nbsp; by @soybeanjs [<samp>(862f4)</samp>](https://github.com/soybeanjs/ubean/commit/862f447)
- **ubean**:
  - add clearDataCache export and resolve its import conflict &nbsp;-&nbsp; by @soybeanjs [<samp>(75b96)</samp>](https://github.com/soybeanjs/ubean/commit/75b968c)

### &nbsp;&nbsp;&nbsp;✅ Tests

- **projects**:
  - add e2e test &nbsp;-&nbsp; by @soybeanjs [<samp>(820e1)</samp>](https://github.com/soybeanjs/ubean/commit/820e1fb)
  - fix test &nbsp;-&nbsp; by @soybeanjs [<samp>(48167)</samp>](https://github.com/soybeanjs/ubean/commit/4816722)
- **server**:
  - add draft-mode HTTP integration tests + mark Task 5 done [P1] &nbsp;-&nbsp; by @soybeanjs [<samp>(e5e4b)</samp>](https://github.com/soybeanjs/ubean/commit/e5e4b36)

### &nbsp;&nbsp;&nbsp;🎨 Styles

- **projects**:
  - format code &nbsp;-&nbsp; by @soybeanjs [<samp>(c23cb)</samp>](https://github.com/soybeanjs/ubean/commit/c23cbdb)
  - fix lint error and format code &nbsp;-&nbsp; by @soybeanjs [<samp>(34ed3)</samp>](https://github.com/soybeanjs/ubean/commit/34ed308)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.13](https://github.com/soybeanjs/ubean/compare/v0.1.12...v0.1.13) (2026-07-30)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **ubean**: add 404/loading/error and add favicon support &nbsp;-&nbsp; by @soybeanjs [<samp>(eb060)</samp>](https://github.com/soybeanjs/ubean/commit/eb060d0)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **dev-server**: fix definePage data reload in dev server &nbsp;-&nbsp; by @soybeanjs [<samp>(aaeb8)</samp>](https://github.com/soybeanjs/ubean/commit/aaeb83c)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.12](https://github.com/soybeanjs/ubean/compare/v0.1.11...v0.1.12) (2026-07-30)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **routing**: add page cache and definePage head support &nbsp;-&nbsp; by @soybeanjs [<samp>(e4cda)</samp>](https://github.com/soybeanjs/ubean/commit/e4cda69)

### &nbsp;&nbsp;&nbsp;💅 Refactors

- **ssr**: refactor ssr, support exclude &nbsp;-&nbsp; by @soybeanjs [<samp>(c7d04)</samp>](https://github.com/soybeanjs/ubean/commit/c7d0428)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.11](https://github.com/soybeanjs/ubean/compare/v0.1.10...v0.1.11) (2026-07-30)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **cache**: optimize reuse page cache &nbsp;-&nbsp; by @soybeanjs [<samp>(5dd93)</samp>](https://github.com/soybeanjs/ubean/commit/5dd9338)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.10](https://github.com/soybeanjs/ubean/compare/v0.1.9...v0.1.10) (2026-07-30)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **runtime**: fix page cache &nbsp;-&nbsp; by @soybeanjs [<samp>(686cb)</samp>](https://github.com/soybeanjs/ubean/commit/686cbcb)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**: update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(1b46c)</samp>](https://github.com/soybeanjs/ubean/commit/1b46cec)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.9](https://github.com/soybeanjs/ubean/compare/v0.1.8...v0.1.9) (2026-07-29)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **cli**: optimize init template &nbsp;-&nbsp; by @soybeanjs [<samp>(21b19)</samp>](https://github.com/soybeanjs/ubean/commit/21b19f6)
- **islands**: add auto-registration via virtual module &nbsp;-&nbsp; by @soybeanjs [<samp>(1ee16)</samp>](https://github.com/soybeanjs/ubean/commit/1ee1605)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **islands**: resolve island hydration failure and infinite HMR reload &nbsp;-&nbsp; by @soybeanjs [<samp>(5c244)</samp>](https://github.com/soybeanjs/ubean/commit/5c2440e)
- **test**: fix test &nbsp;-&nbsp; by @soybeanjs [<samp>(6b5bd)</samp>](https://github.com/soybeanjs/ubean/commit/6b5bd36)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **projects**: optimize code &nbsp;-&nbsp; by @soybeanjs [<samp>(a2b4d)</samp>](https://github.com/soybeanjs/ubean/commit/a2b4d12)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- add islands auto registry scheme doc and update example &nbsp;-&nbsp; by @soybeanjs [<samp>(a8000)</samp>](https://github.com/soybeanjs/ubean/commit/a800092)
- **islands**: update islands auto hydration &nbsp;-&nbsp; by @soybeanjs [<samp>(cba14)</samp>](https://github.com/soybeanjs/ubean/commit/cba1492)

### &nbsp;&nbsp;&nbsp;🎨 Styles

- **projects**: fix lint error and format code &nbsp;-&nbsp; by @soybeanjs [<samp>(6cb02)</samp>](https://github.com/soybeanjs/ubean/commit/6cb0252)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.8](https://github.com/soybeanjs/ubean/compare/v0.1.7...v0.1.8) (2026-07-28)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **modules**: add @ubean/pinia &nbsp;-&nbsp; by @soybeanjs [<samp>(19f4c)</samp>](https://github.com/soybeanjs/ubean/commit/19f4c8b)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **codegen**: optimize codegen &nbsp;-&nbsp; by @soybeanjs [<samp>(aabcf)</samp>](https://github.com/soybeanjs/ubean/commit/aabcf93)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **projects**: update deps and update scripts &nbsp;-&nbsp; by @soybeanjs [<samp>(cf461)</samp>](https://github.com/soybeanjs/ubean/commit/cf46159)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.7](https://github.com/soybeanjs/ubean/compare/v0.1.6...v0.1.7) (2026-07-27)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **config**: add sync config loader and fix electron plugin async issue &nbsp;-&nbsp; by @soybeanjs [<samp>(669ee)</samp>](https://github.com/soybeanjs/ubean/commit/669ee87)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.6](https://github.com/soybeanjs/ubean/compare/v0.1.5...v0.1.6) (2026-07-27)

### &nbsp;&nbsp;&nbsp;💅 Refactors

- **vue-plugin**: use dynamic resolver &nbsp;-&nbsp; by @soybeanjs [<samp>(99fc1)</samp>](https://github.com/soybeanjs/ubean/commit/99fc160)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.5](https://github.com/soybeanjs/ubean/compare/v0.1.4...v0.1.5) (2026-07-27)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **icon**: fix icon options &nbsp;-&nbsp; by @soybeanjs [<samp>(96e1e)</samp>](https://github.com/soybeanjs/ubean/commit/96e1e12)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.4](https://github.com/soybeanjs/ubean/compare/v0.1.3...v0.1.4) (2026-07-27)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **modules**: add auto-install support for missing built-in modules &nbsp;-&nbsp; by @soybeanjs [<samp>(b38bd)</samp>](https://github.com/soybeanjs/ubean/commit/b38bd2d)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **README**: update README &nbsp;-&nbsp; by @soybeanjs [<samp>(aa02a)</samp>](https://github.com/soybeanjs/ubean/commit/aa02a6a)

### &nbsp;&nbsp;&nbsp;📦 Build

- **package.json**: fix typecheck script &nbsp;-&nbsp; by @soybeanjs [<samp>(27fbf)</samp>](https://github.com/soybeanjs/ubean/commit/27fbfe2)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.3](https://github.com/soybeanjs/ubean/compare/v0.1.2...v0.1.3) (2026-07-27)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **projects**: update CHANGELOG &nbsp;-&nbsp; by @soybeanjs [<samp>(bc4df)</samp>](https://github.com/soybeanjs/ubean/commit/bc4df58)

### &nbsp;&nbsp;&nbsp;📦 Build

- **package.json**: fix build script &nbsp;-&nbsp; by @soybeanjs [<samp>(2aeea)</samp>](https://github.com/soybeanjs/ubean/commit/2aeea2f)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.2](https://github.com/soybeanjs/ubean/compare/v0.1.1...v0.1.2) (2026-07-27)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- **deps**: update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(a5e28)</samp>](https://github.com/soybeanjs/ubean/commit/a5e28c0)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.1](https://github.com/soybeanjs/ubean/compare/v0.1.0...v0.1.1) (2026-07-27)

### &nbsp;&nbsp;&nbsp;🚀 Features

- **devtools**: add devtools configuration and integration support &nbsp;-&nbsp; by @soybeanjs [<samp>(0eab0)</samp>](https://github.com/soybeanjs/ubean/commit/0eab0b5)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- **import**: fix import for head &nbsp;-&nbsp; by @soybeanjs [<samp>(c5390)</samp>](https://github.com/soybeanjs/ubean/commit/c539028)
- **pages**: fix reuse pages &nbsp;-&nbsp; by @soybeanjs [<samp>(79acd)</samp>](https://github.com/soybeanjs/ubean/commit/79acd11)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **devtools**: optimize devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(840cb)</samp>](https://github.com/soybeanjs/ubean/commit/840cbd5)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- **CHANGELOG**: update CHANGELOG &nbsp;-&nbsp; by @soybeanjs [<samp>(7e50e)</samp>](https://github.com/soybeanjs/ubean/commit/7e50e41)

### &nbsp;&nbsp;&nbsp;📦 Build

- **package.json**: add parallel flag to build:libs script &nbsp;-&nbsp; by @soybeanjs [<samp>(49f1d)</samp>](https://github.com/soybeanjs/ubean/commit/49f1d5d)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;

## [v0.1.0](https://github.com/soybeanjs/ubean/compare/v0.1.0...main) (2026-07-26)

### &nbsp;&nbsp;&nbsp;🚨 Breaking Changes

- **client**:
  - remove @ubean/client, use @soybeanjs/fetch instead &nbsp;-&nbsp; by @soybeanjs [<samp>(5b564)</samp>](https://github.com/soybeanjs/ubean/commit/5b56415)
- **packages**:
  - unify package naming and export format &nbsp;-&nbsp; by @soybeanjs [<samp>(b796e)</samp>](https://github.com/soybeanjs/ubean/commit/b796edd)
  - rename subpackages and adopt vite-plugin-pwa &nbsp;-&nbsp; by @soybeanjs [<samp>(19fc1)</samp>](https://github.com/soybeanjs/ubean/commit/19fc133)
- **ubean**:
  - convert packages/ubean to thin re-export of @ubean/core &nbsp;-&nbsp; by @soybeanjs [<samp>(1c970)</samp>](https://github.com/soybeanjs/ubean/commit/1c970f2)

### &nbsp;&nbsp;&nbsp;🚀 Features

- add Cron scheduler memory runner and auto-imports support &nbsp;-&nbsp; by @soybeanjs [<samp>(748e5)</samp>](https://github.com/soybeanjs/ubean/commit/748e508)
- add cross-platform Queue system (P6-22) &nbsp;-&nbsp; by @soybeanjs [<samp>(519f7)</samp>](https://github.com/soybeanjs/ubean/commit/519f75a)
- add Markdown/MDX page support (P6-17) &nbsp;-&nbsp; by @soybeanjs [<samp>(69d39)</samp>](https://github.com/soybeanjs/ubean/commit/69d3927)
- complete P6-05 database integration (db0 abstraction) &nbsp;-&nbsp; by @soybeanjs [<samp>(6ebe8)</samp>](https://github.com/soybeanjs/ubean/commit/6ebe819)
- complete P6-10 DevTools infrastructure &nbsp;-&nbsp; by @soybeanjs [<samp>(030f4)</samp>](https://github.com/soybeanjs/ubean/commit/030f4e7)
- add ubean-icon extension package (P6-26) &nbsp;-&nbsp; by @soybeanjs [<samp>(9a022)</samp>](https://github.com/soybeanjs/ubean/commit/9a0223c)
- add ubean-image, ubean-content, ubean-fonts extension packages &nbsp;-&nbsp; by @soybeanjs [<samp>(5742b)</samp>](https://github.com/soybeanjs/ubean/commit/5742b0c)
- complete P6-38 Vite SSR production build pipeline &nbsp;-&nbsp; by @soybeanjs [<samp>(12d52)</samp>](https://github.com/soybeanjs/ubean/commit/12d5219)
- complete P6-39 top-level config shortcuts for official modules &nbsp;-&nbsp; by @soybeanjs [<samp>(395d2)</samp>](https://github.com/soybeanjs/ubean/commit/395d2fc)
- implement Phase 7 - Skills system and documentation &nbsp;-&nbsp; by @soybeanjs [<samp>(163aa)</samp>](https://github.com/soybeanjs/ubean/commit/163aa5b)
- **auth**:
  - implement Better Auth integration plugin (P6-23) &nbsp;-&nbsp; by @soybeanjs [<samp>(cb641)</samp>](https://github.com/soybeanjs/ubean/commit/cb6413b)
- **auto-imports**:
  - integrate unimport and unplugin auto-imports into Vite plugin &nbsp;-&nbsp; by @soybeanjs [<samp>(0bf49)</samp>](https://github.com/soybeanjs/ubean/commit/0bf4990)
- **backend**:
  - migrate api-routes, server-runtime and app packages &nbsp;-&nbsp; by @soybeanjs [<samp>(41dc3)</samp>](https://github.com/soybeanjs/ubean/commit/41dc305)
- **basic-layer**:
  - migrate leaf packages to @ubean/* subpackages &nbsp;-&nbsp; by @soybeanjs [<samp>(2e103)</samp>](https://github.com/soybeanjs/ubean/commit/2e10310)
- **build-tools**:
  - migrate auto-imports, prerender, codegen, modules, build, dev, cli &nbsp;-&nbsp; by @soybeanjs [<samp>(54a69)</samp>](https://github.com/soybeanjs/ubean/commit/54a697e)
- **ci**:
  - add GitHub Actions CI workflow (P8-05) &nbsp;-&nbsp; by @soybeanjs [<samp>(28eab)</samp>](https://github.com/soybeanjs/ubean/commit/28eab03)
- **cli**:
  - add CLI Shared Layer with fs-ops and templates (P4-19) &nbsp;-&nbsp; by @soybeanjs [<samp>(700ee)</samp>](https://github.com/soybeanjs/ubean/commit/700eee4)
  - add page add/list scaffold commands (P4-17) &nbsp;-&nbsp; by @soybeanjs [<samp>(ed425)</samp>](https://github.com/soybeanjs/ubean/commit/ed4251b)
  - fix reuse scaffold to use .reuse.ts format with definePage export &nbsp;-&nbsp; by @soybeanjs [<samp>(f303f)</samp>](https://github.com/soybeanjs/ubean/commit/f303fc4)
  - add `ubean init` interactive project scaffolding &nbsp;-&nbsp; by @soybeanjs [<samp>(284d2)</samp>](https://github.com/soybeanjs/ubean/commit/284d233)
  - add complete CLI subcommand system (P4-18) &nbsp;-&nbsp; by @soybeanjs [<samp>(ab6a7)</samp>](https://github.com/soybeanjs/ubean/commit/ab6a79d)
- **client**:
  - refactor to ofetch-based client with normal/flat modes and XHR upload &nbsp;-&nbsp; by @soybeanjs [<samp>(4e614)</samp>](https://github.com/soybeanjs/ubean/commit/4e6141e)
  - add page cache, optimize layout &nbsp;-&nbsp; by @soybeanjs [<samp>(22b63)</samp>](https://github.com/soybeanjs/ubean/commit/22b63be)
- **config**:
  - add formatting script to package.json and simplify fmt configuration in vite.config.ts &nbsp;-&nbsp; by @soybeanjs [<samp>(ecd61)</samp>](https://github.com/soybeanjs/ubean/commit/ecd613f)
  - migrate config loader with new RoutingConfig type &nbsp;-&nbsp; by @soybeanjs [<samp>(1e2b5)</samp>](https://github.com/soybeanjs/ubean/commit/1e2b51d)
- **core**:
  - implement Phase 1-2 project skeleton and build core &nbsp;-&nbsp; by @soybeanjs [<samp>(24839)</samp>](https://github.com/soybeanjs/ubean/commit/24839c1)
  - implement prerender/SSG infrastructure (P6-02) &nbsp;-&nbsp; by @soybeanjs [<samp>(6f1fb)</samp>](https://github.com/soybeanjs/ubean/commit/6f1fb22)
  - add @ubean/core aggregator and split devtools define-tab &nbsp;-&nbsp; by @soybeanjs [<samp>(9f6a4)</samp>](https://github.com/soybeanjs/ubean/commit/9f6a471)
- **define-app, macros**:
  - implement defineApp system and compile-time macro stripping &nbsp;-&nbsp; by @soybeanjs [<samp>(9d07f)</samp>](https://github.com/soybeanjs/ubean/commit/9d07f15)
- **dev**:
  - implement P6-36 Dev Server migration to Vite Middleware Mode &nbsp;-&nbsp; by @soybeanjs [<samp>(6b8b6)</samp>](https://github.com/soybeanjs/ubean/commit/6b8b64b)
  - add strictPort option to control port behavior &nbsp;-&nbsp; by @soybeanjs [<samp>(c82f9)</samp>](https://github.com/soybeanjs/ubean/commit/c82f943)
- **devtools**:
  - 重构DevTools UI为Vue 3应用，遵循@soybeanjs/ui设计规范 &nbsp;-&nbsp; by @soybeanjs [<samp>(8751b)</samp>](https://github.com/soybeanjs/ubean/commit/8751b2c)
  - 集成UnoCSS和@soybeanjs/unocss-shadcn重构UI &nbsp;-&nbsp; by @soybeanjs [<samp>(0d66e)</samp>](https://github.com/soybeanjs/ubean/commit/0d66e1d)
  - implement P6-11 DevTools built-in tabs &nbsp;-&nbsp; by @soybeanjs [<samp>(3741a)</samp>](https://github.com/soybeanjs/ubean/commit/3741afe)
  - implement P6-12 CRUD and P6-13 Hooks system, refactor to use built-in toast &nbsp;-&nbsp; by @soybeanjs [<samp>(651b3)</samp>](https://github.com/soybeanjs/ubean/commit/651b34a)
  - add CodeMirror 6 code editor component (P6-25) &nbsp;-&nbsp; by @soybeanjs [<samp>(f1eb8)</samp>](https://github.com/soybeanjs/ubean/commit/f1eb805)
  - complete P8-02 DevTools unit tests with 22 new cases &nbsp;-&nbsp; by @soybeanjs [<samp>(e7601)</samp>](https://github.com/soybeanjs/ubean/commit/e7601f7)
  - embed OpenAPI Scalar docs and Drizzle Studio tabs (P6-14) &nbsp;-&nbsp; by @soybeanjs [<samp>(5efb9)</samp>](https://github.com/soybeanjs/ubean/commit/5efb978)
  - implement API Playground (P6-14) &nbsp;-&nbsp; by @soybeanjs [<samp>(e5c63)</samp>](https://github.com/soybeanjs/ubean/commit/e5c6316)
  - add custom Tab plugin API (P6-16) &nbsp;-&nbsp; by @soybeanjs [<samp>(049af)</samp>](https://github.com/soybeanjs/ubean/commit/049affd)
  - add Config/Layouts tabs and pass layouts/crons/presets info &nbsp;-&nbsp; by @soybeanjs [<samp>(b9b0a)</samp>](https://github.com/soybeanjs/ubean/commit/b9b0ac1)
  - add CreateDialog for CRUD resource creation (P6-12) &nbsp;-&nbsp; by @soybeanjs [<samp>(b9249)</samp>](https://github.com/soybeanjs/ubean/commit/b9249e2)
  - add delete button for pages with ConfirmDialog &nbsp;-&nbsp; by @soybeanjs [<samp>(afe02)</samp>](https://github.com/soybeanjs/ubean/commit/afe02c6)
  - add delete buttons for all resource views &nbsp;-&nbsp; by @soybeanjs [<samp>(efe53)</samp>](https://github.com/soybeanjs/ubean/commit/efe536a)
  - add P6-15 AI Assistant with LLM function calling &nbsp;-&nbsp; by @soybeanjs [<samp>(bdaac)</samp>](https://github.com/soybeanjs/ubean/commit/bdaac5d)
- **docs**:
  - add Chinese README and update LICENSE &nbsp;-&nbsp; by @soybeanjs [<samp>(56772)</samp>](https://github.com/soybeanjs/ubean/commit/5677265)
- **electron**:
  - add @ubean/electron built-in module &nbsp;-&nbsp; by @soybeanjs [<samp>(7209c)</samp>](https://github.com/soybeanjs/ubean/commit/7209ceb)
- **example**:
  - add ubean-test example with static files and API routes &nbsp;-&nbsp; by @soybeanjs [<samp>(cc227)</samp>](https://github.com/soybeanjs/ubean/commit/cc22785)
- **examples**:
  - add frontend-only and routing-file-mode examples &nbsp;-&nbsp; by @soybeanjs [<samp>(bfb5b)</samp>](https://github.com/soybeanjs/ubean/commit/bfb5b5f)
- **extensions**:
  - Improve extension packages to align with Nuxt ecosystem modules and unify the build system:wq &nbsp;-&nbsp; by @soybeanjs [<samp>(f047d)</samp>](https://github.com/soybeanjs/ubean/commit/f047d28)
- **handler**:
  - simplify response helpers and improve context handling &nbsp;-&nbsp; by @soybeanjs [<samp>(8c76c)</samp>](https://github.com/soybeanjs/ubean/commit/8c76c65)
- **i18n**:
  - implement i18n runtime and locales scanning (P2-04c & P3-16) &nbsp;-&nbsp; by @soybeanjs [<samp>(f83d8)</samp>](https://github.com/soybeanjs/ubean/commit/f83d890)
  - implement P6-31 Vue reactive i18n integration &nbsp;-&nbsp; by @soybeanjs [<samp>(af5f0)</samp>](https://github.com/soybeanjs/ubean/commit/af5f011)
  - implement P6-32 i18n locales auto-loading &nbsp;-&nbsp; by @soybeanjs [<samp>(a59d7)</samp>](https://github.com/soybeanjs/ubean/commit/a59d7bb)
  - implement P6-33 i18n SSR Hydration & HTML &nbsp;-&nbsp; by @soybeanjs [<samp>(9196c)</samp>](https://github.com/soybeanjs/ubean/commit/9196c3e)
  - implement P6-34 pluralization/message enhancements and P6-35 Intl formatting &nbsp;-&nbsp; by @soybeanjs [<samp>(ef7a9)</samp>](https://github.com/soybeanjs/ubean/commit/ef7a959)
- **icon**:
  - support Custom Local Collections &nbsp;-&nbsp; by @soybeanjs [<samp>(bbd74)</samp>](https://github.com/soybeanjs/ubean/commit/bbd749b)
- **islands**:
  - implement P6-18 Islands architecture &nbsp;-&nbsp; by @soybeanjs [<samp>(7bcbb)</samp>](https://github.com/soybeanjs/ubean/commit/7bcbb53)
  - implement Islands architecture (P6-18) with client:* directives &nbsp;-&nbsp; by @soybeanjs [<samp>(89321)</samp>](https://github.com/soybeanjs/ubean/commit/89321f5)
- **logo**:
  - integrate ubean logo across repo, build, devtools and CLI &nbsp;-&nbsp; by @soybeanjs [<samp>(66b3e)</samp>](https://github.com/soybeanjs/ubean/commit/66b3e4e)
- **markdown**:
  - enhance markdown processing with new options and improve tests &nbsp;-&nbsp; by @soybeanjs [<samp>(74cfe)</samp>](https://github.com/soybeanjs/ubean/commit/74cfee0)
- **md**:
  - support markdown config head,seo &nbsp;-&nbsp; by @soybeanjs [<samp>(55d88)</samp>](https://github.com/soybeanjs/ubean/commit/55d886b)
- **modes**:
  - implement app mode system with optional SSR control &nbsp;-&nbsp; by @soybeanjs [<samp>(a848b)</samp>](https://github.com/soybeanjs/ubean/commit/a848b69)
- **modules**:
  - implement P6-37 Module system and config injection &nbsp;-&nbsp; by @soybeanjs [<samp>(b9724)</samp>](https://github.com/soybeanjs/ubean/commit/b9724c6)
  - implement P6-40 module dependencies, hooks and Kit-style API &nbsp;-&nbsp; by @soybeanjs [<samp>(b560d)</samp>](https://github.com/soybeanjs/ubean/commit/b560d0e)
  - add builtin module @ubean/ui, extend @soybeanjs/ui &nbsp;-&nbsp; by @soybeanjs [<samp>(51d75)</samp>](https://github.com/soybeanjs/ubean/commit/51d7500)
- **observability**:
  - add request ID middleware (P3-17 partial) &nbsp;-&nbsp; by @soybeanjs [<samp>(b52fc)</samp>](https://github.com/soybeanjs/ubean/commit/b52fcd7)
  - complete tracing system with spans, redaction and OTel exporter &nbsp;-&nbsp; by @soybeanjs [<samp>(84d14)</samp>](https://github.com/soybeanjs/ubean/commit/84d148d)
- **pages**:
  - implement page actions, route groups, and robust definePage extraction &nbsp;-&nbsp; by @soybeanjs [<samp>(6b858)</samp>](https://github.com/soybeanjs/ubean/commit/6b85860)
  - add data dependency, invalidation and streaming primitives (P4-20) &nbsp;-&nbsp; by @soybeanjs [<samp>(d259f)</samp>](https://github.com/soybeanjs/ubean/commit/d259fc0)
- **preset**:
  - add capability matrix and build-time diagnostics (P5-01) &nbsp;-&nbsp; by @soybeanjs [<samp>(8d009)</samp>](https://github.com/soybeanjs/ubean/commit/8d009b7)
  - add Cloudflare Workers preset with wrangler.toml generation (P5-02, P5-05) &nbsp;-&nbsp; by @soybeanjs [<samp>(007d3)</samp>](https://github.com/soybeanjs/ubean/commit/007d3c9)
  - add automatic preset detection (P5-04) &nbsp;-&nbsp; by @soybeanjs [<samp>(e1af3)</samp>](https://github.com/soybeanjs/ubean/commit/e1af3ce)
- **projects**:
  - init projects &nbsp;-&nbsp; by @soybeanjs [<samp>(636a0)</samp>](https://github.com/soybeanjs/ubean/commit/636a03f)
  - add unplugin-vue-markdown support and update related configurations &nbsp;-&nbsp; by @soybeanjs [<samp>(ad966)</samp>](https://github.com/soybeanjs/ubean/commit/ad966c6)
  - add examples ubean-test &nbsp;-&nbsp; by @soybeanjs [<samp>(b6f90)</samp>](https://github.com/soybeanjs/ubean/commit/b6f9064)
  - add various API endpoints and improve internal functionality &nbsp;-&nbsp; by @soybeanjs [<samp>(964f9)</samp>](https://github.com/soybeanjs/ubean/commit/964f9e0)
- **pwa**:
  - implement PWA extension package (P6-30) &nbsp;-&nbsp; by @soybeanjs [<samp>(738a4)</samp>](https://github.com/soybeanjs/ubean/commit/738a4b0)
- **request**:
  - add typed HTTP client with responseType and file download support &nbsp;-&nbsp; by @soybeanjs [<samp>(71831)</samp>](https://github.com/soybeanjs/ubean/commit/7183142)
- **reuse, link, cron**:
  - implement reuse routes, typed Link component, and cron runtime &nbsp;-&nbsp; by @soybeanjs [<samp>(9d93e)</samp>](https://github.com/soybeanjs/ubean/commit/9d93e27)
- **router**:
  - integrate vue-router for improved routing capabilities &nbsp;-&nbsp; by @soybeanjs [<samp>(9af9b)</samp>](https://github.com/soybeanjs/ubean/commit/9af9b44)
- **router,macros**:
  - implement defineValidator AST extraction and add runtime macro stubs &nbsp;-&nbsp; by @soybeanjs [<samp>(75129)</samp>](https://github.com/soybeanjs/ubean/commit/7512950)
- **routing**:
  - replace public flag with requiresAuth for route metadata &nbsp;-&nbsp; by @soybeanjs [<samp>(c62f1)</samp>](https://github.com/soybeanjs/ubean/commit/c62f1e4)
  - migrate scanner, router, AST extractor and entity file generator &nbsp;-&nbsp; by @soybeanjs [<samp>(c5d9b)</samp>](https://github.com/soybeanjs/ubean/commit/c5d9b18)
  - reuse routes derived directly from .reuse.ts files &nbsp;-&nbsp; by @soybeanjs [<samp>(336b8)</samp>](https://github.com/soybeanjs/ubean/commit/336b812)
  - support multiple directories and derive page scanning from dirs.pages &nbsp;-&nbsp; by @soybeanjs [<samp>(abf6c)</samp>](https://github.com/soybeanjs/ubean/commit/abf6c43)
  - implement routing type &nbsp;-&nbsp; by @soybeanjs [<samp>(15394)</samp>](https://github.com/soybeanjs/ubean/commit/15394f0)
- **runtime**:
  - implement Phase 3 runtime core &nbsp;-&nbsp; by @soybeanjs [<samp>(36c50)</samp>](https://github.com/soybeanjs/ubean/commit/36c506f)
  - implement middleware path mounting, static file serving, nested layouts, and OpenAPI runtime &nbsp;-&nbsp; by @soybeanjs [<samp>(48573)</samp>](https://github.com/soybeanjs/ubean/commit/48573ff)
  - implement route rules (headers/redirects/cache) and dev runner &nbsp;-&nbsp; by @soybeanjs [<samp>(28a48)</samp>](https://github.com/soybeanjs/ubean/commit/28a48b2)
  - implement server-side route cache (P6-01) &nbsp;-&nbsp; by @soybeanjs [<samp>(81338)</samp>](https://github.com/soybeanjs/ubean/commit/81338a6)
  - implement Storage/KV abstraction layer (P6-04) &nbsp;-&nbsp; by @soybeanjs [<samp>(b49fd)</samp>](https://github.com/soybeanjs/ubean/commit/b49fddf)
  - implement WebSocket abstraction layer (P6-06) &nbsp;-&nbsp; by @soybeanjs [<samp>(b1993)</samp>](https://github.com/soybeanjs/ubean/commit/b199366)
  - implement Server-Sent Events support (P6-07) &nbsp;-&nbsp; by @soybeanjs [<samp>(9500d)</samp>](https://github.com/soybeanjs/ubean/commit/9500d0b)
  - implement server-side internalFetch and integrate WebSocket middleware &nbsp;-&nbsp; by @soybeanjs [<samp>(bd8a8)</samp>](https://github.com/soybeanjs/ubean/commit/bd8a8f2)
  - implement CORS middleware &nbsp;-&nbsp; by @soybeanjs [<samp>(20018)</samp>](https://github.com/soybeanjs/ubean/commit/200189c)
  - implement rate limiting middleware &nbsp;-&nbsp; by @soybeanjs [<samp>(cc892)</samp>](https://github.com/soybeanjs/ubean/commit/cc8924f)
  - implement i18n routing strategies (P6-21) &nbsp;-&nbsp; by @soybeanjs [<samp>(c58ab)</samp>](https://github.com/soybeanjs/ubean/commit/c58ab01)
  - expose vue-router navigation guards via defineApp({ router }) &nbsp;-&nbsp; by @soybeanjs [<samp>(e1b0c)</samp>](https://github.com/soybeanjs/ubean/commit/e1b0ce8)
- **scanning**:
  - add queues directory scanning (P2-04b) &nbsp;-&nbsp; by @soybeanjs [<samp>(42d10)</samp>](https://github.com/soybeanjs/ubean/commit/42d1017)
- **seo**:
  - add robots.txt and sitemap.xml generators (P3-18 partial) &nbsp;-&nbsp; by @soybeanjs [<samp>(bc859)</samp>](https://github.com/soybeanjs/ubean/commit/bc85964)
  - complete metadata management with OG/Twitter tags and Web App Manifest &nbsp;-&nbsp; by @soybeanjs [<samp>(4692e)</samp>](https://github.com/soybeanjs/ubean/commit/4692eb9)
- **server**:
  - add defineServer API for backend server customization &nbsp;-&nbsp; by @soybeanjs [<samp>(95899)</samp>](https://github.com/soybeanjs/ubean/commit/9589927)
- **test**:
  - add client navigation integration tests and e2e tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(158e0)</samp>](https://github.com/soybeanjs/ubean/commit/158e0ca)
  - add comprehensive integration tests for ubean features &nbsp;-&nbsp; by @soybeanjs [<samp>(6d1d3)</samp>](https://github.com/soybeanjs/ubean/commit/6d1d379)
- **view-transitions**:
  - add native View Transitions API support for page navigation (P4-15) &nbsp;-&nbsp; by @soybeanjs [<samp>(9c1cc)</samp>](https://github.com/soybeanjs/ubean/commit/9c1cc43)
- **vue**:
  - implement Phase 4 Vue Pages system with Inertia-style SSR &nbsp;-&nbsp; by @soybeanjs [<samp>(f07a6)</samp>](https://github.com/soybeanjs/ubean/commit/f07a624)
  - integrate reactive data cache with useAsyncData composable (P4-20) &nbsp;-&nbsp; by @soybeanjs [<samp>(ec5b6)</samp>](https://github.com/soybeanjs/ubean/commit/ec5b60c)
  - migrate runtime, islands, ssr and vite plugin packages &nbsp;-&nbsp; by @soybeanjs [<samp>(8b876)</samp>](https://github.com/soybeanjs/ubean/commit/8b8768e)

### &nbsp;&nbsp;&nbsp;🐞 Bug Fixes

- resolve ESLint errors and warnings, complete skills migration &nbsp;-&nbsp; by @soybeanjs [<samp>(ccbcf)</samp>](https://github.com/soybeanjs/ubean/commit/ccbcffd)
- **build**:
  - resolve markdown build errors and force exit after build &nbsp;-&nbsp; by @soybeanjs [<samp>(1f2dc)</samp>](https://github.com/soybeanjs/ubean/commit/1f2dc8b)
- **examples**:
  - correct routing-file-mode generated file paths &nbsp;-&nbsp; by @soybeanjs [<samp>(9945b)</samp>](https://github.com/soybeanjs/ubean/commit/9945b7e)
- **locale**:
  - add vite-ignore comment to dynamic import for locale files &nbsp;-&nbsp; by @soybeanjs [<samp>(a06bf)</samp>](https://github.com/soybeanjs/ubean/commit/a06bf3c)
- **projects**:
  - fix devtools app.vue &nbsp;-&nbsp; by @soybeanjs [<samp>(024ed)</samp>](https://github.com/soybeanjs/ubean/commit/024ed35)
  - fix lint error &nbsp;-&nbsp; by @soybeanjs [<samp>(4922a)</samp>](https://github.com/soybeanjs/ubean/commit/4922a05)
  - fix examples &nbsp;-&nbsp; by @soybeanjs [<samp>(94bd6)</samp>](https://github.com/soybeanjs/ubean/commit/94bd626)
- **runtime**:
  - update virtual module identifiers and improve auto-import presets &nbsp;-&nbsp; by @soybeanjs [<samp>(23c07)</samp>](https://github.com/soybeanjs/ubean/commit/23c07f4)
- **ssr**:
  - apply defineApp config during SSR rendering &nbsp;-&nbsp; by @soybeanjs [<samp>(393cc)</samp>](https://github.com/soybeanjs/ubean/commit/393cc3d)
  - fix ssr hydration &nbsp;-&nbsp; by @soybeanjs [<samp>(6b772)</samp>](https://github.com/soybeanjs/ubean/commit/6b77225)
- **test**:
  - fix test &nbsp;-&nbsp; by @soybeanjs [<samp>(6203c)</samp>](https://github.com/soybeanjs/ubean/commit/6203c88)
- **types**:
  - fix ts types &nbsp;-&nbsp; by @soybeanjs [<samp>(cd78b)</samp>](https://github.com/soybeanjs/ubean/commit/cd78bb1)
- **vite**:
  - update fmt configuration to include ignorePatterns for docs &nbsp;-&nbsp; by @soybeanjs [<samp>(74cce)</samp>](https://github.com/soybeanjs/ubean/commit/74cce7b)
- **vite-server**:
  - disable vite devtools client auth &nbsp;-&nbsp; by @soybeanjs [<samp>(b07e9)</samp>](https://github.com/soybeanjs/ubean/commit/b07e9c7)

### &nbsp;&nbsp;&nbsp;🛠 Optimizations

- **core**:
  - optimize dev,build and preview &nbsp;-&nbsp; by @soybeanjs [<samp>(18d18)</samp>](https://github.com/soybeanjs/ubean/commit/18d18c5)
- **deps**:
  - optimize deps &nbsp;-&nbsp; by @soybeanjs [<samp>(d13ea)</samp>](https://github.com/soybeanjs/ubean/commit/d13eaf8)
- **devtools**:
  - optimize devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(068b7)</samp>](https://github.com/soybeanjs/ubean/commit/068b760)
- **handler**:
  - simplify OpenAPI registration and remove unused validator functionality &nbsp;-&nbsp; by @soybeanjs [<samp>(e4ce1)</samp>](https://github.com/soybeanjs/ubean/commit/e4ce14b)
- **prerender**:
  - optimize prerender &nbsp;-&nbsp; by @soybeanjs [<samp>(9ac8b)</samp>](https://github.com/soybeanjs/ubean/commit/9ac8bb8)
- **projects**:
  - remove useless files &nbsp;-&nbsp; by @soybeanjs [<samp>(30c08)</samp>](https://github.com/soybeanjs/ubean/commit/30c0890)
  - optimize ubean &nbsp;-&nbsp; by @soybeanjs [<samp>(3f115)</samp>](https://github.com/soybeanjs/ubean/commit/3f1151e)
  - optimize ubean config &nbsp;-&nbsp; by @soybeanjs [<samp>(49925)</samp>](https://github.com/soybeanjs/ubean/commit/49925f0)
  - optimzie ts types &nbsp;-&nbsp; by @soybeanjs [<samp>(4a50e)</samp>](https://github.com/soybeanjs/ubean/commit/4a50e49)
  - optimize devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(8e791)</samp>](https://github.com/soybeanjs/ubean/commit/8e791c5)
  - optimize devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(0f99a)</samp>](https://github.com/soybeanjs/ubean/commit/0f99a2f)
  - optimize definePage &nbsp;-&nbsp; by @soybeanjs [<samp>(e9133)</samp>](https://github.com/soybeanjs/ubean/commit/e9133be)
  - remove useless files &nbsp;-&nbsp; by @soybeanjs [<samp>(78d49)</samp>](https://github.com/soybeanjs/ubean/commit/78d49c3)
  - optimize devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(6eac8)</samp>](https://github.com/soybeanjs/ubean/commit/6eac8c4)
  - optimize tsconfig &nbsp;-&nbsp; by @soybeanjs [<samp>(e0492)</samp>](https://github.com/soybeanjs/ubean/commit/e0492bd)
- **types**:
  - optimize types &nbsp;-&nbsp; by @soybeanjs [<samp>(6a910)</samp>](https://github.com/soybeanjs/ubean/commit/6a910f4)

### &nbsp;&nbsp;&nbsp;💅 Refactors

- remove zod dependency, use schema-agnostic validation &nbsp;-&nbsp; by @soybeanjs [<samp>(188af)</samp>](https://github.com/soybeanjs/ubean/commit/188aff4)
- **cli**:
  - remove port display from dev server startup message &nbsp;-&nbsp; by @soybeanjs [<samp>(c8e4b)</samp>](https://github.com/soybeanjs/ubean/commit/c8e4b49)
- **config**:
  - simplify ubean configuration and improve package.json scripts &nbsp;-&nbsp; by @soybeanjs [<samp>(664df)</samp>](https://github.com/soybeanjs/ubean/commit/664df14)
  - unify port and update devtools url &nbsp;-&nbsp; by @soybeanjs [<samp>(8f95e)</samp>](https://github.com/soybeanjs/ubean/commit/8f95ec5)
  - unify build output dir to dist &nbsp;-&nbsp; by @soybeanjs [<samp>(a8637)</samp>](https://github.com/soybeanjs/ubean/commit/a863766)
- **devtools**:
  - unify UI styles to UnoCSS, audit shortcuts &nbsp;-&nbsp; by @soybeanjs [<samp>(3c1c7)</samp>](https://github.com/soybeanjs/ubean/commit/3c1c7d0)
  - refactor devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(53134)</samp>](https://github.com/soybeanjs/ubean/commit/53134e2)
  - optimize api filepath &nbsp;-&nbsp; by @soybeanjs [<samp>(bce61)</samp>](https://github.com/soybeanjs/ubean/commit/bce6116)
  - unify types &nbsp;-&nbsp; by @soybeanjs [<samp>(03e88)</samp>](https://github.com/soybeanjs/ubean/commit/03e88ad)
- **fetch**:
  - replace createFlatTypedClient to toFlatTypedClient and update request config &nbsp;-&nbsp; by @soybeanjs [<samp>(376a3)</samp>](https://github.com/soybeanjs/ubean/commit/376a3d2)
- **head**:
  - replace custom head manager with @unhead/vue integration &nbsp;-&nbsp; by @soybeanjs [<samp>(5ca90)</samp>](https://github.com/soybeanjs/ubean/commit/5ca9026)
- **i18n**:
  - streamline locale handling and configuration &nbsp;-&nbsp; by @soybeanjs [<samp>(d5976)</samp>](https://github.com/soybeanjs/ubean/commit/d597683)
- **packages**:
  - unify package name &nbsp;-&nbsp; by @soybeanjs [<samp>(7de6f)</samp>](https://github.com/soybeanjs/ubean/commit/7de6f66)
- **prerender**:
  - refactor prerender &nbsp;-&nbsp; by @soybeanjs [<samp>(ebcd7)</samp>](https://github.com/soybeanjs/ubean/commit/ebcd704)
- **preset**:
  - optimize preset system referencing Nitro architecture &nbsp;-&nbsp; by @soybeanjs [<samp>(e2f7b)</samp>](https://github.com/soybeanjs/ubean/commit/e2f7b57)
- **projects**:
  - rename "uBean" to "ubean" &nbsp;-&nbsp; by @soybeanjs [<samp>(2b252)</samp>](https://github.com/soybeanjs/ubean/commit/2b252bc)
  - refactor devtools &nbsp;-&nbsp; by @soybeanjs [<samp>(bd86b)</samp>](https://github.com/soybeanjs/ubean/commit/bd86bf5)
- **request**:
  - migrant to "@soybeanjs/fetch" &nbsp;-&nbsp; by @soybeanjs [<samp>(14110)</samp>](https://github.com/soybeanjs/ubean/commit/1411009)
- **routing**:
  - refactor routing config &nbsp;-&nbsp; by @soybeanjs [<samp>(3f073)</samp>](https://github.com/soybeanjs/ubean/commit/3f07320)
- **skills**:
  - move skills to project root with Claude Skills format, fix icon documentation &nbsp;-&nbsp; by @soybeanjs [<samp>(add6b)</samp>](https://github.com/soybeanjs/ubean/commit/add6bfc)
- **uno.config.ts**:
  - clean up imports and format code for consistency &nbsp;-&nbsp; by @soybeanjs [<samp>(0139e)</samp>](https://github.com/soybeanjs/ubean/commit/0139e88)
- **virtual-modules**:
  - add type annotations and remove .ts suffix from IDs &nbsp;-&nbsp; by @soybeanjs [<samp>(60d1b)</samp>](https://github.com/soybeanjs/ubean/commit/60d1b3b)

### &nbsp;&nbsp;&nbsp;📖 Documentation

- split PLAN into docs/ and update roadmap task status &nbsp;-&nbsp; by @soybeanjs [<samp>(72eba)</samp>](https://github.com/soybeanjs/ubean/commit/72ebad3)
- expand framework roadmap and ecosystem plan &nbsp;-&nbsp; by @soybeanjs [<samp>(ef314)</samp>](https://github.com/soybeanjs/ubean/commit/ef3144f)
- update P4-04 note to reflect .reuse.ts format &nbsp;-&nbsp; by @soybeanjs [<samp>(9d559)</samp>](https://github.com/soybeanjs/ubean/commit/9d559b4)
- add implementation specifications &nbsp;-&nbsp; by @soybeanjs [<samp>(15738)</samp>](https://github.com/soybeanjs/ubean/commit/1573808)
- update roadmap to mark P6-11/P6-12/P6-13 as completed &nbsp;-&nbsp; by @soybeanjs [<samp>(de206)</samp>](https://github.com/soybeanjs/ubean/commit/de20631)
- add memory.md documentation about constraints and conventions &nbsp;-&nbsp; by @soybeanjs [<samp>(be286)</samp>](https://github.com/soybeanjs/ubean/commit/be2862f)
- update roadmap - mark P6-12 CRUD frontend complete &nbsp;-&nbsp; by @soybeanjs [<samp>(325d7)</samp>](https://github.com/soybeanjs/ubean/commit/325d793)
- synchronize documentation with latest features (PWA, Auth, Icon, i18n, View Transitions) &nbsp;-&nbsp; by @soybeanjs [<samp>(34d93)</samp>](https://github.com/soybeanjs/ubean/commit/34d935b)
- update all documentation to reflect post-split monorepo architecture &nbsp;-&nbsp; by @soybeanjs [<samp>(cf28c)</samp>](https://github.com/soybeanjs/ubean/commit/cf28c66)
- remove completed task lists and stale references &nbsp;-&nbsp; by @soybeanjs [<samp>(c1c47)</samp>](https://github.com/soybeanjs/ubean/commit/c1c475c)
- update project docs for @ubean/electron integration &nbsp;-&nbsp; by @soybeanjs [<samp>(e0d91)</samp>](https://github.com/soybeanjs/ubean/commit/e0d911e)
- **memory.md**:
  - update memory docs &nbsp;-&nbsp; by @soybeanjs [<samp>(23073)</samp>](https://github.com/soybeanjs/ubean/commit/2307355)
- **plan**:
  - add ubean-studio plan &nbsp;-&nbsp; by @soybeanjs [<samp>(3bf4c)</samp>](https://github.com/soybeanjs/ubean/commit/3bf4c30)
- **projects**:
  - add PLAN &nbsp;-&nbsp; by @soybeanjs [<samp>(0db99)</samp>](https://github.com/soybeanjs/ubean/commit/0db99a2)
  - update roadmap &nbsp;-&nbsp; by @soybeanjs [<samp>(dd320)</samp>](https://github.com/soybeanjs/ubean/commit/dd320d6)
  - update roadmap &nbsp;-&nbsp; by @soybeanjs [<samp>(cae8d)</samp>](https://github.com/soybeanjs/ubean/commit/cae8d5a)
  - optimize docs &nbsp;-&nbsp; by @soybeanjs [<samp>(c838f)</samp>](https://github.com/soybeanjs/ubean/commit/c838f26)
  - update docs &nbsp;-&nbsp; by @soybeanjs [<samp>(8b193)</samp>](https://github.com/soybeanjs/ubean/commit/8b19328)
- **roadmap**:
  - update P6-11 status - Config/Layouts tabs complete &nbsp;-&nbsp; by @soybeanjs [<samp>(e7cc3)</samp>](https://github.com/soybeanjs/ubean/commit/e7cc326)
  - update test counts to 704 &nbsp;-&nbsp; by @soybeanjs [<samp>(d8f3f)</samp>](https://github.com/soybeanjs/ubean/commit/d8f3fce)
  - mark P6-12 CRUD frontend CreateDialog as complete &nbsp;-&nbsp; by @soybeanjs [<samp>(df34a)</samp>](https://github.com/soybeanjs/ubean/commit/df34ac0)
- **routing-modes**:
  - add comprehensive routing modes documentation &nbsp;-&nbsp; by @soybeanjs [<samp>(b5394)</samp>](https://github.com/soybeanjs/ubean/commit/b5394ce)
- **split**:
  - add subpackage splitting docs and task list &nbsp;-&nbsp; by @soybeanjs [<samp>(ca1dc)</samp>](https://github.com/soybeanjs/ubean/commit/ca1dca1)
- **split-tasks**:
  - update task progress to 98% (Phase 7-8 complete) &nbsp;-&nbsp; by @soybeanjs [<samp>(75510)</samp>](https://github.com/soybeanjs/ubean/commit/75510f0)

### &nbsp;&nbsp;&nbsp;📦 Build

- **example**: rename typecheck command &nbsp;-&nbsp; by @soybeanjs [<samp>(f714d)</samp>](https://github.com/soybeanjs/ubean/commit/f714d42)
- **ubean**: add oxc-transform dependency and add server virtual module support &nbsp;-&nbsp; by @soybeanjs [<samp>(38ae1)</samp>](https://github.com/soybeanjs/ubean/commit/38ae1dd)

### &nbsp;&nbsp;&nbsp;🏡 Chore

- fix all ESLint errors and verify npm scripts (P8-06) &nbsp;-&nbsp; by @soybeanjs [<samp>(af91e)</samp>](https://github.com/soybeanjs/ubean/commit/af91eb1)
- merge previous session improvements and fixes &nbsp;-&nbsp; by @soybeanjs [<samp>(9be24)</samp>](https://github.com/soybeanjs/ubean/commit/9be2474)
- **deps**:
  - use TypeScript native bridge &nbsp;-&nbsp; by @soybeanjs [<samp>(c8396)</samp>](https://github.com/soybeanjs/ubean/commit/c8396fd)
  - update deps and use tsc to check type &nbsp;-&nbsp; by @soybeanjs [<samp>(cad95)</samp>](https://github.com/soybeanjs/ubean/commit/cad95df)
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(7ffc3)</samp>](https://github.com/soybeanjs/ubean/commit/7ffc3ab)
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(4af49)</samp>](https://github.com/soybeanjs/ubean/commit/4af49da)
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(f4535)</samp>](https://github.com/soybeanjs/ubean/commit/f45351d)
  - fix markdown-exit version &nbsp;-&nbsp; by @soybeanjs [<samp>(43c5f)</samp>](https://github.com/soybeanjs/ubean/commit/43c5f20)
- **projects**:
  - update deps &nbsp;-&nbsp; by @soybeanjs [<samp>(bb1b8)</samp>](https://github.com/soybeanjs/ubean/commit/bb1b8a4)
  - fix "@soybeanjs/fetch" and vite config &nbsp;-&nbsp; by @soybeanjs [<samp>(44cc2)</samp>](https://github.com/soybeanjs/ubean/commit/44cc286)
  - remove sourcemap and format code &nbsp;-&nbsp; by @soybeanjs [<samp>(f746b)</samp>](https://github.com/soybeanjs/ubean/commit/f746b13)
  - fix versions &nbsp;-&nbsp; by @soybeanjs [<samp>(cf53b)</samp>](https://github.com/soybeanjs/ubean/commit/cf53b37)
  - add tsconfig config for ui and electron packages &nbsp;-&nbsp; by @soybeanjs [<samp>(24e42)</samp>](https://github.com/soybeanjs/ubean/commit/24e421e)
  - add release script &nbsp;-&nbsp; by @soybeanjs [<samp>(2bf65)</samp>](https://github.com/soybeanjs/ubean/commit/2bf65f6)
- **typescript**:
  - add tsconfig.refs.json for subpackage project references &nbsp;-&nbsp; by @soybeanjs [<samp>(6a54e)</samp>](https://github.com/soybeanjs/ubean/commit/6a54e6a)

### &nbsp;&nbsp;&nbsp;✅ Tests

- complete P8-01 public API unit test coverage (685 tests) &nbsp;-&nbsp; by @soybeanjs [<samp>(2adaf)</samp>](https://github.com/soybeanjs/ubean/commit/2adaf7b)
- add Vue SSR rendering integration tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(17348)</samp>](https://github.com/soybeanjs/ubean/commit/1734808)
- add full page rendering pipeline integration tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(f0702)</samp>](https://github.com/soybeanjs/ubean/commit/f070286)
- add markdown processing and error page integration tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(70904)</samp>](https://github.com/soybeanjs/ubean/commit/7090488)
- add CORS, islands bootstrap, route guards and response helpers integration tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(4d47e)</samp>](https://github.com/soybeanjs/ubean/commit/4d47e87)
- **devtools**: add integration tests for layouts/config/customTabs and HTTP middleware &nbsp;-&nbsp; by @soybeanjs [<samp>(da09e)</samp>](https://github.com/soybeanjs/ubean/commit/da09e42)
- **integration**: add full request lifecycle integration tests (P8-03) &nbsp;-&nbsp; by @soybeanjs [<samp>(f3a33)</samp>](https://github.com/soybeanjs/ubean/commit/f3a3384)
- **preset**: add preset capability matrix tests (P8-04) &nbsp;-&nbsp; by @soybeanjs [<samp>(7ba90)</samp>](https://github.com/soybeanjs/ubean/commit/7ba9090)

### &nbsp;&nbsp;&nbsp;🎨 Styles

- **code**: format code &nbsp;-&nbsp; by @soybeanjs [<samp>(6df13)</samp>](https://github.com/soybeanjs/ubean/commit/6df138b)
- **devtools**: fix devtools styles &nbsp;-&nbsp; by @soybeanjs [<samp>(06607)</samp>](https://github.com/soybeanjs/ubean/commit/0660769)
- **projects**: format code &nbsp;-&nbsp; by @soybeanjs [<samp>(d2b09)</samp>](https://github.com/soybeanjs/ubean/commit/d2b09d8)
- **skills**: unify ubean name &nbsp;-&nbsp; by @soybeanjs [<samp>(828c8)</samp>](https://github.com/soybeanjs/ubean/commit/828c881)

### &nbsp;&nbsp;&nbsp;🤖 CI

- **github**: add release workflow for tag push &nbsp;-&nbsp; by @soybeanjs [<samp>(727f4)</samp>](https://github.com/soybeanjs/ubean/commit/727f4b9)
- **github workflows**: update node version &nbsp;-&nbsp; by @soybeanjs [<samp>(3a2c8)</samp>](https://github.com/soybeanjs/ubean/commit/3a2c89c)

### &nbsp;&nbsp;&nbsp;❤️ Contributors

[![soybeanjs](https://github.com/soybeanjs.png?size=48)](https://github.com/soybeanjs)&nbsp;&nbsp;
