# @ubean/preset

**English | [中文](./README.zh-CN.md)**

Deployment presets for ubean: platform detection, capability declaration, and config-file generation.

`@ubean/preset` answers one question — _where will this build run?_ — and turns the answer into build output dir, externals, runtime entry, serve defaults, a capability set, and (when asked) a `wrangler.toml` / `vercel.json` / `netlify.toml` / `deno.json` / `sam` template / `staticwebapp.config.json`.

```ts
// ubean.config.ts
import { defineConfig } from '@ubean/config';

export default defineConfig({
  // The preset lives under `build` — a top-level `preset` field is silently ignored.
  build: { preset: 'cloudflare' }
});
```

## Table of Contents

- [Package Positioning](#package-positioning)
- [Install](#install)
- [Quick Start](#quick-start)
- [Builtin Presets](#builtin-presets)
- [Preset Definition](#preset-definition)
- [Auto Detection](#auto-detection)
- [Capability Matrix](#capability-matrix)
- [Production Cache Store](#production-cache-store)
- [Config File Generators](#config-file-generators)
- [Type Safety](#type-safety)
- [Architecture Notes](#architecture-notes)

## Package Positioning

| This package owns                                                                                              | Owned elsewhere                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The 11 builtin platform presets, their aliases, and their `extends` chains                                     | The build pipeline that consumes a preset — `@ubean/build`                                                |
| `definePreset` + the preset registry (`registerPreset`, `resolvePreset`, `getPresetNames`, `getPresetAliases`) | Config file loading — `@ubean/config`                                                                     |
| Platform auto-detection from config files, environment variables, and runtime globals                          | The platform configuration itself (what to declare in `wrangler.toml`) — this package only _generates_ it |
| The declarative capability set + `diagnoseCapabilities` / `requireCapability`                                  | Live capability probing at runtime — `@ubean/server`                                                      |
| `resolveProductionCacheStore` (which cache backend survives a restart on this platform)                        | The cache implementation — `@ubean/server`                                                                |

**Runtime dependency whitelist (main entry): none.** `@ubean/preset` is a zero-dependency, zero-peer leaf package — no `@ubean/*`, no `node:*` beyond what the generators read from disk. That is deliberate: the build pipeline, the CLI, and the platform config generators all import it, so it must never pull a dependency cycle.

Preset fallback behaviour: `resolvePresetByName()` falls back to `standard` for an unknown name (a typo should not blow up a build), but prints one `console.warn` naming the known presets — a silent fallback would look like "everything is fine" until deploy.

## Install

```bash
pnpm add -D @ubean/preset
```

## Quick Start

```ts
import { resolvePresetByName, resolvePresetWithDetection, registerBuiltinPresets } from '@ubean/preset';

// builtin presets are registered on module load; call this if you register your own first
registerBuiltinPresets();

const preset = resolvePresetByName('cf'); // aliases resolve too
preset.name; // 'cloudflare'
preset.build?.outputDir;
preset.runtime?.entry;

// detection: explicit > config-file > environment > default
const { preset: detected, source, reason } = resolvePresetWithDetection();
// source: 'explicit' | 'config-file' | 'environment' | 'default'
```

`resolvePresetByName` never returns `undefined` — it warns and returns `standard`. Use `resolvePreset(name)` when you need the strict `ResolvedPreset | undefined` form.

## Builtin Presets

| Preset           | Aliases                                                              | Extends      | `_meta.stdName`         |
| ---------------- | -------------------------------------------------------------------- | ------------ | ----------------------- |
| `standard`       | `default`                                                            | —            | `standard`              |
| `node`           | `node-server`, `nodedev`                                             | `standard`   | `node`                  |
| `cloudflare`     | `cloudflare-pages`, `cloudflare-module`, `cf`, `wrangler`, `workers` | —            | `cloudflare_workers`    |
| `cloudflare-dev` | `cf-dev`, `wrangler-dev`                                             | `cloudflare` | `cloudflare_workers`    |
| `vercel`         | `vercel-serverless`, `vercel-node`                                   | `node`       | `vercel`                |
| `vercel-edge`    | `vercel-edge-function`                                               | `standard`   | `vercel_edge`           |
| `netlify`        | `netlify-functions`, `netlify-node`                                  | `node`       | `netlify`               |
| `bun`            | `bun-runtime`                                                        | `node`       | `bun`                   |
| `deno`           | `deno-deploy`, `deno-runtime`                                        | `node`       | `deno`                  |
| `aws`            | `aws-lambda`, `lambda`, `amazon`, `sam`                              | `node`       | `aws_lambda`            |
| `azure`          | `azure-swa`, `azure-static-web-apps`, `swa`, `azure-functions`       | `node`       | `azure_static_web_apps` |

```ts
import {
  standardPreset,
  nodePreset,
  cloudflarePreset,
  cloudflareDevPreset,
  vercelPreset,
  vercelEdgePreset,
  netlifyPreset,
  bunPreset,
  denoPreset,
  awsPreset,
  azurePreset,
  resolvePreset,
  getPresetNames,
  getPresetAliases,
  getRegisteredPresets,
  registerPreset,
  listDetectablePresets
} from '@ubean/preset';
```

| Export                                    | Purpose                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `standardPreset` … `azurePreset`          | The 11 definitions, each a `definePreset(...)` result                        |
| `registerPreset(preset, meta?)`           | Register a user preset (`meta` provides `name` when the definition has none) |
| `resolvePreset(name)`                     | Name → `ResolvedPreset \| undefined` (no fallback)                           |
| `getRegisteredPresets()`                  | All registered definitions with their `_meta`                                |
| `getPresetNames()` / `getPresetAliases()` | `string[]` / `Map<string, string>` alias → canonical name                    |
| `registerBuiltinPresets()`                | Idempotent re-registration of the 11 builtins (already run at module load)   |
| `listDetectablePresets()`                 | The definitions auto-detection can return                                    |

`standard` is the safe baseline: no platform-specific dependencies, `staticServe` + `sse` + streaming, and a `dist/server/handler.mjs` entry. `node` extends it and adds the full Node externals list (`mlly`, `rou3`, `scule`, `tinyglobby`, `ofetch`, `@standard-schema/spec`, …), a `server/server.mjs` entry with a `handler` export, and a `node dist/server/server.mjs` preview command.

## Preset Definition

```ts
import { definePreset } from '@ubean/preset';

export const myPreset = definePreset(
  {
    extends: 'node',
    build: { outputDir: 'dist/my-platform', format: 'esm' },
    runtime: { entry: 'server/worker.mjs' },
    serve: { host: 'localhost', port: 3000 },
    capabilities: { websocket: false, streaming: true },
    commands: { preview: 'node dist/my-platform/server/worker.mjs' },
    hooks: {
      'build:before': async ctx => {
        ctx.cwd; // string
        ctx.outputDir; // string
        ctx.preset; // ResolvedPreset
        ctx.config; // Record<string, unknown>
      }
    }
  },
  { name: 'my-platform', aliases: ['my'], stdName: 'my_platform' }
);
```

`PresetDefinition` fields: `name`, `extends`, `entry`, `exportConditions`, `serve` (`host` / `port`), `build` (`outputDir` / `format` / `externals` / `minify` / `rollupConfig`), `output` (`dir` / `serverDir` / `publicDir`), `runtime` (`entry` / `handler` / `compatibilityDate` / `compatibilityFlags`), `devServer.runner`, `capabilities`, `capabilityInfo`, `hooks`, `alias`, `wasm`, `unenv`, `commands` (`preview` / `deploy`), `nitro`.

`definePreset(preset, meta?)` attaches `_meta` and guarantees `name` — `ResolvedPreset` is `PresetDefinition & { name: string; _meta: PresetMeta }`. `PresetMeta` carries `name`, `aliases`, `stdName`, `static`, `dev`, `compatibilityDate`, `url`.

Hooks are the only executable extension point: `'build:before'`, `'build:after'`, `compiled` (all receiving `PresetBuildContext`) and `'dev:setup'` (`PresetDevContext`).

`extends` is resolved by the registry (`extends: override.extends ?? base.extends`), so a chain like `myPreset → node → standard` merges down the line.

## Auto Detection

```ts
import { detectPreset, resolvePresetWithDetection, listDetectablePresets } from '@ubean/preset';

const result = detectPreset({
  cwd: process.cwd(),
  explicitPreset: 'vercel-edge',
  environment: process.env,
  globalThis: globalThis
});
```

Priority: **explicit > config-file > environment > default**.

1. **explicit** — `explicitPreset` wins when it resolves.
2. **config-file** (in `cwd`):
   - `wrangler.toml` / `wrangler.json`, or deps `wrangler` / `@cloudflare/workers-types` → `cloudflare`
   - `vercel.json`, or deps `vercel` / `@vercel/node` / `@vercel/edge` → `vercel`
   - `netlify.toml`, or deps `netlify-cli` / `netlify-lambda` → `netlify`
   - `deno.json` / `deno.jsonc` → `deno`
   - `template.yaml` / `samconfig.toml`, or deps `aws-sam-cli` / `aws-cdk` / `@aws-sdk/client-lambda` → `aws`
   - `staticwebapp.config.json`, or deps `@azure/static-web-apps-cli` / `@azure/functions` → `azure`
3. **environment** — `CF_WORKERS` / `WRANGLER` / `CLOUDFLARE_WORKER` → cloudflare; `VERCEL` / `VERCEL_ENV` / `NOW_ID` → vercel; `NETLIFY` / `NETLIFY_DEV` / `NETLIFY_IMAGES_CDN_DOMAIN` → netlify; `AWS_LAMBDA_FUNCTION_NAME` / `AWS_EXECUTION_ENV` / `AWS_LAMBDA_RUNTIME_API` → aws; `AZURE_FUNCTIONS_ENVIRONMENT` / `WEBSITE_SITE_NAME` / `AZURE_HTTP_FUNCTION` → azure. Runtime globals resolve too: `Deno` → deno, `Bun` / `process.versions.bun` → bun, `CacheStorage` without `Deno`/`process` → cloudflare, `process.versions.node` → node.
4. **default** — `standard`.

Each result carries `{ preset, source, reason }`, so a build can log _why_ it picked a platform instead of guessing.

## Capability Matrix

Presets describe the platform declaratively instead of probing it at build time.

```ts
import {
  createCapabilitySet,
  requireCapability,
  diagnoseCapabilities,
  NODE_CAPABILITIES,
  STANDARD_CAPABILITIES,
  WORKER_CAPABILITIES,
  NODE_REQUIREMENTS,
  DEV_REQUIREMENTS
} from '@ubean/preset';

const result = diagnoseCapabilities('cloudflare', WORKER_CAPABILITIES, [
  requireCapability('database', true, 'This feature needs a database binding')
]);

result.valid; // false
result.errors; // ['[cloudflare] This feature needs a database binding']
result.warnings;
result.diagnostics; // per-capability { capability, supported, required, message }
```

`CapabilityName` is the key union of `CapabilitySet`, which declares 20 flags: `staticServe`, `websocket`, `sse`, `cronTriggers`, `queues`, `kv`, `storage`, `database`, `envVars`, `secrets`, `nodeCompat`, `streaming`, `compression`, `https`, `http2`, `middleware`, `bodyLimit`, `multipart`, `rpc`.

| Set                               | Character                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCapabilitySet(overrides?)` | Baseline: `envVars`, `streaming`, `middleware`, `bodyLimit` true; everything else false                                                                                |
| `STANDARD_CAPABILITIES`           | `staticServe`, `sse`, `middleware`, `bodyLimit`, `streaming`                                                                                                           |
| `NODE_CAPABILITIES`               | Everything above plus `websocket`, `cronTriggers`, `queues`, `kv`, `storage`, `database`, `secrets`, `nodeCompat`, `compression`, `https`, `http2`, `multipart`, `rpc` |
| `WORKER_CAPABILITIES`             | `staticServe`, `websocket`, `sse`, `kv`, `envVars`, `streaming`, `middleware`, `bodyLimit` — explicitly **no** `storage` and **no** `nodeCompat`                       |

`requireCapability(capability, required = true, message?)` builds a `CapabilityRequirement`; `diagnoseCapabilities(presetName, presetCapabilities, requirements)` returns `CapabilityDiagnosisResult` (`valid`, `diagnostics`, `errors`, `warnings`, `presetName`) — required-and-missing becomes an error, optional-and-missing a warning. `DEV_REQUIREMENTS` (aliased as `NODE_REQUIREMENTS`) requires `middleware`, `streaming`, and `envVars` for a dev server, and _recommends_ `staticServe` and `nodeCompat`.

`RuntimeTarget` (`'node' | 'worker' | 'browser' | 'deno' | 'bun' | 'edge-light'`) labels a set via `CapabilityInfo`, which adds a `runtime: RuntimeTarget[]` field to the flags.

## Production Cache Store

```ts
import { resolveProductionCacheStore, isEphemeralCachePreset } from '@ubean/preset';

resolveProductionCacheStore('node'); // { store: 'fs', dir: '.ubean/cache' }
resolveProductionCacheStore('cloudflare'); // { store: 'memory' }
resolveProductionCacheStore('node', { store: 'memory' }); // { store: 'memory' } — explicit wins
isEphemeralCachePreset('vercel-edge'); // true
```

`auto` (the default) resolves to `fs` on Node-like presets so a cache HIT survives a process restart, and to `memory` on every serverless / edge preset — a local filesystem is not shared across isolates there, and pretending otherwise would produce silently-wrong cache hits. Explicit `{ store: 'fs' | 'memory' }` always wins over `auto`.

Ephemeral names: `cloudflare`, `cloudflare-pages`, `cloudflare-module`, `cf`, `wrangler`, `workers`, `cloudflare-dev`, `cf-dev`, `wrangler-dev`, `vercel`, `vercel-serverless`, `vercel-node`, `vercel-edge`, `vercel-edge-function`, `netlify`, `netlify-functions`, `netlify-node`, `aws`, `azure`.

## Config File Generators

```ts
import {
  generateWranglerConfig,
  serializeWranglerToml,
  generateVercelConfig,
  serializeVercelConfig,
  generateNetlifyConfig,
  serializeNetlifyConfig,
  generateBunfigConfig,
  serializeBunfigConfig,
  generateDenoConfig,
  serializeDenoConfig,
  generateAwsSamConfig,
  serializeAwsSamConfig,
  generateStaticWebAppConfig,
  serializeStaticWebAppConfig
} from '@ubean/preset';

const wrangler = generateWranglerConfig({
  name: 'my-app',
  compatibilityFlags: ['nodejs_compat'],
  kvNamespaces: [{ binding: 'KV', id: '...' }],
  d1Databases: [{ binding: 'DB', databaseId: '...' }],
  r2Buckets: [{ binding: 'BUCKET', bucketName: 'my-bucket' }]
});
const toml = serializeWranglerToml(wrangler);
```

| Generator                    | Defaults it fills in                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateWranglerConfig`     | `main: 'dist/cloudflare/worker/index.mjs'`, `compatibility_date: '2024-09-01'`, `compatibility_flags: ['nodejs_compat']`, `workers_dev: true` |
| `generateVercelConfig`       | `version: 2`, entry `dist/vercel/server/index.mjs` mapped as a function with `memory: 1024`                                                   |
| `generateNetlifyConfig`      | `build.command: 'pnpm build'`, `publish: 'dist/netlify/public'`, functions dir `dist/netlify/functions`                                       |
| `generateBunfigConfig`       | `install` block (registry / lockfile / production) + `preload`                                                                                |
| `generateDenoConfig`         | `tasks`, `importMap`, `lock`, `nodeModulesDir`, `unstable`                                                                                    |
| `generateAwsSamConfig`       | `handler: 'dist/aws/lambda/index.handler'`, runtime `nodejs20.x`, `codeUri: 'dist/aws/lambda'`                                                |
| `generateStaticWebAppConfig` | `apiEntry`, `routes`, `navigationFallback`, `globalHeaders`, `apiRuntime`                                                                     |

Each `generate*` returns a typed object (`WranglerConfig`, `VercelConfig`, `NetlifyConfig`, `BunfigConfig`, `DenoConfig`, `AwsSamTemplate`, `StaticWebAppConfig`); the matching `serialize*` writes it out (`AwsSamTemplate` includes `AwsSamResource` entries).

## Type Safety

- `definePreset` returns `P & { _meta: PresetMeta; name: string }`, so a user preset keeps its literal shape while satisfying `ResolvedPreset`.
- `Preset = PresetDefinition | (() => PresetDefinition)` — a preset may be a lazy factory; `ResolvedPreset extends PresetDefinition` with `name` and `_meta` guaranteed.
- `PresetDetectionResult.source` is the literal union `'explicit' | 'config-file' | 'environment' | 'default'`, so exhaustive handling is checked by the compiler.
- `CapabilityName`, `CapabilitySet`, `CapabilityInfo`, `CapabilityRequirement`, `CapabilityDiagnostic`, `CapabilityDiagnosisResult`, `RuntimeTarget` type the whole capability surface.

## Architecture Notes

- **Zero dependencies, zero peers.** The package is a leaf on purpose — it is imported by `@ubean/build`, `@ubean/cli`, and `@ubean/config`, and anything else would create a cycle.
- **Registration happens on module load.** `src/index.ts` calls `registerBuiltinPresets()` at import time; the exported function stays available for tests and re-registration.
- **Aliases are a separate table.** `getPresetAliases()` maps alias → canonical name; `resolvePresetByName` consults it before `resolvePreset`. `resolvePreset` itself is strict.
- **Unknown names warn instead of throwing.** Falling back to `standard` keeps a typo from breaking the build, and the warning keeps the typo from reaching production unnoticed.
- **Detection is pure.** `detectPreset` takes `cwd` / `environment` / `globalThis` as hints (all defaulting to the real ones), so it is testable without mutating process state.
