# @ubean/config

**English | [中文](./README.zh-CN.md)**

Configuration loader, types, and module system for ubean.

`@ubean/config` owns the `ubean.config.ts` file: it loads and resolves it, materialises the builtin-module system (`icon` / `pwa` / `auth` / `image` / `fonts` / `electron` / `ui` / `pinia` / `ai` / `content`), and turns the resolved config into a machine-readable list of the third-party packages the project must install.

```ts
// ubean.config.ts
import { defineConfig } from '@ubean/config';

export default defineConfig({
  srcDir: 'src',
  routing: { mode: 'virtual' },
  // The platform preset lives under `build` — a top-level `preset` field is ignored.
  build: { preset: 'node' }
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Config Loading](#config-loading)
- [Builtin Module System](#builtin-module-system)
- [Project Dependency Manifest](#project-dependency-manifest)
- [Package Manager Helpers](#package-manager-helpers)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| This package owns                                                                                                           | Owned elsewhere                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ubean.config.ts` loading + resolution: `defineConfig`, `loadUbeanConfig`, `ensureUbeanConfig`, `getConfig`, `tryGetConfig` | CLI entry points and command assembly — `@ubean/cli`                                                     |
| Config domain resolvers: routing, i18n, SSR, prerender, DevTools, favicon, logging                                          | The features themselves (router, i18n engine, prerenderer) — `@ubean/vue`, `@ubean/i18n`, `@ubean/build` |
| The module system: `resolveModules` / `defineModule` / `ModuleKitContext` + the builtin-module table                        | Module implementations — `@ubean/icon`, `@ubean/ai`, `@ubean/integrations` (…)                           |
| The project-dependency manifest consumed by `ubean prepare` and the Vite plugin's `config` hook                             | Platform capability detection — `@ubean/preset`                                                          |

**Runtime dependency whitelist (main entry): `@ubean/shared`** plus the loading stack (`c12`, `defu`, `hookable`, `jiti`, `pathe`). No `node:*`-free guarantee: this is a Node-only, build-time package.

Optional peers — `@ubean/content`, `hono`, `vite` — are all `peerDependenciesMeta.optional`. They are imported only for typing and for module-kit contexts; when absent, the builtin-module `kit.addServerHandler` / `kit.addVitePlugin` surface loses its concrete types but the loader still works.

## Install

```bash
pnpm add -D @ubean/config
# optional peers, only when you use the corresponding capability:
pnpm add -D vite
pnpm add hono
pnpm add @ubean/content
```

## Quick Start

```ts
import { loadUbeanConfig, getConfig } from '@ubean/config';

const config = await loadUbeanConfig(process.cwd()); // resolves + caches
const same = getConfig(); // throws if nothing was loaded yet
```

Config file resolution is delegated to `c12`: the `ubean.config.{ts,js,mjs,cjs,mts,cts}` file first, `.ubeanrc` second, with `name: 'ubean'`. When a synchronous read is unavoidable (a Vite plugin factory called from `vite.config.ts`), use `loadUbeanConfigSync()` — it reuses the cache when the CLI already loaded the config, otherwise it evaluates the config file with jiti.

> The platform preset is configured as `build: { preset: 'node' }`. There is **no** top-level `preset` field; writing one is silently ignored and the build stays on the `standard` preset. See `@ubean/preset`.

## Config Loading

```ts
import {
  loadUbeanConfig, // async, c12-based, populates the cache
  loadUbeanConfigSync, // sync, jiti-based; cache first
  ensureUbeanConfig, // cache first, otherwise load
  getConfig, // cache or throw
  tryGetConfig, // cache or null
  resolveRoutingConfig, // { mode, outputDir, defaultLayout, routeLazy, … }
  resolveI18nConfig, // i18n defaults + locale list
  resolveSsrConfig, // boolean | { all, exclude, streaming } → resolved
  resolvePrerenderConfig, // include/exclude + DEFAULT_PRERENDER_EXCLUDE
  resolveDevToolsConfig,
  resolveLoggingConfig,
  resolveFavicon
} from '@ubean/config';
```

| Resolver                               | Notes                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveRoutingConfig(userConfig?)`    | Merges onto `routingConfigDefaults` (`mode: 'virtual'`, `outputDir: 'src/router/_generated'`, `defaultLayout: 'default'`, `routeLazy: true`, `layoutLazy: true`, `watchFile: true`, `fileUpdateDuration: 100`). Function fields bypass the spread. |
| `resolveI18nConfig(config?)`           | Accepts `I18nConfig \| false`; `localeCodesOf(resolved)` returns the code list.                                                                                                                                                                    |
| `resolveSsrConfig(config?)`            | Normalises `boolean \| SsrOptions`; `all` defaults to `true`.                                                                                                                                                                                      |
| `resolvePrerenderConfig(config?)`      | `DEFAULT_PRERENDER_EXCLUDE` = `['/api/**', '/_**', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/manifest.webmanifest']`.                                                                                                       |
| `resolveLoggingConfig(config?, mode?)` | Applies the mode-dependent default gate (`request: 'auto'` is forced off for `ssg` / `spa`).                                                                                                                                                       |
| `resolveFavicon(favicon, publicDir)`   | `boolean \| string \| undefined` → path or `null`.                                                                                                                                                                                                 |

## Builtin Module System

Modules are the extension seam. A module is either a string package name, a `[factory, options]` tuple, a bare Vite plugin, or a `ModuleDefinition` object.

```ts
import { defineModule, resolveModules } from '@ubean/config';

export const myModule = defineModule({
  name: 'ubean:my-module',
  dependsOn: ['ubean:icon'],
  setup(options, kit) {
    kit.addVirtualImports({
      imports: [{ name: 'myHelper', from: 'my-pkg/helpers' }]
    });
    kit.addAutoImport({ imports: ['useMyThing'], from: 'my-pkg/runtime' });
    kit.addServerHandler({ route: '/_my', handler: c => c.json({ ok: true }) });
  }
});

const { plugins, modules, hooks, serverHandlers, devServerHandlers, devToolsTabs } = await resolveModules({
  cwd: process.cwd(),
  config,
  builtinPlugins: []
});
```

`ModuleKitContext` (built by `createModuleKitContext(moduleName, options)`) is what `setup(options, kit)` receives:

| `kit` member                    | Purpose                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `hooks.hook` / `hooks.callHook` | Subscribe to `ModuleHooks` (`app:created`, `build:before`, `dev:setup`, `request:start`, …) |
| `addServerHandler`              | Register a Hono handler (`ServerHandlerRegistration`)                                       |
| `addDevServerHandler`           | Register a dev-only handler (`DevServerHandlerRegistration`)                                |
| `addVitePlugin`                 | Push one or many Vite plugins                                                               |
| `addVirtualImports`             | Register `virtual:ubean-*` imports                                                          |
| `addComponentsDir`              | Register a component auto-import directory                                                  |
| `addAutoImport`                 | Register auto-imported symbols                                                              |
| `addDevToolsTab`                | Register a custom DevTools tab                                                              |

`resolveModules` sorts modules by `dependsOn` (`topologicalSort`), always prepends the core module (`__ubean_core__` carrying `builtinPlugins`), and returns `hooks` from `hookable`. Unknown/cyclic dependencies are appended rather than dropped.

The builtin-module table maps a config key to the package that implements it:

```ts
import { BUILTIN_MODULES, getBuiltinModuleByKey, extractBuiltinOptions, isBuiltinDisabled } from '@ubean/config';

getBuiltinModuleByKey('icon'); // { key: 'icon', modulePath: '@ubean/icon/vite', factoryExport: 'ubeanIconPlugin', pluginName: 'ubean:icon' }
extractBuiltinOptions({ disabled: false, dir: 'icons' }); // { dir: 'icons' } — `disabled` is stripped
isBuiltinDisabled(false); // true
```

| Key        | Module path                    | Plugin           |
| ---------- | ------------------------------ | ---------------- |
| `content`  | `@ubean/content/vite`          | `ubean:content`  |
| `icon`     | `@ubean/icon/vite`             | `ubean:icon`     |
| `pwa`      | `@ubean/integrations/pwa`      | `ubean:pwa`      |
| `auth`     | `@ubean/auth/vite`             | `ubean:auth`     |
| `image`    | `@ubean/image/vite`            | `ubean:image`    |
| `fonts`    | `@ubean/integrations/fonts`    | `ubean:fonts`    |
| `electron` | `@ubean/integrations/electron` | `ubean:electron` |
| `ui`       | `@ubean/integrations/ui`       | `ubean:ui`       |
| `pinia`    | `@ubean/integrations/pinia`    | `ubean:pinia`    |
| `ai`       | `@ubean/ai/vite`               | `ubean:ai`       |

A builtin is **skipped** when the user's `modules` array already contains the same package / factory / plugin name — `resolveModules` de-duplicates instead of double-loading.

Helpers for hand-rolled module lists: `isModuleDefinition`, `isVitePlugin`, `getModuleKey`, `getModuleName`, `extractPlugins`, `extractPackageName`, `extractMissingPackageName`. The last one is worth knowing: it digs the _actually missing_ package out of a module-load error, so a project with `@ubean/integrations` installed but `@vean/ui` missing is told to install `@vean/ui` — not the module package it already has.

## Project Dependency Manifest

ubean declares several third-party packages as **optional peers** so that a project only pays for the capabilities it turns on. Missing peers degrade silently, which is exactly why this package ships a machine-readable manifest of "which capability needs which package".

```ts
import { resolveConfigDependencies, findMissingProjectDependencies, checkProjectDependencies } from '@ubean/config';

const resolved = resolveConfigDependencies(config, { core: true, ogImage: false });
const missing = findMissingProjectDependencies(process.cwd(), resolved);

const result = await checkProjectDependencies({
  cwd: process.cwd(),
  config,
  mode: 'prompt', // 'prompt' asks on a TTY and installs; 'warn' only prints
  once: true // skip repeated checks in one process (default)
});
```

| Export                                                                  | Purpose                                                                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CORE_PROJECT_DEPENDENCIES`                                             | Packages every ubean project must declare (template/style side: e.g. `vue-i18n`, `vue-router`) even though ubean itself depends on them |
| `resolveSelectedCapabilities(config, probes)`                           | Config → selected builtin keys + feature flags                                                                                          |
| `detectOgImageConvention(rootDir, srcDir)`                              | Detects the OG-image file convention (`src/og-image.ts` / `src/opengraph-image.ts`) — it has no config switch                           |
| `resolveConfigDependencies(config, options)`                            | Expands the selection into a `ResolvedProjectDependencies` list                                                                         |
| `isProjectDependencyInstalled(name, cwd)`                               | Resolves from the project root; `ERR_PACKAGE_PATH_NOT_EXPORTED` counts as installed                                                     |
| `resolveProjectUbeanVersion(cwd)`                                       | Reads the project's `ubean` version so `@ubean/*` extras can be pinned to it                                                            |
| `findMissingProjectDependencies(cwd, resolved)`                         | Filters the list down to what is not installed, order preserved (required first)                                                        |
| `checkProjectDependencies` / `checkProjectDependenciesOnce`             | Full check: detect, report, optionally prompt + install                                                                                 |
| `buildInstallPlan(missing, packageManager, ubeanVersion?)`              | `InstallPlan` — `prod` / `dev` package lists plus copy-pasteable `commands`                                                             |
| `formatMissingDependencyReport` / `formatSatisfiedReport`               | Human-readable report writers                                                                                                           |
| `runInstallPlan(plan, cwd)`                                             | Executes an `InstallPlan`                                                                                                               |
| `resetProjectDependencyCheckCache` / `clearProjectDependencyProbeCache` | Test hooks for the caches                                                                                                               |

`ProjectDependencySpec` records `name`, an optional `range`, a human `reason`, `requiredBy`, `kind: 'required' | 'optional'`, `installAs: 'dev' | 'prod'`, and `versionFromUbean` (pin `@ubean/<pkg>` to the project's ubean version). Two consumers share this list: `@ubean/cli`'s `prepare` command, and the `@ubean/build` Vite plugin's `config` hook — so a bare `vite dev` gets the same coverage as `ubean dev`.

Detection deliberately uses `createRequire(join(cwd, 'package.json')).resolve(name)` rather than a local-package helper: under pnpm's isolated `node_modules`, the framework's own copy of a package would otherwise be found through the store symlinks and every "you are missing X" hint would be wrong.

## Package Manager Helpers

```ts
import { detectPackageManager, buildInstallCommand, formatCommand } from '@ubean/config';

const pm = detectPackageManager(process.cwd()); // 'pnpm' | 'yarn' | 'bun' | 'npm'
buildInstallCommand(pm, ['@vean/ui'], { dev: true });
formatCommand(buildInstallCommand(pm, ['@vean/ui']));
```

## Type Safety

- `defineConfig(config?: UbeanConfig): UbeanConfig` is an identity function whose only job is editor inference — `UbeanConfig` types every top-level field (`rootDir`, `srcDir`, `mode`, `ssr`, `modules`, the builtin toggles, `routing`, `i18n`, `logging`, `build`, …).
- `ResolvedConfig` is `Required<Omit<UbeanConfig, 'build' | 'dev' | 'preview' | 'prerender' | 'ssr' | …>>` — the domains with their own resolvers keep their input type and are re-read through `resolveSsrConfig` / `resolveRoutingConfig` / etc.
- `ResolvedModule`, `ModuleDefinition`, `ModuleFactory`, `ModuleConfiguration` type the module surface; `ModuleHooks` and `ModuleKitContext` come from the same package.
- `ProjectDependencySpec`, `DependencyRequirement`, `ResolvedProjectDependencies`, `InstallPlan`, `ProjectDependencyCheckResult` type the dependency manifest and check.

## Architecture Notes

- **Single entry point.** There are no subpath exports; everything above is reachable from `@ubean/config`.
- **Cache is module-level and intentional.** `loadUbeanConfig` writes one module-scoped `cachedConfig`; `loadUbeanConfigSync` prefers it (so CLI-side mutations to `mode` / `ssr` survive), `getConfig` throws when nothing was loaded, `tryGetConfig` returns `null`.
- **Sync path exists for Vite.** `loadUbeanConfigSync` uses `jiti` with `interopDefault: true` because Vite plugin factories are called synchronously from `vite.config.ts`. A top-level `await` in the config file produces a dedicated error instead of a confusing parse failure.
- **Module load errors are attributed to the real package.** `extractMissingPackageName` distinguishes "the module package is not installed" from "the module package is installed but one of its peers is missing".
- **Dependency probe singletons live on `globalThis`.** The dev SSR graph inlines `ubean` while externalising `@ubean/*` subpackages, so a module-scoped `Map` would give the two graphs different answers (see AGENTS.md pitfall #19). `clearProjectDependencyProbeCache` / `resetProjectDependencyCheckCache` exist for tests.
- **Node-only.** This package is consumed at build time and by the CLI; it must never be imported from client code.
