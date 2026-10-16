# `env` contract · v1

> Frozen contract for environment variables in ubean apps. Consumers: app authors
> writing `ubean.config.ts`, and the generated `.ubean/env.d.ts` (see
> [codegen-v1.md](codegen-v1.md) §`env` virtual modules).

`contractVersion`: **1**

## Why this exists

Before this contract, `defineEnv()` (`packages/shared/src/env.ts`) read **only**
`process.env`. That works on the server and breaks on the client: there is no
`process` in a browser, so `public`-group fields silently fell back to their
`default` and never saw the real value from `.env`. Every app worked around it
by keeping a second, hand-written module reading `import.meta.env.VITE_*` — two
mechanisms, two places to declare the same variable, and a hand-maintained
`ImportMetaEnv` that drifts (this repo's consumer hit exactly that: `VITE_API_PROXY_KEYS`
was read but never declared, so nothing could notice it going stale).

The model below is borrowed from Astro's `astro:env` (see the comparison table
at the end).

## Two dimensions

Every field declares where its value lives and whether it is sensitive.

| Dimension | Values | Meaning |
| --- | --- | --- |
| `context` | `client` \| `server` | `client` is inlined into the client bundle at build time; `server` is only read in the server runtime |
| `access` | `public` \| `secret` | `secret` must never reach the client bundle; `public` may |

Legal combinations — exactly these three:

| `context` | `access` | Readable from | Declared in `env.d.ts` |
| --- | --- | --- | --- |
| `client` | `public` | client + server | `ubean:env/client` |
| `server` | `public` | server only | `ubean:env/server` |
| `server` | `secret` | server only | `ubean:env/server` |

`client` + `secret` throws **while resolving the schema** — configuration time,
the earliest possible failure. `packages/shared/src/env.ts` `assertEnvFieldCombo()`.

## Declaring fields

```ts
// ubean.config.ts
import { defineConfig, envField } from 'ubean';

export default defineConfig({
  env: {
    mode: 'throw', // 'warn' (default) logs, 'throw' fails at import time
    schema: {
      // inlined into the client bundle as a literal
      APP_TITLE: envField.string({ context: 'client', access: 'public', default: 'MyApp' }),
      API_ENV: envField.enum({ context: 'client', access: 'public', values: ['local', 'dev', 'prod'] }),

      // server-only, but not sensitive
      PORT: envField.number({ context: 'server', access: 'public', default: 9527 }),

      // server-only secret
      JWT_SECRET: envField.string({ context: 'server', access: 'secret' }),

      // optional: absent is not an error
      REDIS_URL: envField.string({ context: 'server', access: 'secret', optional: true })
    }
  }
});
```

`envField.string` / `.number` / `.boolean` / `.enum` cover the four types.

### Deprecated: the `server` / `public` groups

```ts
// still works in 0.6.x, do not use in new code
env: {
  server: { JWT_SECRET: { type: String, default: 'dev' } },  // → server + secret
  public: { API_PREFIX: { type: String, default: '/api' } }  // → client + public
}
```

Group semantics are fixed by `LEGACY_GROUP_DIMENSIONS`: `server` → `server + secret`,
`public` → `client + public`. The flat `schema` entry wins when a key appears in
both. Removal is a v2 concern.

## Reading fields

| Module | Values come from | Timing |
| --- | --- | --- |
| `ubean:env/client` | Vite-resolved env, inlined as literals | build time |
| `ubean:env/server` | `process.env`, read once at module evaluation | runtime (static) |

```ts
// client code — value is a literal in the bundle
import { APP_TITLE } from 'ubean:env/client';

// server code
import { JWT_SECRET } from 'ubean:env/server';
```

`ubean:env/server` has **static** semantics (SvelteKit's term): the module reads
`process.env` once when it is evaluated, and the values are fixed from then on.
For per-request or dynamically-named reads use `getSecret(key)`, exported from
the same module, and treat its result as `string | undefined`.

### Client value resolution order

1. `import.meta.env[key]` — what Vite injected (`VITE_*` plus builtins `MODE` /
   `DEV` / `PROD` / `BASE_URL` / `SSR`)
2. the raw `.env` file contents — covers a `client` field whose key has no
   `VITE_` prefix, which Vite does not inject
3. the field's `default`
4. `undefined`

There is no `VITE_` prefix requirement here. Vite's own `import.meta.env` still
needs it; `ubean:env/client` does not, because the plugin reads `.env` directly.

### Server value resolution

The plugin merges `.env` into `process.env` at `configResolved` so the generated
server module can see file values — **`vite dev` does not do this by itself**
(Vite injects `.env` into `import.meta.env` only). Merge rule: real environment
variables win; `.env` fills gaps only. `JWT_SECRET=… pnpm dev` therefore beats a
repository `.env`, which is what CI needs.

## Failure modes

| Situation | Result |
| --- | --- |
| `client` + `secret` in the schema | throws at configuration time |
| client code imports `ubean:env/server` | **build fails** with the importer in the stack |
| required `server` field missing, `mode: 'throw'` | throws at module import |
| required `server` field missing, `mode: 'warn'` | `console.warn`, value is `undefined` |
| `number` field whose raw value is not numeric | validation error (throw or warn per `mode`) |
| `client` field absent everywhere | `default`, else `undefined` |

The client-import guard is enforced in `ubeanEnvPlugin`'s `load()` when
`this.environment.name === 'client'`. It throws rather than substituting an empty
object: silent degradation turns a missing secret into an `undefined` at some
later line, and the root cause (which file imported the wrong module) is gone by
then.

## Relationship to `import.meta.env`

`ImportMetaEnv` is **generated** into `.ubean/env.d.ts` from the resolved env
snapshot — `VITE_*` keys plus Vite's builtins. Do not hand-write it; a
hand-written interface has nothing that can tell you it went stale. Vite's native
`import.meta.env.VITE_*` keeps working unchanged for code that prefers it.

## Comparison with other frameworks

| Framework | Client module | Server module | Client import of server env |
| --- | --- | --- | --- |
| Astro | `astro:env/client` | `astro:env/server` | type-level only (not present in the client module's types) |
| SvelteKit | `$env/static/public` | `$env/static/private` | build error |
| Nuxt | `runtimeConfig.public` | `runtimeConfig` | not in the public type |
| ubean | `ubean:env/client` | `ubean:env/server` | **build error** (follows SvelteKit) |

ubean picks the build error over Astro's type-level-only guard: a type error is
skipped by `// @ts-expect-error`, a build failure is not.

## Known limitations

- **Static server semantics only.** No per-request env. Platform bindings
  (Cloudflare `env` object) are out of scope for v1; use `getSecret()` plus the
  platform's own accessor.
- **`.env` merging happens in the Vite plugin.** A server runtime started without
  Vite (`node dist/server/index.js` where the bundle was built elsewhere) sees
  `process.env` only; use `process.loadEnvFile()` or real environment variables.
- **No `secret` rotation, no per-environment overrides beyond Vite's**
  `.env.[mode]` handling.

Breaking changes bump `contractVersion`.
