---
title: Env
description: "Type-safe environment variables with defineEnv: validation, public exposure, and CLI commands."
---

# Environment Variables

ubean provides `defineEnv()` for type-safe environment variable validation. The schema is defined in a project file (e.g. `env.ts`) and consumed across server and client.

## defineEnv()

```typescript
// env.ts
import { defineEnv, envField } from 'ubean';

export const { env } = defineEnv({
  schema: {
    DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
    PORT: envField.number({ context: 'server', access: 'public', default: 9527 }),
    DEBUG: envField.boolean({ context: 'server', access: 'secret', default: false })
  }
});
```

`defineEnv()` accepts a single config object with two top-level fields:

| Field    | Type                | Description                                                       |
| -------- | ------------------- | ----------------------------------------------------------------- |
| schema   | EnvSchema           | Fields, each declaring its own `context` / `access` dimensions     |
| mode     | `'warn' \| 'throw'` | Behavior when validation fails (default: `'warn'` — logs, no throw) |

### Dimensions

Every field declares where its value lives and whether it is sensitive. Legal combinations:

| `context` | `access` | Readable from | Declared in              |
| --------- | -------- | ------------- | ------------------------ |
| `client`  | `public` | client + server | `ubean:env/client`     |
| `server`  | `public` | server only     | `ubean:env/server`     |
| `server`  | `secret` | server only     | `ubean:env/server`     |

`client` + `secret` throws at declaration time — configuration time, the earliest possible failure.

Grouped `server:` / `public:` schemas have been **removed**. Dimensions live on the field, so an entry never silently changes meaning when it moves between groups. The constructor shape (`{ type: String }`) still parses under `schema`, but with no dimension to read from it is treated as `server + secret` — declare `envField.*()` to make a field readable on the client.

### Schema entries

`envField.*()` covers four types:

| Builder                | Output type                    |
| ---------------------- | ------------------------------ |
| `envField.string(...)` | `string`                       |
| `envField.number(...)` | `number`                       |
| `envField.boolean(...)`| `boolean`                      |
| `envField.enum(...)`   | union of the declared `values` |

Each accepts `context`, `access`, and optional `default` / `optional` / `description`; `envField.enum` additionally requires `values`.

`description` is emitted as a JSDoc comment above the declaration in `.ubean/env.d.ts`, so hovering an import shows what the variable is:

```typescript
export const schema = {
  PORT: envField.number({
    context: 'server',
    access: 'public',
    default: 9527,
    description: 'HTTP listen port'
  })
};
```

```typescript
// .ubean/env.d.ts — generated
/** HTTP listen port */
export const PORT: number;
```

An empty string counts as "not set" — `KEY=` in `.env` makes `default` apply.

### zod / valibot validation

`defineEnv()` also accepts Standard Schema (`~standard`) and `safeParse` shapes, because it shares a process with the validator:

```typescript
import { defineEnv } from 'ubean';
import { z } from 'zod';

export const { env } = defineEnv({
  schema: { JWT_SECRET: z.string().min(32) }
});
```

Validation must be **synchronous** — an async schema fails with an explicit error.

The same does **not** apply to `env.schema` in `ubean.config.ts`: those fields end up in generated source modules, which only carry plain data. Passing a runtime schema there throws at configuration time.

## Using environment variables

### Server

Read validated values through the `env` proxy:

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';
import { env } from '../../env';

export const GET = defineHandler(c => {
  return c.json({ port: env.PORT, dbUrl: env.DATABASE_URL });
});
```

Server code can also read `process.env` directly.

### Client

Declare a field with `context: 'client', access: 'public'` to inline its value into the client bundle at build time:

```typescript
import { APP_NAME } from 'ubean:env/client';
```

`import.meta.env.VITE_*` keeps working unchanged for code that prefers it. Vite's own `import.meta.env` still requires the `VITE_` prefix; `ubean:env/client` does not, because the build plugin reads `.env` directly.

Importing `ubean:env/server` from client code **fails the build** instead of substituting an empty object — silent degradation turns a missing secret into `undefined` at some later line, and the root cause is gone by then.

## CLI commands

`ubean env` manages variables in `.env` files (plain key/value lines):

```bash
# Create .env and .env.example from a template
ubean env init

# List variables (--public shows only public ones)
ubean env list
ubean env list --public

# Add or update (--public prefixes with UBEAN_PUBLIC_)
ubean env add DATABASE_URL "postgres://localhost:5432/ubean"
ubean env add API_URL "/api" --public
ubean env add API_URL "/api" --force   # overwrite an existing value

# Remove
ubean env remove DATABASE_URL
```

The CLI treats `UBEAN_PUBLIC_`, `VITE_`, and `PUBLIC_` prefixes as "public". This is a `.env` file naming convention used by the CLI's `list --public` / `add --public` flags — it is **independent** of `context` / `access` in `env.schema`, which is what actually decides whether a value reaches the client bundle.

## Validation

### Validation mode

Set `mode: 'throw'` to fail fast at startup whenever a required variable is missing or mis-typed; the default `'warn'` only logs:

```typescript
export const { env } = defineEnv({
  schema: {
    DATABASE_URL: envField.string({ context: 'server', access: 'secret' })
  },
  mode: 'throw' // throws at startup when DATABASE_URL is missing
});
```

### Manual validation

Call `.validate()` on the returned object to check a custom source (test fixtures, request-scoped env):

```typescript
const { validate } = defineEnv({
  schema: { DATABASE_URL: envField.string({ context: 'server', access: 'secret' }) }
});

const result = validate(source); // source: Record<string, string | undefined>
if (!result.success) {
  console.error(result.errors); // [{ key, message, value }]
}
```

## TypeScript support

The `env` proxy is fully typed: `InferEnvOutput<S>` derives `string` / `number` / `boolean` (or the enum union) from each field, so `env.DATABASE_URL` is `string` with no extra declaration file. The `ubean:env/*` virtual modules get their types generated into `.ubean/env.d.ts` — do not hand-write them.

## Best practices

1. **Never commit secrets** — keep them in `.env.local` (gitignored) and commit `.env.example` instead
2. **Declare `access: 'secret'` for anything sensitive** — `client` + `secret` is rejected, so the compiler and the config loader both catch the mistake
3. **Validate at startup** — use `mode: 'throw'` in production
4. **Provide defaults** for optional variables
5. **Comment your schema** so the intent of each variable survives
