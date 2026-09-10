---
title: Content & Search
description: Content collections with Markdown files and built-in full-text search for SSG sites — sections payload, useContentSearch, and optional Pagefind index.
---

# Content & Search

`@ubean/content` turns a `content/` directory of Markdown files into queryable collections, and ships built-in full-text search for static sites — zero search dependencies required by default.

## Enable the Content Module

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  content: true // or { sources: { docs: { dir: 'content/docs' } } }
});
```

Markdown files under `content/` (default) become documents with parsed frontmatter, body AST, and a `_path` derived from the file path:

```
content/
├── getting-started.md      → /getting-started
├── guide/
│   └── components.md       → /guide/components
└── zh/
    └── guide.md            → /zh/guide
```

Documents with `draft: true` frontmatter (or `_draft` filenames) and `_partial` files are excluded from navigation and search.

## Querying Collections

Use the query builder for structured access:

```ts
import { queryCollection } from '@ubean/content';

const docs = await queryCollection('content')
  .where({ _draft: false })
  .order('_path', 'asc')
  .all();
```

Content routes are auto-discovered for prerendering — pair a catch-all page (`pages/[...slug].vue`) with the content collections to render them.

## Full-Text Search

Search works out of the box in `ssg` mode (and can be enabled explicitly elsewhere). Documents are split into **sections** by headings — each section carries its title, the parent heading chain, an anchor `id` (`/guide/components#button`), and plain-text content. Code blocks are excluded; draft/partial documents are filtered.

The build produces two artifacts:

| Artifact | Location | Purpose |
| --- | --- | --- |
| `__search.json` | `dist/public/__search.json` | Section payload for `useContentSearch()` |
| Pagefind index | `dist/public/pagefind/` | Chunked index, generated when the optional `pagefind` dev dependency is installed |

The dev server also serves `/__search.json` (same shape as the SSG output), so search behaves identically in dev and production.

### `useContentSearch()`

The composable (from `@ubean/content/vue`) fetches the payload and runs the search engine client-side:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useContentSearch } from '@ubean/content/vue';

const query = ref('');
const { status, results, search } = useContentSearch();

async function onSubmit() {
  await search(query.value);
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input v-model="query" type="search" aria-label="Search docs" />
  </form>

  <p>status: {{ status }}</p>
  <ul v-if="results.length">
    <li v-for="hit in results" :key="hit.id">
      <a :href="hit.id">
        <span v-for="t in hit.titles" :key="t">{{ t }} ›</span>
        {{ hit.title }}
      </a>
      <p>{{ hit.content.slice(0, 120) }}</p>
    </li>
  </ul>
</template>
```

Options:

| Option | Default | Description |
| --- | --- | --- |
| `sections` | — | Provide sections directly (skip the fetch); accepts an array or async factory |
| `sectionsUrl` | `/__search.json` | Payload URL |
| `collections` | all | Restrict search to one or more collections (`'docs'` or `['docs', 'blog']`) |
| `immediate` | `true` | Initialize the engine eagerly; `false` defers to the first `search()` call |
| `searchOptions` | — | Engine weights / MiniSearch options |

Each hit is a `SearchHit`: `{ id, title, titles, level, content, score }` — `titles` is the parent heading chain for rendering breadcrumbs, `id` doubles as the anchor link.

### Search Engines

No search dependency is required:

- **Built-in fallback engine** — exact/prefix matching with title-over-content weighting. Always available, zero payload.
- **MiniSearch** (optional) — fuzzy and prefix matching. Install `minisearch` in your app to upgrade the engine automatically; both engines share the same tokenizer.

CJK text (Chinese, Japanese, Korean) is segmented with `Intl.Segmenter`, with a unigram+bigram fallback where unavailable — searching `安装` or `组件` works without extra configuration.

### Pagefind (optional)

For large sites (thousands of pages), install Pagefind to get a chunked index that loads on demand per query term:

```bash
pnpm add -D pagefind
```

Re-run the build — `dist/public/pagefind/` is generated (language-aware, e.g. `en` + `zh-cn` indexes). Without the dependency, the build logs a hint and skips index generation gracefully; `__search.json` still works.

### Server-Side Sections

To build custom search payloads (e.g. SSR-rendered results), query sections directly:

```ts
import { queryCollectionSearchSections } from '@ubean/content';

const sections = await queryCollectionSearchSections('content');
// → SearchSection[]: { id, title, titles, level, content }
```

### Configuration

```ts
export default defineConfig({
  content: {
    search: {
      provider: 'pagefind', // default; false to disable
      sections: true,       // emit __search.json (default true)
      pagefind: { verbose: true } // options passed to Pagefind createIndex()
    }
  }
});
```

In `ssg` mode search is enabled by default; in other modes set `provider: 'pagefind'` to opt in. `search: false` disables both artifacts.

## Example

See [`examples/ssg-catchall`](https://github.com/soybeanjs/ubean/tree/main/examples/ssg-catchall) for a working fixture: multilingual content (en/zh), a draft filter case, and a `/search` page using `useContentSearch()` — verified end-to-end with SSG build, preview server, and browser interaction.
