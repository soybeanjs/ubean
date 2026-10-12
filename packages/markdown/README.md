# @ubean/markdown

**English | [中文](./README.zh-CN.md)**

Markdown parsing for ubean — frontmatter, headings, excerpt, Markdown→HTML, plus optional MDX compilation.

A tiny leaf parser: one runtime dependency (`markdown-exit`), no `@ubean/*` dependency, and no file-system or framework awareness. It parses strings and returns data.

```ts
import { parseMarkdown } from '@ubean/markdown';

const { frontmatter, content, excerpt, headings, html } = parseMarkdown(source);
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Frontmatter](#frontmatter)
- [Markdown → HTML](#markdown--html)
- [Headings & Excerpt](#headings--excerpt)
- [MDX](#mdx)
- [MDX Vite Plugin & JSX Runtime](#mdx-vite-plugin--jsx-runtime)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| What this package is responsible for                                                                                                                                    | What it is not — owner instead                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Parsing a Markdown **string**: `parseFrontmatter`, `parseMarkdown`, `markdownToHtml`, `extractHeadings`, `extractExcerpt`                                               | Reading files from disk, watching directories, aggregating content collections → `@ubean/content`       |
| A minimal, indentation-aware **YAML subset parser** for frontmatter (nested maps, block sequences, dotted keys, quoted strings, inline arrays, booleans, null, numbers) | Full YAML support (anchors, multi-line strings `\|`/`>`, flow maps `{}`) → not provided by ubean at all |
| Optional **MDX → Vue component** compilation (`compileMdx`) and the Vite transform plugin (`ubeanMdxPlugin`)                                                            | Vue SFC compilation and the Vite plugin pipeline itself → `@ubean/builder`                              |
| A Vue **JSX runtime** (`jsx`, `jsxs`, `Fragment` from `/jsx-runtime`) so MDX output can render as Vue components                                                        | General-purpose Vue JSX support — use the standard Vue JSX toolchain                                    |
| The `defineMarkdownPage(frontmatter)` identity helper used by the page-routing macro path                                                                               | Route registration and page scanning → `@ubean/vue` / `@ubean/scan`                                     |

**Runtime dependency whitelist (main entry): `markdown-exit` only** — no `vue`, no `@mdx-js/mdx`, no `node:*`. `/mdx` and `/jsx-runtime` are separate subpaths precisely so the Vue import and the MDX compiler stay out of the main entry.

**Optional peers:** `@mdx-js/mdx` (`^3.0.0`, optional) and `vue` (`^3.0.0`). When `@mdx-js/mdx` is absent, `compileMdx()` does not fail — it falls back to rendering the body with `markdownToHtml()` and emits a plain Vue component that renders the HTML through `innerHTML`, and `compiled` in the result is `false`. `isMdxAvailable()` reports which mode you are in.

## Install

```bash
pnpm add @ubean/markdown

# Optional: real MDX compilation with JSX support
pnpm add -D @mdx-js/mdx
```

## Quick Start

```ts
import { parseMarkdown, markdownToHtml, parseFrontmatter, extractHeadings, extractExcerpt } from '@ubean/markdown';

const source = `---
title: Hello
date: 2026-08-01
---

# Hello

The body.
`;

parseFrontmatter(source);
// { data: { title: 'Hello', date: '2026-08-01' }, content: '\n# Hello\n\nThe body.\n' }

const parsed = parseMarkdown(source);
parsed.frontmatter.title; // 'Hello'
parsed.headings; // [{ level: 1, text: 'Hello', id: 'hello' }]
parsed.excerpt; // '\n# Hello…' — see Headings & Excerpt
parsed.html; // '<h1 id="hello">Hello</h1>\n<p>The body.</p>'

markdownToHtml('# Hello'); // '<h1 id="hello">Hello</h1>'
```

## Frontmatter

`parseFrontmatter(source)` splits off a leading `---` … `---` block and returns `{ data, content }`. When there is no block it returns `{ data: {}, content: source }` — the input is passed through untouched.

```ts
import { parseFrontmatter } from '@ubean/markdown';

const { data } = parseFrontmatter(`---
title: Post
seo:
  description: About the post
tags:
  - a
  - b
draft: true
---`);
// { title: 'Post', seo: { description: 'About the post' }, tags: ['a', 'b'], draft: true }
```

`MarkdownFrontmatter` documents `title` / `description` / `date` / `layout` / `path` / `seo` / `meta` / `head` and allows any additional key. The built-in parser understands this YAML subset:

- nested maps by indentation, block sequences (`- item`, and `- key: value` map items)
- dotted keys (`a.b: v` becomes nested), quoted strings, inline arrays, `true`/`false`/`null`/`~`, and numbers
- a bare `key:` with no children is kept as `true`

Anchors, multi-line strings (`|` / `>`), and flow maps (`{}`) are **not** supported.

## Markdown → HTML

```ts
import { markdownToHtml } from '@ubean/markdown';

const html = markdownToHtml(source, {
  html: false, // allow raw HTML in Markdown (default false)
  linkify: true, // auto-link bare URLs (default true)
  breaks: false, // single newline → <br> (default false)
  typographer: false, // smart quotes / dashes (default false)
  headingIds: true, // add slugified `id` to headings (default true)
  highlighter: (code, lang) => myHighlight(code, lang) // custom code highlighter
});
```

The `highlighter` return value is wrapped in `<pre><code class="language-{lang}">…</code></pre>` unless it already starts with `<pre`. Heading ids are slugified — lowercased, HTML tags stripped, non-word characters removed (CJK characters `\u4e00-\u9fa5` are kept), spaces collapsed to `-`.

## Headings & Excerpt

```ts
import { extractHeadings, extractExcerpt } from '@ubean/markdown';

extractHeadings('## A\n\n### B');
// [{ level: 2, text: 'A', id: 'a' }, { level: 3, text: 'B', id: 'b' }]

extractExcerpt('Intro paragraph.\n\n<!-- more -->\n\nRest.');
// 'Intro paragraph.'

extractExcerpt('# Title\n\n- list\n\nFirst real paragraph.');
// 'First real paragraph.'
```

`extractExcerpt(markdown, separator = '<!-- more -->')` returns everything before the separator when present. Otherwise it walks paragraphs in order and returns the first one that is not a heading, fenced code block, blockquote, list item, or ordered-list item, and is shorter than 500 characters; if none qualifies it returns `undefined`.

## MDX

`/mdx` compiles MDX (Markdown + JSX) into a Vue component module. This is where the optional `@mdx-js/mdx` peer is used.

```ts
import { compileMdx, isMdxAvailable, isMdxAvailableSync } from '@ubean/markdown/mdx';

await isMdxAvailable(); // false when @mdx-js/mdx is not installed

const { code, frontmatter, compiled } = await compileMdx(source, {
  filePath: 'post.mdx',
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
  development: false
});
// compiled: true  → real MDX output importing from `@ubean/markdown/jsx-runtime`
// compiled: false → plain-markdown fallback component rendering `innerHTML`
```

- `compileMdx()` extracts frontmatter first, then compiles the body with `format: 'mdx'` and `jsxImportSource: '@ubean/markdown'` so the generated module imports from the package's own JSX runtime.
- `isMdxAvailable()` dynamically probes for the peer and caches the result; `isMdxAvailableSync()` returns the cached answer without importing anything (it is `false` until a previous async check ran).
- `frontmatter` is returned in both modes, so callers do not need to branch on `compiled` to read metadata.

## MDX Vite Plugin & JSX Runtime

`ubeanMdxPlugin(options)` is the Vite transform that compiles `.mdx` files in the module pipeline (invoked by the framework when `markdown.mdx` is enabled). It is exported from the main entry — `@ubean/markdown` has no `./vite` subpath.

```ts
import { ubeanMdxPlugin } from '@ubean/markdown';

ubeanMdxPlugin({
  include: /\.mdx$/, // defaults to /\.mdx$/
  exclude: /node_modules/,
  remarkPlugins: [],
  rehypePlugins: []
});
```

`MdxVitePluginOptions`: `remarkPlugins`, `rehypePlugins`, `include`, `exclude`. The plugin enforces `pre`, compiles through `compileMdx()`, emits an identity source map, and forces a full reload on `.mdx` changes rather than attempting HMR. A compile error is surfaced through Vite's `this.error` with the file id.

## Type Safety

- All parser signatures are fully typed: `parseMarkdown(source, options?)` returns `ParsedMarkdown` (`frontmatter` / `content` / `excerpt?` / `headings` / `html?`), and `markdownToHtml` returns `string`.
- `MarkdownFrontmatter` has an index signature (`[key: string]: unknown`), so custom frontmatter keys stay reachable but are explicitly `unknown` — narrow before use.
- `MarkdownOptions` / `MdxOptions` / `MdxCompileResult` / `MdxVitePluginOptions` are exported types, so options objects are checked at the call site.
- No global type augmentation and no module-level mutable state is exposed — the MDX compiler cache is internal.

## Architecture Notes

- **Pure string in, data out.** Nothing in the main entry touches the file system, the Vite server, or Vue. This is why it can be used from build scripts, SSR renderers, and content pipelines alike.
- **`markdown-exit` is the only engine.** Headings are extracted by walking the token tree of a second `markdown-exit` instance; excerpt extraction is regex/paragraph-based and does not depend on the parser.
- **The MDX peer is loaded dynamically and cached once.** `getMdxCompiler()` memoizes either the compiler or `null`, so the availability check runs a single dynamic `import('@mdx-js/mdx')` per process.
- **The fallback is a real path, not an error.** Without `@mdx-js/mdx`, MDX files still render (as Markdown with an `innerHTML` wrapper) and `compiled` tells the caller which path ran.
- **`defineMarkdownPage(frontmatter)` is an identity function.** It exists for the page-routing macro path and does no parsing of its own.
