# `.ubean/` codegen contract · v1

> Studio / IDE plugins consume these generated files. They are written by
> `ubean prepare` / `ubean dev` / `ubean build` **and** by the Vite plugin path —
> since ADR-0012 `ubeanPlugin()` (`@ubean/build`) is a first-class writer, so a
> bare `vite dev` / `vite build` generates the same set via `runProjectCodegen()`
> → `generateTypes()`. When the CLI already ran codegen the plugin yields
> (`UBEAN_CODEGEN_BY_CLI`), so one writer wins per run. Output goes into
> `{cwd}/.ubean/` (gitignored). This document plus `.ubean/codegen.manifest.json`
> is the freeze (RM-S02). Do **not** parse `.d.ts` as JSON Schema.

`contractVersion`: **1**

## Files

| File | `declare module` | Required | Stable types |
| --- | --- | --- | --- |
| `routes.d.ts` | `ubean:routes` | yes | `ApiRouteMap`, `ApiRoutePath`, `ApiMethod` |
| `pages.d.ts` | `ubean:pages` | yes | `RouteName`, `LayoutName` |
| `i18n.d.ts` | `vue-i18n` | no (only if locale JSON exists) | `DefineLocaleMessage` |
| `auto-imports.d.ts` | — (global composables) | yes | unimport declarations |
| `components.d.ts` | — (global components) | yes | component auto-import |
| `virtual-components.d.ts` | — (global virtual components) | no | ambient types for paired / one-sided `.server.vue` / `.client.vue` virtuals; must be its own file because `components.d.ts` is rewritten by unplugin-vue-components and that rewrite drops neighbouring `declare module` blocks |
| `env.d.ts` | `ubean:env/client`, `ubean:env/server` | yes | generated `ImportMetaEnv` + typed access to both env modules; declared **outside** `CODEGEN_FILES` because it is consumed by `tsc`, not by studio / IDE plugins (see below) |
| `codegen.manifest.json` | — | yes | this catalog, `contractVersion`, `generated` flags |

`CODEGEN_FILES` in `packages/builder/src/codegen/index.ts` is the source of truth
for this table; `virtual-components.d.ts` is emitted by the auto-imports
generator (`generateVirtualComponentsDts`) and lands as `required: false`.

`env.d.ts` is deliberately **not** in `CODEGEN_FILES`. That array is the frozen
contract external tools read by name from `codegen.manifest.json`; adding a file
to it means bumping `contractVersion` and versioning `env.d.ts` too, while
`env.d.ts` only has one consumer — the TypeScript compiler. It is emitted by
`generateEnvTypes()` (`packages/builder/src/env/codegen.ts`) and returned from
`generateTypes()` as `CodegenResult.envTypesPath`.

`env.d.ts` carries two things and is generated even when `env.schema` is empty:

- `declare module 'ubean:env/client'` / `'ubean:env/server'` — typed access to the
  two virtual modules (see the `env` contract below)
- a generated `ImportMetaEnv` covering resolved `VITE_*` keys plus Vite's builtins
  (`MODE` / `DEV` / `PROD` / `BASE_URL` / `SSR`), so hand-written `ImportMetaEnv`
  blocks can be deleted instead of drifting out of sync with `.env`

## Optional / not written by `generateTypes()`

| File | Writer | Notes |
| --- | --- | --- |
| `typed-router.d.ts` | `@ubean/vue` Vite plugin (`generateTypedRouter`, wired in `packages/vue/src/vite.ts`) | `declare module '@ubean/scan'` |
| `openapi.d.ts` | `generateOpenApiTypesFromServer()` on `dev` listen | from `/_openapi.json` |
| `bundle-baseline.json` | `ubean analyze` | client gzip budget; commit a copy under `examples/ubean-test/benchmarks/` |

## `env` virtual modules (`ubean:env/*`)

Written by `generateEnvTypes()` into the same `.ubean/env.d.ts`; the modules
themselves are served by `ubeanEnvPlugin` (`packages/builder/src/env/plugin.ts`,
registered inside `ubeanPlugin()`).

| Module | Source of values | When |
| --- | --- | --- |
| `ubean:env/client` | Vite-resolved `import.meta.env`, inlined as literals | build time |
| `ubean:env/server` | `process.env` read once at module evaluation (static semantics) | runtime |

Field dimensions come from `envField.*()` in `ubean.config.ts`
(`packages/shared/src/env.ts`):

- legal combinations are `client+public`, `server+public`, `server+secret`
- `client+secret` throws **while resolving the schema** — configuration time, not
  build time
- `env.d.ts` declares `ubean:env/server` only for `server` fields, but types alone
  are not a guard: importing `ubean:env/server` from client code makes the
  **build fail** (the plugin throws in `load()` when
  `this.environment.name === 'client'`). Secrets never silently become
  `undefined` in a browser bundle.

With `env.mode: 'throw'` a missing required server field throws at module
import; `'warn'` (default) logs and continues.

## Manifest shape

```json
{
  "contractVersion": 1,
  "generatedAt": "ISO-8601",
  "files": [
    {
      "name": "routes.d.ts",
      "module": "ubean:routes",
      "required": true,
      "types": ["ApiRouteMap", "ApiRoutePath", "ApiMethod"],
      "generated": true
    }
  ]
}
```

Breaking changes bump `contractVersion`. Additive files may land in v1 with
`required: false`.
