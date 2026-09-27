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
| `codegen.manifest.json` | — | yes | this catalog, `contractVersion`, `generated` flags |

`CODEGEN_FILES` in `packages/builder/src/codegen/index.ts` is the source of truth
for this table; `virtual-components.d.ts` is emitted by the auto-imports
generator (`generateVirtualComponentsDts`) and lands as `required: false`.

## Optional / not written by `generateTypes()`

| File | Writer | Notes |
| --- | --- | --- |
| `typed-router.d.ts` | `@ubean/vue` Vite plugin (`generateTypedRouter`, wired in `packages/vue/src/vite.ts`) | `declare module '@ubean/scan'` |
| `openapi.d.ts` | `generateOpenApiTypesFromServer()` on `dev` listen | from `/_openapi.json` |
| `bundle-baseline.json` | `ubean analyze` | client gzip budget; commit a copy under `examples/ubean-test/benchmarks/` |

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
