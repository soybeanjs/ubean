# @ubean/image

**English | [中文](./README.zh-CN.md)**

Image optimization for ubean — a provider-agnostic `resolveImage` core, `<UbeanImg>` / `<UbeanPicture>` components with responsive `srcset` output, named presets, and a dev IPX transform handler.

```ts
import { resolveImage } from '@ubean/image';

const image = resolveImage('/photos/hero.jpg', { width: 800, format: 'webp', quality: 75 });
// → { url: '/_ipx/w_800,fm_webp,q_75/photos/hero.jpg', format: 'webp', width: 800 }
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Components](#components)
- [Providers](#providers)
- [Presets & srcsets](#presets--srcsets)
- [IPX Handler](#ipx-handler)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/image` owns **image URL resolution: modifiers → provider → URL/srcset**, plus the components that consume it:

| Layer                         | Responsibility                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/image` (this package) | Modifier model, provider abstraction, URL/srcset builders, `<UbeanImg>` / `<UbeanPicture>`, presets, placeholder generation, the IPX parse/serve helpers |
| `@ubean/build`                | Hosts the Vite plugin that installs the dev `/_ipx` middleware and injects the runtime config                                                            |
| `@ubean/config`               | Holds the built-in-module switch (`image: boolean \| BuiltinModuleOptions`) and defaults it to disabled                                                  |
| `@ubean/integrations`         | UI/PWA/Electron integrations — unrelated to image transformation; no shared image pipeline                                                               |
| An external image service     | Actual pixel transformation in production. This package builds the URLs; it does not ship a production transform engine                                  |

**Included:**

- `useImage()` — resolves images, srcsets, density srcsets, placeholders and `<img>` attributes from a component or composable
- `resolveImage` / `getImageContext` / `configureImageRuntime` — the runtime context and resolver
- `defineImagePreset(name, options)` — named modifier bundles, applied via `preset="…"`
- Providers: `ipxProvider`, `staticProvider`, `cloudinaryProvider`, `imgixProvider`, and `builtinProviders`
- URL builders: `createIPXUrl`, `createStaticUrl`, `createSrcSet`, `createDensitySrcSet`, `srcSetToString`, `getPlaceholder`, `buildImgAttributes`, `createImageHash`, `detectFormat`, `isRemoteUrl`, `isDataUrl`, `validateDomain`, `resolveAlias`
- IPX handler: `parseIpxModifiers`, `serveIpxRequest`, `createIpxHonoHandler`, `resolveLocalImage`, `ipxContentType`
- Vite plugin at `@ubean/image/vite`: `ubeanImagePlugin`

**NOT included** (owned next door):

- Actual image transcoding — the dev handler only recognizes IPX-style transform URLs; production needs a real image service
- CDN configuration or cache invalidation for a remote image provider
- Media library / asset uploads (`@ubean/server` storage owns binary storage)
- OG image generation for SEO (`@ubean/seo`'s `ImageResponse`)

**Runtime dependency whitelist (main entry): `defu`, `ohash`, `ufo`.** No `vite`, no `vue`, no `node:fs` — the plugin is behind `@ubean/image/vite`, and the components require the `vue` peer.

**Optional peers:** `vue` — required by `<UbeanImg>` / `<UbeanPicture>`; `vite` — required by `@ubean/image/vite`. Without `vue` the programmatic resolver and URL builders still work; without `vite` the dev `/_ipx` middleware is not installed and nothing is transformed locally.

## Install

```bash
pnpm add @ubean/image
# optional peers (loaded lazily, only when enabled):
pnpm add -D vue # for <UbeanImg> / <UbeanPicture>
pnpm add -D vite # for the Vite plugin (already present in a Vite app)
```

## Quick Start

**1. Enable the module** in `ubean.config.ts` — it is disabled by default:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  image: true
});
```

**2. Render an image** with the component:

```vue
<!-- src/components/Hero.vue -->
<script setup lang="ts">
import { UbeanImg } from '@ubean/image';
</script>

<template>
  <UbeanImg src="/photos/hero.jpg" alt="Hero" :width="800" :height="450" format="webp" sizes="100vw sm:50vw" />
</template>
```

**3. Or resolve manually** when you need the URL in logic:

```ts
import { resolveImage } from '@ubean/image';

resolveImage('/photos/hero.jpg', { width: 640, fit: 'cover' });
// → { url: '/_ipx/w_640,f_cover/photos/hero.jpg', width: 640 }
```

## Components

`UbeanImg` renders a single `<img>`; `UbeanPicture` renders `<picture>` with one `<source>` per requested format and an `<img>` fallback. Both resolve through the same provider pipeline, so a preset or provider override applies identically.

`UbeanImg` props (only `src` is required):

| Prop               | Type                 | Default  | Purpose                                             |
| ------------------ | -------------------- | -------- | --------------------------------------------------- |
| `src`              | `string`             | required | Local path, remote URL or alias                     |
| `alt`              | `string`             | `''`     | Alternative text                                    |
| `title`            | `string`             | —        | `title` attribute                                   |
| `width` / `height` | `number \| string`   | —        | Reserved dimensions                                 |
| `sizes`            | `string`             | —        | `sizes` attribute for responsive selection          |
| `srcset`           | `string`             | —        | Explicit `srcset`, bypassing generation             |
| `loading`          | `'lazy' \| 'eager'`  | `'lazy'` | Native loading hint                                 |
| `crossorigin`      | `string`             | —        | `crossorigin` attribute                             |
| `referrerpolicy`   | `string`             | —        | `referrerpolicy` attribute                          |
| `placeholder`      | `string \| boolean`  | —        | Placeholder URL/flag while the image loads          |
| `format`           | `ImageFormat`        | config   | Output format (`webp`, `avif`, …)                   |
| `quality`          | `number`             | config   | Encoder quality                                     |
| `fit`              | `ImageFit`           | —        | `cover` / `contain` / `fill` / `inside` / `outside` |
| `position`         | `ImagePosition`      | —        | Crop anchor                                         |
| `background`       | `string`             | —        | Fill colour for transparency                        |
| `blur`             | `number`             | —        | Blur radius                                         |
| `preset`           | `string`             | —        | Named preset to apply                               |
| `provider`         | `string`             | config   | Provider override for this image                    |
| `densities`        | `string \| number[]` | config   | Density descriptors for the density srcset          |
| `preload`          | `boolean`            | config   | Emit a preload link                                 |
| `noModule`         | `boolean`            | —        | Legacy fallback handling                            |
| `sizesList`        | `ImageSize[]`        | —        | Breakpoint-driven sizes list                        |

The component keeps an internal `isLoaded` / `isError` state, swaps the `displaySrc` from the placeholder to the resolved URL once the browser finishes loading, and uses an `IntersectionObserver` for lazy loading.

## Providers

A provider is `{ name, getImage, validateDomains?, supportsAlias? }` and returns a `ResolvedImage` (`{ url, format?, width?, height?, sizes?, srcset? }`). Four are built in:

| Provider             | URL shape                                             | Use when                                          |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `ipxProvider`        | `/_ipx/<modifiers>/<path>`                            | Default. Dev transforms + any IPX-compatible edge |
| `staticProvider`     | `/<static.baseURL>/<path>` with a static modifier map | Pre-generated derivatives, no runtime transform   |
| `cloudinaryProvider` | Cloudinary fetch/transform URL                        | A Cloudinary account backs the images             |
| `imgixProvider`      | imgix transform URL                                   | An imgix source backs the images                  |

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  image: {
    provider: 'cloudinary',
    domains: ['images.example.com'],
    cloudinary: { baseURL: 'https://res.cloudinary.com/demo/image/fetch' }
  }
});
```

- `builtinProviders` is the registry the runtime seeds into the context.
- `domains` gates remote sources: `validateDomain(src, domains)` rejects a remote URL whose host is not allowed, so a misconfigured remote image fails loudly instead of leaking a raw URL.
- `alias` maps a short prefix to a real path (`resolveAlias`), useful for asset roots.
- `staticProvider` pairs with the `static.dir` / `static.baseURL` options when a build step has already produced the resized files.

## Presets & srcsets

`defineImagePreset(name, options)` registers a modifier bundle; `preset="…"` in a component or `{ preset: '…' }` in `resolveImage` applies it. Explicit options always win over the preset — the resolver copies the preset first and the caller's options last.

```ts
import {
  createDensitySrcSet,
  createSrcSet,
  defineImagePreset,
  resolveImage,
  srcSetToString,
  useImage
} from '@ubean/image';

defineImagePreset('card', { width: 480, format: 'webp', fit: 'cover' });

resolveImage('/photos/hero.jpg', { preset: 'card' });

const { srcset, densitySrcset, getPlaceholder, getImgAttributes } = useImage();

srcSetToString(createSrcSet('/photos/hero.jpg', [320, 640, 1280], { format: 'webp' }));
// → '/_ipx/w_320,fm_webp/photos/hero.jpg 320w, … 640w, … 1280w'

srcset('/photos/hero.jpg', [320, 640, 1280], { format: 'webp' });
densitySrcset('/photos/hero.jpg', [1, 2], { format: 'webp' });
getPlaceholder('/photos/hero.jpg', { blur: 8 });
getImgAttributes('/photos/hero.jpg', { alt: 'Hero', sizes: '100vw' });
```

- `createSrcSet(src, sizes, modifiers, ctx, formats?)` produces width descriptors; `createDensitySrcSet(src, densities, modifiers, ctx, formats?)` produces `x` descriptors. `useImage()` pre-binds the context, so `srcset` / `densitySrcset` are the same functions with `ctx` already supplied.
- `resolveImage` on the main entry is the same resolver the components use, so URL output is identical whether you render a component or hand-build HTML.
- `format` defaults to the configured list (`['webp', 'avif']` out of the box); `UbeanPicture` emits one `<source>` per entry.
- `placeholder` accepts a number (width) and `getPlaceholder` produces a tiny inline image URL — pair it with the `placeholder` prop to avoid layout shift.

## IPX Handler

The dev server answers IPX-style transform URLs through `serveIpxRequest`:

```ts
import { createIpxHonoHandler, parseIpxModifiers, serveIpxRequest } from '@ubean/image';

parseIpxModifiers('w_800,fm_webp,q_75,fv,grayscale');
// → { width: 800, format: 'webp', quality: 75, flip: 'v', grayscale: true }

const result = await serveIpxRequest('/_ipx/w_640/photos/hero.jpg', {
  rootDir: process.cwd(),
  staticDir: 'public',
  isDev: true
});
// → { status, headers, body? }
```

Modifier grammar — comma-separated tokens:

- Bare flags: `fh` / `fv` (flip horizontal / vertical, combine as `hv`), `grayscale`, `negate`, `trim`, `enlarge`.
- Key/value: `w` (width), `h` (height), `f` (fit), `p` (position, URL-decoded), `fm` (format), `q` (quality), `blur`, `sharpen`, `rot` (rotate), `bg` (background). `_` means no modifiers.

`createIpxHonoHandler(options)` wraps the same logic as a Hono handler for custom server entries, and `resolveLocalImage(root, staticDir, src)` locates the source file on disk. `ServeIpxResult` is `{ status, headers, body?: Buffer | Uint8Array | string, redirect? }`.

**Production note:** the transform pipeline only exists in dev. A production deploy either points `provider` at a real image service (IPX-compatible edge, Cloudinary, imgix, …) or switches to `staticProvider` with pre-generated files. Nothing in this package transcodes images at runtime in production.

## Type Safety

- Options: `UbeanImageOptions` (module input) and `ImageModuleOptions` (resolved, every field required), `CreateImageOptions` (the runtime-seeding subset `configureImageRuntime` accepts).
- Modifiers and options: `ImageModifiers` (`width`, `height`, `size`, `fit`, `position`, `format`, `quality`, `background`, `blur`, `sharpen`, `rotate`, `flip: 'h' | 'v' | 'hv'`, `trim`, `enlarge`, `grayscale`, `negate`, `brightness`, `contrast`, `saturation`), `ImageOptions` (modifiers + `src`, `alt`, `title`, `loading`, `crossorigin`, `referrerpolicy`, `placeholder`, `sizes`, `srcset`, `preset`, `provider`, `densities`).
- Enums: `ImageFormat` (`'webp' | 'avif' | 'jpeg' | 'jpg' | 'png' | 'gif' | 'svg'`), `ImageFit`, `ImagePosition`.
- Provider contract: `ImageProvider`, `ProviderGetImage`, `ImageCTX`, `ResolvedImage`, `ImageSrcsetItem`, `ImageSize`.
- IPX: `ServeIpxOptions`, `ServeIpxResult`.
- `ImageSrcsetItem` carries `{ url, width?, density?, format? }`, so a custom srcset consumer does not need to re-parse the generated string.

## Architecture Notes

- **One resolver, three consumers.** `<UbeanImg>`, `<UbeanPicture>` and `useImage()` all call the same `resolveImage`, so a URL built in a loader matches the URL the component renders.
- **The provider boundary is the seam.** Adding a service means implementing `getImage` and registering it in `providers`; nothing in the components or the URL builders changes.
- **Modifiers are data, not strings.** `ImageModifiers` is a plain object that each provider serializes its own way — IPX to a path segment, Cloudinary/imgix to query parameters (`createIPXUrl` / `createStaticUrl` show the two built-in serializations).
- **Resolution is lazy.** `getImageContext()` builds the default context on first use, and `configureImageRuntime` replaces it afterwards, so the Vite plugin can inject the real config before any component resolves.
- **Transcoding is dev-only and explicit.** The `/_ipx` middleware installs in dev only; production correctness depends on choosing a provider deliberately, which is why the module ships disabled by default and never guesses a deployment target.
- **`UbeanImg` / `UbeanPicture` are the stable names**; the underlying components are named `NuxtImg` / `NuxtPicture` in source, with the `Ubean*` aliases exported from the package entry.
