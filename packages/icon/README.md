# @ubean/icon

**English | [中文](./README.zh-CN.md)**

Iconify integration for ubean — a build-time scanned, tree-shakeable icon engine with SVG and CSS rendering modes, custom collections, and an API fallback.

```vue
<script setup lang="ts">
import { Icon } from '@ubean/icon';
</script>

<template>
  <Icon name="mdi:home" size="1.25em" />
  <Icon name="mdi:bell" flip="horizontal" :rotate="90" />
  <Icon name="mdi:loading" mode="css" />
</template>
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [The Icon Component](#the-icon-component)
- [Iconify Collections](#iconify-collections)
- [Custom & Local Collections](#custom--local-collections)
- [Runtime Loading](#runtime-loading)
- [Dev Serving Route](#dev-serving-route)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

`@ubean/icon` is the **icon engine**: it resolves icon names to data, generates SVG/CSS output and owns collection registration:

| Layer                        | Responsibility                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ubean/icon` (this package) | The `Icon` component, name parsing, collection registration + loaders, SVG generation, CSS mode, SFC icon scanning, the `/_iconify` dev route, API fallback |
| `@ubean/build`               | Hosts the Vite pipeline the plugin hooks into; the icon plugin is loaded from `@ubean/icon/vite` when the module is enabled                                 |
| `@vean/ui` (`SIcon`)         | Styled UI icon component bound to the design system; it uses Iconify naming but is a different component with themed sizes and colors                       |
| `@ubean/config`              | Holds the built-in-module switch (`icon: boolean \| UbeanIconOptions`) and defaults it to disabled                                                          |

**Included:**

- `<Icon>` (internal component name `UbeanIcon`) with `svg` and `css` render modes, flip/rotate transforms and inline sizing
- `useIcon(name)` — programmatic access returning both an async and a sync SVG getter
- Runtime collection API: `registerCollection`, `registerCollectionLoader`, `loadCollection`, `getLoadedCollection`, `listLoadedCollections`, `clearCollections`
- Icon resolution: `getIcon`, `getIconSync`, `getIconData`, `resolveIconData`, `resolveAlias`, `parseIconName`, `normalizeIconName`
- Rendering helpers: `generateSvg`, `buildIconCssIcon`, `escapeHtml`, `parseSvgToIconData`, `createCollectionFromSvgMap`
- Authoring helpers: `defineIconCollection`, `defineIconCollectionLoader`
- Scanning: `scanVueSfcForIcons`, `getScannedIcons`
- API fallback: `fetchIconFromApi`
- Vite plugin at `@ubean/icon/vite`: `ubeanIconPlugin`, `addIconCollection`

**NOT included** (owned next door):

- Themed/styled icons for the design system (`@vean/ui` `SIcon`)
- Icon name auto-completion or a CLI to browse collections — install the `@iconify-json/<collection>` package instead
- Runtime HTTP caching / CDN behaviour of the Iconify API (that is the API's own concern)
- UnoCSS icon presets (`@vean/unocss` or `unocss` presets handle CSS-class icons)

**Runtime dependency whitelist (main entry): `defu`, `pathe`.** The entry carries the browser component and never imports `node:fs`; the Vite plugin lives behind `@ubean/icon/vite` for exactly that reason.

**Optional peers:** `vue` — required by the `Icon` component; `vite` — required by the `@ubean/icon/vite` plugin. Absent `vite` degrades to the programmatic API only; absent `vue` removes the component but keeps the runtime and build-time scanning usable.

## Install

```bash
pnpm add @ubean/icon
# optional peers (loaded lazily, only when enabled):
pnpm add -D vue # for the <Icon> component
pnpm add -D vite # for the Vite plugin (already present in a Vite app)
# a specific Iconify collection — preferred over the whole dataset:
pnpm add -D @iconify-json/mdi
```

## Quick Start

**1. Enable the module** in `ubean.config.ts` — it is disabled by default:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: true
});
```

**2. Use `<Icon>`** in any component — import it (or let component auto-import resolve it):

```vue
<!-- src/components/Header.vue -->
<script setup lang="ts">
import { Icon } from '@ubean/icon';
</script>

<template>
  <Icon name="mdi:home" size="1.25em" />
</template>
```

**3. Inspect the same icon programmatically** when you need raw SVG:

```ts
import { getIconSync, useIcon } from '@ubean/icon';

const { getSvg, getSvgSync } = useIcon('mdi:home');

const svg = getSvgSync(); // string | null — null until the collection is loaded
const svgAsync = await getSvg(); // waits for the collection loader
const direct = getIconSync('mdi:home');
```

## The Icon Component

`Icon` covers the common cases without any styling dependency. Every prop is optional except `name`:

| Prop        | Type                                   | Default  | Purpose                                     |
| ----------- | -------------------------------------- | -------- | ------------------------------------------- |
| `name`      | `string`                               | required | Iconify name, `collection:icon`             |
| `size`      | `string \| number`                     | `'1em'`  | Width/height; numbers become px             |
| `color`     | `string`                               | —        | Any CSS color                               |
| `className` | `string`                               | —        | Extra class on the rendered node            |
| `ariaLabel` | `string`                               | —        | Accessible label; sets `role="img"`         |
| `title`     | `string`                               | —        | `<title>` content inside the SVG            |
| `mode`      | `'svg' \| 'css'`                       | `'svg'`  | Inline SVG or CSS mask/background rendering |
| `flip`      | `'horizontal' \| 'vertical' \| 'both'` | —        | Mirror the icon                             |
| `rotate`    | `number \| string`                     | —        | Rotation; numbers are degrees               |
| `inline`    | `boolean`                              | —        | Align the icon inline with text             |

While a collection is loading, the component renders no SVG and exposes an internal loading state; if the name cannot be resolved it keeps an error state instead of throwing.

## Iconify Collections

Install only the collections you use, then list them in the module options:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';
import type { IconifyCollection } from '@ubean/icon';

export default defineConfig({
  icon: {
    collections: {
      // eager JSON data or a lazy loader — both shapes are accepted
      mdi: () => import('@iconify-json/mdi/icons.json').then(m => m.default as IconifyCollection)
    },
    fallbackToApi: true,
    iconifyApiEnabled: true,
    iconApiEndpoint: 'https://api.iconify.design',
    ssr: true
  }
});
```

Plugin option reference: `collections` (`Record<string, IconifyCollection | (() => Promise<IconifyCollection>)>`), `customCollections` (object, see below), `fallbackToApi`, `iconifyApiEnabled`, `iconApiEndpoint`, `ssr`, `cssSelectorPrefix` (default `'i-'`), `cssWherePseudo` (default `true`). Plugin defaults are `fallbackToApi: true`, `iconApiEndpoint: 'https://api.iconify.design'`, `ssr: true`, `cssSelectorPrefix: 'i-'`, `cssWherePseudo: true`, `iconifyApiEnabled: true`.

Common prefixes: `mdi` (Material Design Icons), `fa` (Font Awesome), `simple-icons`, `tabler`, `lucide`, `carbon`, `bi` (Bootstrap Icons), `heroicons`.

## Custom & Local Collections

`customCollections` is an **object keyed by collection name**, not an array. Each value is either a directory shorthand or a config object:

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: {
    customCollections: {
      // shorthand: directory only
      'my-icons': 'assets/icons',
      // full form
      brand: {
        dir: 'assets/brand',
        prefix: 'brand',
        normalizeIconName: name => name.toLowerCase()
      }
    }
  }
});
```

- Nested subdirectories are flattened into hyphenated names (`brand/logos/github.svg` → `brand:logos-github`).
- `parseSvgToIconData()` extracts `body` plus `width` / `height` / `viewBox` from raw SVG, which is what a custom collection entry is made of.
- The plugin scans `.vue` files for used icon names (`scanVueSfcForIcons`) at build time; `getScannedIcons()` exposes the result from `@ubean/icon/vite`.
- `addIconCollection(pluginOptions, prefix, collection)` registers a collection at build time and returns `{ setCollection, clear }`.

Author collections by hand with the two definitions:

```ts
import { defineIconCollection, defineIconCollectionLoader, type IconifyCollection } from '@ubean/icon';

const brand: IconifyCollection = {
  prefix: 'brand',
  icons: { logo: { body: '<path d="…" />' } }
};

defineIconCollection(brand);

defineIconCollectionLoader('brand', async () => {
  const res = await fetch('/icons/brand.json');
  return res.json();
});
```

## Runtime Loading

Runtime registration is the escape hatch for icons that are not known at build time:

```ts
import {
  getIcon,
  getIconData,
  listLoadedCollections,
  loadCollection,
  registerCollection,
  registerCollectionLoader
} from '@ubean/icon';

registerCollection({ prefix: 'brand', icons: { logo: { body: '<path d="…" />' } } });

registerCollectionLoader('brand', async () => {
  const res = await fetch('/icons/brand.json');
  return res.json();
});

await loadCollection('brand');

const svg = await getIcon('brand:logo');
const data = getIconData('brand:logo'); // { body, width?, height?, viewBox? }
listLoadedCollections();
```

`configureIconRuntime(options)` installs the runtime options (used by the plugin at build start), and `getIconConfig()` reads them back. `fetchIconFromApi(name)` performs the single API lookup used as the last resort.

## Dev Serving Route

The framework serves `/_iconify` in dev: a local SVG/collection hit is answered directly, and only a miss falls through to the Iconify API. That means a locally installed collection works offline, while an uninstalled icon still resolves when `iconifyApiEnabled` is on — with `fallbackToApi: false` a miss becomes a resolution error instead.

Pair `_iconify` with the CSP note: a Content-Security-Policy that blocks `https://api.iconify.design` will break the API fallback path, so allow the endpoint in `connect-src` (as [`examples/ubean-test/ubean.config.ts`](../../examples/ubean-test/ubean.config.ts) does) or turn `iconifyApiEnabled` off.

## Type Safety

- Component props: `UbeanIconProps`; module options: `UbeanIconOptions`, resolved form `ResolvedUbeanIconOptions` (every field required except `collections` / `customCollections`).
- Icon data: `IconifyCollection` (`prefix`, `icons`, optional `aliases` / `width` / `height`), `IconifyIconData` (`body` plus optional size/transform hints), `IconifyAlias` (`parent` + partial data), `ResolvedIconData`.
- Loaders: `IconCollectionLoader` (`{ prefix, load }`), `CustomCollectionDirConfig` (`{ dir, prefix?, normalizeIconName? }`), `ResolvedCustomCollection`.
- Scanning: `ScannedIconUsage` (`{ name, collection, icon }`).
- `IconifyCollection` is a structural subset of the JSON that `@iconify-json/*` packages ship, so a bundled collection can be passed through without transformation.

## Architecture Notes

- **The Vite plugin is deliberately not re-exported from the main entry.** `./vite` pulls in `node:fs`, while the entry also ships the browser `Icon` component — importing build-time APIs from `@ubean/icon/vite` keeps `node:fs` out of the client graph.
- **Install collections individually.** A specific `@iconify-json/<collection>` package plus `scanVueSfcForIcons` gives per-icon tree-shaking; bundling the whole `@iconify/json` dataset defeats it and inflates the build by megabytes.
- **Two render modes, one name space.** `mode: 'svg'` gives styleable inline SVG (and `currentColor` support); `mode: 'css'` emits the classic `i-<prefix>-<icon>` class driven by generated CSS with the configured prefix. Both accept the same flip/rotate transforms.
- **Resolution is layered:** registered in-memory collection → collection loader → Iconify API (when enabled). Each layer is optional, and `getIconSync` returns `null` rather than blocking at the loader/API layers.
- **`SIcon` is a different package.** `@vean/ui`'s `SIcon` is a themed UI component; both use `collection:icon` naming, so a project can use `Icon` for infrastructure and `SIcon` inside the design system without a naming conflict.
