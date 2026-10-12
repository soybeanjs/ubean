# @ubean/seo

**English | [中文](./README.zh-CN.md)**

SEO toolkit for ubean — metadata merging, head management, robots / sitemap / manifest responses, file conventions, JSON-LD and OG image generation.

`@ubean/seo` owns the **server-side and isomorphic SEO surface**: merging metadata across layers, rendering robots.txt / sitemap.xml / manifest.webmanifest, discovering the `src/sitemap.ts` style convention files, producing JSON-LD, and rendering Open Graph images behind an optional-peer subpath.

```ts
import { useSeoMeta } from '@ubean/seo';

useSeoMeta({
  title: 'ubean',
  description: 'Full-stack Vue meta-framework',
  openGraph: { type: 'website' }
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Metadata Merging](#metadata-merging)
- [Head Rendering](#head-rendering)
- [robots.txt / sitemap.xml / manifest.webmanifest](#robotstxt--sitemapxml--manifestwebmanifest)
- [File Conventions](#file-conventions)
- [JSON-LD](#json-ld)
- [OG Image](#og-image)
- [Optional Peers](#optional-peers)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/seo` is the **SEO data and response layer**, deliberately framework-glue-free:

| Layer                   | Responsibility                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/seo` (this pkg) | Metadata types + merging, robots/sitemap/manifest responses, file-convention discovery, JSON-LD, OG image rendering                      |
| `@ubean/client`         | Provides the **usable** `useSchemaOrg` (pushes through unhead) and re-exports the pure JSON-LD helpers; owns page/layout/app head layers |
| `@ubean/vue`            | Page-level head declaration via `definePage({ head })`; the plugin that reads it                                                         |
| `@ubean/app`            | Calls `registerSeoConventions()` in `init()` (unless `seoConventions: false`) and mounts the convention routes                           |
| `@unhead/vue`           | The head manager itself — `useSeoMeta` here is a thin wrapper over it                                                                    |

**Included:**

- `useSeoMeta` (Vue-side wrapper that degrades safely outside a setup context)
- Metadata merging and dedupe: `mergeMetadata`, `mergeSeoLayers`, `dedupeMetaTags`, `dedupeLinkTags`
- Response builders: `createRobotsResponse`, `createSitemapResponse`, `createManifestResponse`, plus `formatRobotsTxt` / `formatSitemapXml` / `escapeXml`
- Config helpers: `defineRobotsConfig`, `defineSitemapConfig`, `defineManifest`
- File conventions (`/conventions`): `registerSeoConventions`, `listSeoConventions`, `discoverSeoConventions`, `conventionKindFromPath`, `SEO_CONVENTIONS`
- JSON-LD (`/json-ld`): `defineJsonLd`, `renderJsonLdScript`, `renderJsonLdScripts`, `serializeJsonLd`, `mergeJsonLd`, `schemaOrg.*`
- OG image (`/og-image`): `ImageResponse`, `renderOgImage`, `renderArticleOgImage`, `defaultTemplate`, `articleTemplate`, `renderToImage`, font loaders

**NOT included:**

- Head state management, `useHead`, page/layout head layers and the head instance — `@unhead/vue` (wrapped by `@ubean/client`)
- The `<Head>` / `<Link>` components — `@ubean/vue` / `@ubean/client`
- Route registration and the Hono app — `@ubean/app`; this package only exposes the handlers conventions return
- Server routing, `defineHandler`, request validation — `@ubean/routes` / `@ubean/app`
- Image optimization at the component level — `@ubean/image` (OG image rendering here is a build/request-time image generator, not the `@ubean/image` pipeline)

**Runtime dependency whitelist (main entry): `@unhead/vue`, `pathe`.** The main entry imports only `./json-ld` plus `@unhead/vue`, so it is browser-safe. The `/conventions` and `/og-image` subpaths statically import `node:fs` and are therefore **deliberately not re-exported** from the main barrel — import them from their subpaths on the server. `satori` and `@resvg/resvg-js` are **optional peers** used only for PNG rendering.

## Install

```bash
pnpm add ubean          # or: pnpm add @ubean/seo
# optional peers — only needed for PNG OG images:
pnpm add satori @resvg/resvg-js
```

## Quick Start

**1. Page-level SEO** — the page head field is declared in `definePage`; `useSeoMeta` is for dynamic values:

```ts
// src/pages/index.vue (script setup)
useSeoMeta({
  title: 'ubean',
  description: 'Full-stack Vue meta-framework',
  openGraph: { type: 'website', images: [{ url: '/og.png' }] },
  twitter: { card: 'summary_large_image' }
});
```

**2. robots.txt and sitemap.xml as files** — put them in `src/` and they are served automatically:

```ts
// src/robots.ts
import { defineRobotsConfig } from '@ubean/seo';

export default defineRobotsConfig({
  userAgent: '*',
  allow: '/',
  disallow: ['/admin', '/api'],
  sitemap: 'https://example.com/sitemap.xml'
});
```

```ts
// src/sitemap.ts
import { defineSitemapConfig } from '@ubean/seo';

export default defineSitemapConfig([
  { loc: '/', changefreq: 'weekly', priority: 1 },
  { loc: '/about', changefreq: 'monthly', priority: 0.5 }
]);
```

**3. An OG image** — either as a convention file or directly in a route:

```ts
// src/opengraph-image.ts
import { renderOgImage } from '@ubean/seo/og-image';

export default () => renderOgImage({ title: 'ubean', description: 'Full-stack Vue meta-framework', siteName: 'ubean' });
```

## Metadata Merging

```ts
import { mergeMetadata, mergeSeoLayers, dedupeMetaTags, dedupeLinkTags } from '@ubean/seo';

const merged = mergeSeoLayers(globalMeta, layoutMeta, pageMeta); // page > layout > global
const meta = dedupeMetaTags(merged.meta ?? []);
const link = dedupeLinkTags(merged.link ?? []);
```

- `mergeMetadata(...metadatas)` folds any number of layers; later layers win. `mergeSeoLayers(global?, layout?, page?)` is the fixed three-layer form.
- `dedupeMetaTags(tags: MetaTag[])` dedupes by `name` / `property` (last wins); `dedupeLinkTags(tags: LinkTag[])` by `rel` plus `hreflang` / `type` / `sizes`.
- `buildMetaTags` / `buildLinkTags` / `buildTitle` expose the individual projections; `renderHeadTags(meta, fallbackTitle?)` serializes a layer to an HTML string.

## Head Rendering

`useSeoMeta<T extends Record<string, any>>(meta: T): T` wraps `@unhead/vue`'s `useSeoMeta` and **swallows errors outside a setup context**, so a module-level call degrades to a no-op instead of throwing. Import it from `@ubean/client` in application code — that is the same function, plus the usable `useSchemaOrg`.

## robots.txt / sitemap.xml / manifest.webmanifest

```ts
import { createManifestResponse, createRobotsResponse, createSitemapResponse } from '@ubean/seo';

// GET /robots.txt
return createRobotsResponse({ userAgent: '*', allow: '/', sitemap: 'https://example.com/sitemap.xml' });
// GET /sitemap.xml
return createSitemapResponse([{ loc: 'https://example.com/', lastmod: new Date(), priority: 1 }]);
// GET /manifest.webmanifest
return createManifestResponse({ name: 'ubean', short_name: 'ubean', display: 'standalone', theme_color: '#ffffff' });
```

| Builder                  | Content-Type                               | Cache-Control           |
| ------------------------ | ------------------------------------------ | ----------------------- |
| `createRobotsResponse`   | `text/plain; charset=utf-8`                | `public, max-age=3600`  |
| `createSitemapResponse`  | `application/xml; charset=utf-8`           | `public, max-age=3600`  |
| `createManifestResponse` | `application/manifest+json; charset=utf-8` | `public, max-age=86400` |

`formatRobotsTxt` / `formatSitemapXml` / `escapeXml` are the string-level helpers behind them. `RobotsOptions = { userAgent?, allow?, disallow?, sitemap?, crawlDelay? }` accepts a string or an array for `allow` / `disallow` / `sitemap` (an array or an array of same-user-agent groups renders multiple blocks). `SitemapUrl = { loc, lastmod?, changefreq?, priority? }`.

## File Conventions

Drop a file into `src/` and the route exists — `@ubean/app` calls `registerSeoConventions()` during `init()` unless the app is created with `seoConventions: false`:

| File in `src/`       | Route                       | Default export returns             |
| -------------------- | --------------------------- | ---------------------------------- |
| `sitemap.ts`         | `GET /sitemap.xml`          | `SitemapUrl[]` or a Promise of it  |
| `robots.ts`          | `GET /robots.txt`           | `RobotsOptions \| RobotsOptions[]` |
| `manifest.ts`        | `GET /manifest.webmanifest` | `WebAppManifest`                   |
| `opengraph-image.ts` | `GET /opengraph-image`      | `Response`                         |
| `icon.ts`            | `GET /icon`                 | `Response`                         |
| `apple-icon.ts`      | `GET /apple-icon`           | `Response`                         |

```ts
import { listSeoConventions, registerSeoConventions } from '@ubean/seo/conventions';

listSeoConventions({ srcDir: 'src' }); // → ['robots', 'sitemap'] without loading anything
await registerSeoConventions(app, { srcDir: 'src' });
```

- Extensions are probed in the order `['.ts', '.js', '.mjs', '.mts', '.cjs']`; override with `extensions`, and filter with `enabled` / `disabled` (arrays of `SeoConventionKind`).
- A missing file is skipped silently, as is a module whose default export is not a function — a placeholder file is harmless.
- Conventions are mounted **after** user routes, so an explicit route in `src/routes/` always wins.
- `registerSeoConventions` registers routes on the app; `SeoConventionApp` is a structural `{ get(path, ...handlers) }` type, so this package does not depend on `@ubean/app`.
- For serverless deployments, pre-glob the files and pass them to `registerSeoConventionModules(app, modules)` to avoid filesystem reads; `conventionKindFromPath(filePath)` maps a path to its kind.

## JSON-LD

```ts
import { defineJsonLd, renderJsonLdScript, schemaOrg } from '@ubean/seo/json-ld';

const schema = schemaOrg.article({
  headline: 'Hello ubean',
  author: 'Ada',
  datePublished: '2026-01-01',
  image: 'https://example.com/cover.png'
});

defineJsonLd(schema); // register (client: use useSchemaOrg from @ubean/client)
renderJsonLdScript(schema); // <script type="application/ld+json">…</script>
```

- Factories are exactly `organization({ name, url?, logo?, sameAs? })`, `website({ name, url, description? })`, `article({ headline, author, datePublished, description?, image?, publisher? })`, `breadcrumb([{ name, url }])` and `product({ name, description?, brand?, sku?, price?, priceCurrency?, availability? })`.
- `renderJsonLdScript` splits `</script>` into `<\/script>` and escapes U+2028 / U+2029, so a schema containing HTML cannot break out of the tag. `serializeJsonLd` is the shared implementation `@ubean/client` reuses.
- `defineJsonLd` / `useSchemaOrg` inside this package are the **isomorphic fallback**: they push to `globalThis.__UBEAN_HEAD__`, which nothing registers, so they cannot reach a real head on their own. In a Vue app call `useSchemaOrg` from `@ubean/client` (it goes through unhead's `useHead`).
- `mergeJsonLd` / `renderJsonLdScripts` combine and serialize several schemas.

## OG Image

```ts
import { ImageResponse, isOgImageSupported, renderArticleOgImage, renderOgImage } from '@ubean/seo/og-image';

if (await isOgImageSupported()) {
  const response = await renderOgImage({
    title: 'ubean',
    description: 'Full-stack Vue meta-framework',
    siteName: 'ubean',
    themeColor: '#3b82f6'
  });
  // response.headers.get('Content-Type') === 'image/png'
}

export default () => new ImageResponse(defaultTemplate({ title: 'Hello' }), { width: 1200, height: 630 });
```

- `OgTemplateInput = { title, description?, siteName?, logo?, themeColor?, textColor?, backgroundImage? }` — `title` is required; `OgImageOptions` adds `width` (1200) / `height` (630) / `fonts` / `svgOnly` / `resvgOptions` / `cacheControl` (`public, max-age=86400`) / `debug`.
- `renderOgImage` uses the default template; `renderArticleOgImage` adds `author` / `date` and uses the article template. `defaultTemplate` / `articleTemplate` return the Satori VDOM if you want to compose your own, and `renderToImage(node, options?)` is the low-level renderer returning `{ body, contentType }`.
- `ImageResponse` extends `Response` and renders lazily through a `ReadableStream`, so the image is produced when the body is consumed.
- Fonts: `loadDefaultFont()` fetches Inter from Google Fonts; `loadFontFromUrl(url, name, weight?, fontStyle?)` / `loadFontFromFile(path, name, weight?, fontStyle?)` load your own. `DEFAULT_FONT_URL` / `DEFAULT_FONT_NAME` are exported for reference.
- `svgOnly: true` returns SVG instead of PNG (works without `@resvg/resvg-js`).

## Optional Peers

`satori` and `@resvg/resvg-js` are **optional** — only PNG rendering needs them:

- **Without both peers:** metadata merging, `useSeoMeta`, robots / sitemap / manifest responses, all file conventions except the image ones, and JSON-LD all work. `renderOgImage` / `renderArticleOgImage` / `renderToImage` throw when they try to render PNG.
- **`satori` only:** `svgOnly: true` works; PNG still fails.
- **Both installed:** `image/png` output.
- `isOgImageSupported(): Promise<boolean>` is the capability probe — `await import('satori')` then `await import('@resvg/resvg-js')`, returning `false` if either is missing. Gate an OG route on it (or provide an SVG/static fallback).
- `vue` is also listed as an optional peer because `useSeoMeta` needs it; without Vue, import only from `/json-ld`, `/conventions` and `/og-image`.

## Type Safety

- Metadata types: `SeoMetadata`, `MetaTag`, `LinkTag`, `OpenGraphMeta`, `OGImage`, `TwitterMeta`.
- Response option types: `RobotsOptions`, `SitemapUrl`, `WebAppManifest`, `ManifestIcon`.
- Convention types: `SeoConventionKind`, `SeoConventionDescriptor`, `RegisterSeoConventionsOptions`, `SeoConventionApp`, `SeoConventionContext`.
- JSON-LD types: `JsonLdSchema`, `JsonLdInput`.
- OG image types: `OgImageOptions`, `OgTemplateInput`, `SatoriFont`, `SatoriNode`.
- `SeoMetadata.titleTemplate` accepts a string or a `(title) => string` function; `SeoMetadata.robots` accepts a string or `{ index?, follow? }`.

## Architecture Notes

- **Subpath split by runtime:** the main entry is browser-safe (it imports only `@unhead/vue` and `./json-ld`). `/conventions` and `/og-image` statically import `node:fs` and are **deliberately not re-exported** from the main barrel — importing them from a client module would pull Node builtins into the browser build.
- **Isomorphic vs usable `useSchemaOrg`:** this package cannot depend on Vue/unhead internals, so its own `useSchemaOrg` is a registry-based fallback. `@ubean/client` owns the usable one and reuses `serializeJsonLd` for escaping — one escaping implementation, two call sites.
- **Frameworks glue elsewhere:** this package never imports `@ubean/app`; `SeoConventionApp` is a structural type, which keeps the SEO layer dependency-free and keeps the route mounting decision in the app factory.
- **Composition over duplication:** `mergeMetadata` is the single merge primitive; `mergeSeoLayers` is a three-argument convenience over it, and dedupe runs at merge time so consumers do not re-implement last-wins semantics.
- **Peer-gated capability:** PNG rendering degrades gracefully and is probed at runtime via `isOgImageSupported()`, so a project without the heavy image peers still gets every other SEO feature.
- **Ownership:** `@ubean/client` binds metadata to a head instance; `@ubean/app` mounts the conventions; `@ubean/seo` owns the data, the escaping and the rendering primitives.
