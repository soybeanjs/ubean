# @ubean/integrations

**English | [中文](./README.zh-CN.md)**

Thin integration bundles for ubean — PWA, fonts, Electron, `@vean/ui` and Pinia behind dedicated subpaths.

```ts
import { definePwaConfig, defineGoogleFont, serializePiniaState } from '@ubean/integrations';
```

## Table of Contents

- [@ubean/integrations](#ubeanintegrations)
  - [Package Positioning](#package-positioning)
  - [Install](#install)
  - [Quick Start](#quick-start)
  - [PWA](#pwa)
  - [Fonts](#fonts)
  - [Electron](#electron)
  - [UI](#ui)
  - [Pinia](#pinia)
  - [Type Safety](#type-safety)
  - [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                          | Responsibility                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| `@ubean/integrations` (main)   | Browser-safe runtime helpers and types for all five integrations          |
| `@ubean/integrations/pwa`      | Vite plugin wrapping `vite-plugin-pwa` + workbox                          |
| `@ubean/integrations/fonts`    | Vite plugin that scans, resolves and self-hosts font files                |
| `@ubean/integrations/electron` | Vite plugin wrapping `vite-plugin-electron`                               |
| `@ubean/integrations/ui`       | Vite plugin registering the `@vean/ui` resolver and styles                |
| `@ubean/integrations/pinia`    | Vite plugin for dev pre-bundling plus SSR state helpers on the main entry |

**Included:**

- Five independent integrations merged into one package, each with its own subpath — enable only the ones you use.
- Browser-safe runtime exports (`usePwa`, `registerSW`, `useFonts`, `serializePiniaState`, …) on the main entry.
- Config helpers (`definePwaConfig`, `defineGoogleFont`, `defineElectronConfig`, `defineUiConfig`, `definePiniaConfig`) so options stay typed at the call site.

**NOT included** (deliberately):

- No re-implementation of the wrapped tools. `vite-plugin-pwa`, `vite-plugin-electron`, `@vean/ui` and `pinia` stay the real implementations; this package only wires them into ubean's module system.
- No component re-exports. Import `@vean/ui` components from `@vean/ui` directly — `@ubean/integrations/ui` registers the resolver, it does not proxy the library.
- No Pinia API re-export. `createPinia` / `defineStore` come from `pinia`.
- No image pipeline and no content collections. Those are separate packages (`@ubean/image`, `@ubean/content`).
- No application-level service worker logic. PWA supplies the manifest, registration entry and cache strategy; it does not cache business data by default.

**Runtime dependency whitelist (main entry):** `@ubean/build`, `defu`, `ohash`, `vite-plugin-electron`, `vite-plugin-pwa`.

**Optional peers:** `@vean/ui` (`>=0.50.0-0`), `electron` (`^28`–`^37`), `pinia` (`^2 || ^3`), `vite` (`^5 || ^6 || ^7`), `vue` (`^3`). Each integration degrades independently: without the peer, the corresponding plugin is simply not loaded — the rest of the package and the app keep working.

## Install

```bash
# the bundle itself — provides every integration
pnpm add @ubean/integrations

# peers, only for the integrations you enable
pnpm add -D @vean/ui            # ui
pnpm add -D electron            # electron
pnpm add pinia                  # pinia
```

## Quick Start

**1. Enable the integrations you need**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pwa: true,
  fonts: {
    families: [{ name: 'Inter', provider: 'google', weights: [400, 700] }]
  },
  ui: true,
  pinia: true
  // electron: true
});
```

Each field accepts `true` for defaults or an options object for full control.

**2. Configure each one**

When you need explicit control, the Vite plugins are importable directly — every one of them ships behind a subpath, never on the main entry.

```ts
import { ubeanElectronPlugin, defineElectronConfig } from '@ubean/integrations/electron';
import { ubeanFontsPlugin } from '@ubean/integrations/fonts';
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/integrations/pinia';
import { ubeanPwaPlugin, definePwaConfig } from '@ubean/integrations/pwa';
import { ubeanUiPlugin, defineUiConfig } from '@ubean/integrations/ui';

export default defineConfig({
  plugins: [
    ubeanPwaPlugin(definePwaConfig({ registerType: 'prompt' })),
    ubeanFontsPlugin({ families: [{ name: 'Inter', provider: 'google' }] }),
    ubeanElectronPlugin(defineElectronConfig({ main: { entry: 'electron/main.ts' } })),
    ubeanUiPlugin(defineUiConfig({ css: true })),
    ubeanPiniaPlugin(definePiniaConfig({ optimizeDeps: true }))
  ]
});
```

## PWA

`@ubean/integrations/pwa` wraps `vite-plugin-pwa` + workbox: it generates the Web App Manifest and the service worker, and registers it from the client.

```ts
import { usePwa } from '@ubean/integrations';

const { needRefresh, isOfflineReady, isInstalled, updateServiceWorker } = usePwa();
```

| Export                               | Description                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ubeanPwaPlugin(options)`            | The Vite plugin. `enabled: false` returns a noop plugin.                                                                                                          |
| `definePwaConfig(options)`           | Typed `PwaOptions` helper.                                                                                                                                        |
| `toVitePwaOptions(options)`          | Converts `PwaOptions` into `vite-plugin-pwa` options.                                                                                                             |
| `usePwa(options?)`                   | Reactive `{ isInstalled, isUpdateAvailable, isOfflineReady, needRefresh, registration }` plus `register` / `updateServiceWorker` / `skipWaiting` / `closePrompt`. |
| `registerSW(swUrl?, options?)`       | Manual service-worker registration (defaults to `/sw.js`).                                                                                                        |
| `updateSW()` / `getSWRegistration()` | Trigger `SKIP_WAITING` on the waiting worker / read the current registration.                                                                                     |

`PwaOptions` covers `manifest` (a partial `WebAppManifest`), `registerType` (`'autoUpdate' | 'prompt' | 'manual'`), `injectRegister` (`'auto' | 'script' | 'inline' | null`), `devOptions` and workbox options. Cache behavior is expressed with `CachingStrategy` (`'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only' | 'cache-only'`) and `RuntimeCachingRule` entries.

## Fonts

`@ubean/integrations/fonts` is modeled on Nuxt Fonts. At build time it scans the `font-family` declarations actually used in your CSS and Vue SFCs, resolves each family through `local -> provider`, and self-hosts the used fonts as hashed public assets. `@font-face` rules, unicode ranges, `font-display: swap` and preload hints are generated for you; optional font metric fallbacks reduce CLS.

```ts
import { defineGoogleFont, defineLocalFont } from '@ubean/integrations';

const families = [
  defineGoogleFont({ families: { Inter: { weights: [400, 700] } } }),
  defineLocalFont({ name: 'Brand', src: './src/assets/brand.woff2', weights: [400] })
];
```

The plugin exposes a virtual module, `virtual:ubean-fonts`, exporting `preconnectLinks`, `stylesheetLinks`, `preloadLinks` and `fontCSS` (all reactive), plus the `useFonts()` composable.

| Group                 | Exports                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime config        | `configureFontsRuntime`, `getFontsConfig`, `defineFontFamily`, `getFontFamilies`, `getFontHash`                                                                    |
| Link / CSS generation | `generateFontLinks`, `generateFontCSS`, `generateFontFace`, `generateFontCSSVariable`, `generateFontFallbackCSS`, `generatePreloadLink`, `generatePreconnectLink`  |
| Provider URLs         | `getGoogleFontsUrl`, `getBunnyFontsUrl`, `getFontshareUrl`                                                                                                         |
| CSS parsing           | `parseFontFamilyCSS`, `extractFontUrlsFromCSS`, `normalizeFontFamily`, `normalizeFontName`, `weightsToString`                                                      |
| Defaults & metrics    | `defaultFontWeights` (`[400]`), `defaultFontStyles`, `defaultFontSubsets`, `defaultFontDisplay` (`'swap'`), `fallbackFonts`, `googleFontMetrics`, `createFontHash` |

`FontProvider` is `'google' | 'local' | 'bunny' | 'fontshare' | 'custom'`; `FontDisplay` is `'auto' | 'block' | 'swap' | 'fallback' | 'optional'`; `FontSubset` covers the standard Google subsets plus `chinese-simplified`, `chinese-traditional`, `japanese` and `korean`.

## Electron

`@ubean/integrations/electron` wraps `vite-plugin-electron`. It ships default entries, so `electron: true` is enough to start.

```ts
// ubean.config.ts
export default defineConfig({
  electron: {
    main: { entry: 'electron/main.ts' },
    preload: { input: 'electron/preload.ts' },
    renderer: { nodeIntegration: false }
  }
});
```

| Export                          | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `ubeanElectronPlugin(options)`  | The Vite plugin (async — returns `Promise<Plugin[]>`). |
| `defineElectronConfig(options)` | Typed `ElectronOptions` helper.                        |
| `DEFAULT_MAIN_ENTRY`            | `'electron/main.ts'`                                   |
| `DEFAULT_PRELOAD_INPUT`         | `'electron/preload.ts'`                                |

`ElectronMainOptions` / `ElectronPreloadOptions` accept `vite` pass-through config for extra bundler tweaks. Hot Restart, Hot Reload, HMR and auto-launch come from the underlying plugin.

> Enabling Electron flips `ssr` to `false` by default — desktop apps do not need SSR unless you set `ssr: true` explicitly.

## UI

`@ubean/integrations/ui` registers the `@vean/ui` component resolver and, by default, injects the prebuilt stylesheet into the client entry.

```ts
// ubean.config.ts — prebuilt CSS (default)
export default defineConfig({ ui: true });

// ubean.config.ts — UnoCSS mode, no styles.css injection
export default defineConfig({ ui: { css: false } });
```

`S*` components (`SButton`, `SInput`, `SConfigProvider`, …) become auto-imported on first use. In UnoCSS mode, bring your own `@vean/unocss` preset and install `pnpm add -D @vean/unocss`. `ubeanUiPlugin(options)` / `defineUiConfig(options)` are available when you wire plugins manually.

## Pinia

`@ubean/integrations/pinia` does two things: it adds `pinia` to `optimizeDeps.include` for dev, and it provides the SSR state helpers used by `defineApp`.

```ts
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
// src/app.ts
import { createPinia } from 'pinia';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

| Export                          | Description                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ubeanPiniaPlugin(options)`     | The Vite plugin. `enabled: false` returns a noop plugin.                                                 |
| `definePiniaConfig(options)`    | Typed `UbeanPiniaOptions` helper.                                                                        |
| `serializePiniaState(app)`      | Reads the root state off `app.config.globalProperties.$pinia`. Returns `{}` when Pinia is not installed. |
| `hydratePiniaState(app, state)` | Writes a previously serialized state back. No-op when `state` is `null` or has no `pinia` field.         |

## Type Safety

- Every config helper (`definePwaConfig`, `defineGoogleFont`, `defineLocalFont`, `defineFontFamily`, `defineElectronConfig`, `defineUiConfig`, `definePiniaConfig`) is a typed identity function — options are checked where you write them, not where they are consumed.
- `PwaState` and the reactive refs returned by `usePwa()` share one shape, so the state object can be passed around without restructuring.
- `CachingStrategy`, `DisplayMode`, `ManifestOrientation`, `FontProvider`, `FontDisplay`, `FontSubset`, `FontWeight` are exported unions — no magic strings.
- `PiniaSerializedState` types the object that travels through `defineApp({ serializeState, hydrateState })`.

## Architecture Notes

- **One package, five subpaths.** Each integration is independently enable-able, so a project that only wants fonts never pulls the Electron plugin into its config graph.
- **Plugins behind subpaths, runtime on the main entry.** The main entry re-exports only browser-safe runtime helpers and types, which keeps client bundles free of build-time tooling.
- **Everything is a thin wrapper.** The third-party tool owns the behavior; this package owns the wiring into ubean's module registry (`registerComponentResolver`, `registerCssImport`, `optimizeDeps`).
- **Independent degradation.** Missing optional peers disable exactly one integration. `ui: true` without `@vean/ui` installed fails in that plugin only.
- **SSR helpers are framework-agnostic.** `serializePiniaState` / `hydratePiniaState` are plain functions over the Vue app instance — they do not import Pinia's internals.
- **Fonts are self-hosted by design.** The build downloads fonts so the first production visit does not depend on a third-party font service.
