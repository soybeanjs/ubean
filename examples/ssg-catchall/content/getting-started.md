# Getting Started

Welcome to the ssg-catchall example. This page exercises the full-text search
pipeline: content collections scanned at build time, split into sections by
headings, and serialized to `__search.json` for `useContentSearch`.

## Installation

Install dependencies with pnpm:

```bash
pnpm install
```

## Build

Run the SSG build to prerender pages and generate the search index payload:

```bash
pnpm build
```

After the build, `dist/__search.json` contains one entry per document section.
Draft documents (frontmatter `draft: true`) are excluded automatically.

## Preview

Start the static preview server:

```bash
pnpm preview
```
