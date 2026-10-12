# @ubean/content

**English | [中文](./README.zh-CN.md)**

File-based content collections for ubean — Markdown / MDX / YAML / JSON on disk become a queryable in-memory table, with navigation, section-level full-text search, live request-time collections and prerender route discovery.

```ts
import { queryCollection } from '@ubean/content';

const posts = await queryCollection('blog').where({ _draft: false }).sort('date', 'desc').limit(10).find();
// → ContentDocument[] with frontmatter fields, body AST and a `_path` derived from the file path
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Collections & the Query Builder](#collections--the-query-builder)
- [Navigation](#navigation)
- [Full-Text Search](#full-text-search)
- [Live Collections](#live-collections)
- [Prerender Route Discovery](#prerender-route-discovery)
- [Build Time vs Runtime](#build-time-vs-runtime)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/content` owns the **content pipeline: scan → parse → query → search**, and nothing about how pages are rendered:

| Layer                           | Responsibility                                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/content` (this package) | Source scanning, frontmatter + body parsing, the in-memory collection table, the query builder, navigation trees, section search + `__search.json`, live collections, content → route discovery |
| `@ubean/markdown`               | Markdown-to-HTML parsing for pages; the content package reuses its frontmatter parser and keeps its own AST/definition layer                                                                    |
| `@ubean/build`                  | Consumes `discoverContentPageRoutes` output for prerendering, and wires the Vite plugin into the dev/prod build                                                                                 |
| `@ubean/client`                 | Serves the app runtime that the `useContentSearch` composable runs inside                                                                                                                       |
| `@ubean/seo`                    | Sitemap / robots / metadata; content URLs can be fed in as inputs but are not generated here                                                                                                    |

**Included:**

- `defineCollection` — declare a collection (`{ name, source, type?, schema? }`); `defineContentCollection` / `createContentCollection` are the lower-level core equivalents
- `queryCollection(name)` (+ the `queryContent` alias) → `ContentQueryBuilder` with `where` / `sort` / `limit` / `skip` / `only` / `without` / `find` / `findOne` / `findSurround` / `count`
- `getContentItem`, `getCollection`, `listCollections`, `registerContent`, `configureContentRuntime`
- Navigation: `fetchContentNavigation`, `buildNavigation`
- Search: `generateSearchSections`, `generateSearchSectionsSnapshot`, `createSectionSearch`, `searchSections`, `resolveContentSearchConfig`, `runPagefindIndex`, plus `queryCollectionSearchSections` and the `useContentSearch` composable (`@ubean/content/vue`)
- Live collections: `defineLiveCollection`, `getLiveCollection`, `listLiveCollections`, `clearLiveCollections`
- Prerender discovery: `discoverContentPageRoutes`, `extractContentPageRoutes`
- Scanning / bootstrap: `scanContentSources`, `bootstrapContentFromDisk`, `parseContentFile`, `parseFrontmatter`, `parseMarkdown`, `parseContent`
- Vite plugin at `@ubean/content/vite`: `ubeanContentPlugin` (+ `createContentChangeFilter`)

**NOT included** (owned next door):

- Page rendering, routing and layouts (`@ubean/vue` page routing + your catch-all page)
- The concrete Markdown renderer used for page HTML (`@ubean/markdown`)
- CSS/component styling for search UIs — this package ships data and composables, not components
- A search index server: MiniSearch / Pagefind run in the app or at build time

**Runtime dependency whitelist (main entry): `@ubean/shared`, `defu`, `pathe`, `scule`.** No `vite`, no `vue`, no `node:fs` — the plugin and composable live behind `./vite` and `./vue`.

**Optional peers:** `pagefind` — the Pagefind index build is skipped with a build-time hint when it is not installed (section search over `__search.json` still works); `vite` — required only by the `@ubean/content/vite` plugin; `vue` — required only by `@ubean/content/vue`.

## Install

```bash
pnpm add @ubean/content
# optional peers (loaded lazily, only when enabled):
pnpm add -D pagefind # build-time Pagefind index (skip → fallback to section search)
```

## Quick Start

**1. Enable the module** in `ubean.config.ts`:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  content: {
    sources: {
      blog: { dir: 'content/blog', prefix: '/blog' }
    }
  }
});
```

**2. Put files on disk.** Paths map to `_path`, frontmatter becomes document fields:

```md
---
title: Hello
date: 2026-01-01
draft: false
---

# Hello

Body content.
```

**3. Read routes through a catch-all page**, and query the collection from anywhere:

```vue
<!-- src/pages/blog/[...slug].vue -->
<script setup lang="ts">
import { queryCollection } from '@ubean/content';

const route = useRoute();
const doc = await queryCollection('blog').where({ _path: route.path }).findOne();
</script>

<template>
  <article>
    <h1>{{ doc?.title }}</h1>
  </article>
</template>
```

Running example: [`examples/ubean-test/src/pages/blog/[...slug].vue`](../../examples/ubean-test/src/pages/blog/[...slug].vue) with its collection configured in [`examples/ubean-test/ubean.config.ts`](../../examples/ubean-test/ubean.config.ts).

## Collections & the Query Builder

`defineCollection` registers a collection with the runtime; `getCollection` / `listCollections` inspect the registry. `queryCollection(name)` is `async` because it awaits `collection.list()` before building a chain:

```ts
import {
  defineCollection,
  fetchContentNavigation,
  getCollection,
  getContentItem,
  queryCollection
} from '@ubean/content';

defineCollection({ name: 'blog', source: 'content/blog', type: 'page' });

const { name, source } = getCollection('blog')!;

const posts = await queryCollection('blog')
  .where('date', '>=', '2026-01-01')
  .sort('date', 'desc')
  .only(['title', 'date', '_path'])
  .find();

const one = await queryCollection('blog').where({ _path: '/blog/hello' }).findOne();

const [prev, next] = await queryCollection('blog').findSurround('/blog/hello', { before: 1, after: 1 });

const count = await queryCollection('blog').where({ _draft: false }).count();
```

Builder surface: `where(field, operator, value)` or `where({ field: value })`, `sort(field, 'asc' | 'desc')`, `limit(n)`, `skip(n)`, `only(fields)`, `without(fields)`, then a terminal `find()` / `findOne()` / `findSurround(path, { before, after })` / `count()`. Supported operators: `=` / `==` / `!=` / `>` / `>=` / `<` / `<=` / `contains` / `in` / `exists`.

`getContentItem(collection, path)` is the direct single-document lookup and returns `null` when the collection or path is unknown; `queryCollection` throws when the collection is not registered.

## Navigation

`fetchContentNavigation` builds a hierarchical tree from documents and memoizes the all-collections result:

```ts
import { fetchContentNavigation } from '@ubean/content';

const nav = await fetchContentNavigation('blog'); // ContentNavigationItem[]
const everything = await fetchContentNavigation(); // all collections, cached
```

Draft and partial documents (`draft: true` or a `_draft` / `_partial` filename segment) are excluded from the tree.

## Full-Text Search

Search is **section-level**: each document is split by heading level into sections carrying a title, the parent-heading chain, an anchor `id` (e.g. `/guide/components#button`) and plain-text content. Code blocks are stripped.

```ts
import { generateSearchSections, queryCollectionSearchSections } from '@ubean/content';

const sections = await queryCollectionSearchSections('blog');
// → SearchSection[] { id, title, titles, level, content }
```

The Vite plugin writes `dist/public/__search.json` (a `Record<collectionName, SearchSection[]>`) and, when `pagefind` is installed, also builds `dist/public/pagefind/`. In dev the same payload is served from `/__search.json`, so search behaves identically in both modes.

Client side, use the composable from `@ubean/content/vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useContentSearch } from '@ubean/content/vue';

const query = ref('');
const { status, results, search } = useContentSearch({
  searchOptions: { loadMiniSearch: () => import('minisearch') }
});
</script>
```

- Data source priority: `options.sections` (SSR-passed) → `fetch(options.sectionsUrl ?? '/__search.json')`.
- Return shape: `{ status: 'idle' | 'loading' | 'ready' | 'error', error, results, init(), search(query, options?) }`.
- **`loadMiniSearch` must be a literal dynamic import in your own source.** The package's default loader is `import(variable)` with `@vite-ignore`, which only resolves in Node; in the browser it throws `Failed to resolve module specifier "minisearch"` and silently degrades to the fallback engine. Pass `() => import('minisearch')` so Vite can resolve and pre-bundle it.
- `searchOptions` defaults to `{ prefix: true, fuzzy: 0.2 }`; the active engine is reported as `'minisearch'` or `'fallback'`.

For a custom pipeline, `createSectionSearch(sections, options)` and `searchSections(...)` are the engine-level entry points; `generateSearchSectionsSnapshot(snapshot, options)` maps a `Record<string, ContentDocument[]>` snapshot to the same payload shape at build time.

## Live Collections

Live collections fetch from a CMS, API or database **at request time** instead of from disk at build time:

```ts
import { defineLiveCollection, getLiveCollection, queryCollection } from '@ubean/content';

defineLiveCollection({
  name: 'products',
  cache: { ttl: 60 },
  loader: async ({ path, filter }) => {
    const res = await fetch(`https://api.example.com/products`);
    return res.json();
  }
});

const entries = await getLiveCollection('products');
const cheap = await queryCollection('products').where('price', '<', 20).find();
```

- Loader signature: `(params: { path?, filter? }) => Promise<LiveCollectionEntry[]>`; entries need at least `_id` and `_path`.
- Optional `cache: { ttl }` keeps results in memory for the given number of seconds; optional `schema` validates entries.
- Registered live collections support the full query builder (`where` / `sort` / `limit` / `skip` / `only` / `without`) through `queryCollection`.
- `listLiveCollections()` and `clearLiveCollections()` inspect / reset the registry.

## Prerender Route Discovery

Content URLs are discovered from the source directory so the prerenderer can crawl them without a link graph:

```ts
import { discoverContentPageRoutes, extractContentPageRoutes } from '@ubean/content';

const routes = await discoverContentPageRoutes('content/blog', { prefix: '/blog' });
// → string[] URLs ready for prerender.include
```

`extractContentPageRoutes(docs, options)` is the pure mapping step over already-parsed documents; `discoverContentPageRoutes(rootDir, options)` scans the directory and maps the result. Both drop draft/partial documents and apply `options.prefix`; `options.includeDrafts` opts back in. Pair the output with a catch-all page and feed it into your prerender include list — the SSG walkthrough lives in [`examples/ssg-catchall`](../../examples/ssg-catchall).

## Build Time vs Runtime

The same table feeds dev, prerender and production SSR, but the source of truth differs:

| Environment    | Who fills the collection table                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Dev            | `ubeanContentPlugin` scans on start and on change (`scanContentSources` → `registerContent`)                  |
| Tests / script | `bootstrapContentFromDisk(rootDir, options)` fills the table from disk                                        |
| Production SSR | The server entry inlines a snapshot of the scanned collections — **no runtime dependency on the Vite plugin** |

`scanContentSources(rootDir, options)` returns `Record<string, ContentDocument[]>` over a configurable `sources` map (default directory `content`, walking `.md` / `.mdx` / `.json` / `.yaml` / `.yml`). `parseContentFile(raw, filePath, options?)` is the single-file entry used by both paths.

Vite plugin options (`ubeanContentPlugin`, `UbeanContentOptions`): `sources`, `defaultDir`, `ignores` (default `['draft', 'partial', '.']`), `markdown`, `navigation`, `experimental`, `search`. It exposes the `virtual:ubean-content` module (plus one module per collection) exporting `collections` and `getCollection(name)`.

## Type Safety

- `ContentDocument` carries the `_`-prefixed computed fields (`_id`, `_path`, `_dir`, `_file`, `_type`, `_extension`, `_draft`, `_partial`, `_empty`), the common frontmatter fields (`title`, `description`, `date`, `draft`, `partial`, `navigation`), an optional `body: ContentBody`, and an open index signature for custom frontmatter.
- `ContentCollection`, `ContentQueryBuilder`, `ContentNavigationItem`, `ContentSourceScanConfig`, `ContentSchema` / `ContentFieldSchema`, `ContentModuleOptions` define the authoring surface.
- `ContentType` is the parsed file type union (`'markdown' | 'mdx' | 'json' | 'yaml' | 'csv' | 'html'`) exposed on `_type`.
- Search types: `SearchSection`, `SearchHit`, `SectionSearchEngine`, `SectionSearchOptions`, `GenerateSearchSectionsOptions`, `ContentSearchOptions`, `UseContentSearchOptions`, `UseContentSearchReturn`.
- Live types: `LiveCollection`, `LiveCollectionOptions`, `LiveCollectionEntry`, `LiveCollectionLoader`, `LiveCollectionLoaderParams`, `LiveCollectionCacheOptions`.
- Routing types: `ContentPageRouteOptions`, `DiscoverContentPageRoutesOptions`, `ScanContentSourcesOptions`.
- A collection's `schema` is validated per document at load time, so invalid frontmatter fails the build rather than the page render.

## Architecture Notes

- **Content documents are plain data.** Querying, navigation and search all operate on `ContentDocument` objects — no framework instance is needed, so the same code runs in the Vite plugin, a build script and the server runtime.
- **The engine is decoupled from the index.** `createSectionSearch` returns `{ engine: 'minisearch' | 'fallback', search }` and the fallback is always available, so a missing MiniSearch never breaks search — it changes ranking quality only.
- **CJK tokenization uses `Intl.Segmenter`** with a unigram + bigram fallback, so Chinese/Japanese text is searchable without an external tokenizer.
- **Draft/partial filtering is repeated at every layer** — navigation, search payload and route discovery each drop them, so an accidentally published draft cannot leak through only one of the paths.
- **Prerender discovery is a pure function of the documents**, which keeps it usable from `ubean build` and from custom scripts alike (see [`docs/adr/0011-lightweight-ssg-direct-render.md`](../../docs/adr/0011-lightweight-ssg-direct-render.md) for how the SSG path consumes those routes).
