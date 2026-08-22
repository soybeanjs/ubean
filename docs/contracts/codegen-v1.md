# `.ubean/` codegen contract · v1

> Studio / IDE plugins consume these generated files. They are written by
> `ubean prepare` / `ubean dev` / `ubean build` into `{cwd}/.ubean/`
> (gitignored). This document plus `.ubean/codegen.manifest.json` is the
> freeze (RM-S02). Do **not** parse `.d.ts` as JSON Schema.

`contractVersion`: **1**

## Files

| File | `declare module` | Required | Stable types |
| --- | --- | --- | --- |
| `routes.d.ts` | `ubean:routes` | yes | `ApiRouteMap`, `ApiRoutePath`, `ApiMethod` |
| `pages.d.ts` | `ubean:pages` | yes | `RouteName`, `LayoutName` |
| `i18n.d.ts` | `vue-i18n` | no (only if locale JSON exists) | `DefineLocaleMessage` |
| `auto-imports.d.ts` | — (global composables) | yes | unimport declarations |
| `components.d.ts` | — (global components) | yes | component auto-import |
| `codegen.manifest.json` | — | yes | this catalog, `contractVersion`, `generated` flags |

## Optional / not written by `generateTypes()`

| File | Writer | Notes |
| --- | --- | --- |
| `typed-router.d.ts` | Vite plugin (`@ubean/build`) | `declare module '@ubean/scan'` |
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
