---
title: Env
description: "Type-safe environment variables with defineEnv: validation, public exposure, and CLI commands."
---

# Environment Variables

ubean provides `defineEnv()` for type-safe environment variable validation. The schema is defined in a project file (e.g. `env.ts`) and consumed across server and client.

## defineEnv()

```typescript
// env.ts
import { defineEnv } from 'ubean';

export const { env } = defineEnv({
  server: {
    DATABASE_URL: {
      type: String,
      required: true
    },
    PORT: {
      type: Number,
      default: 9527
    },
    DEBUG: {
      type: Boolean,
      default: false
    }
  }
});
```

`defineEnv()` accepts a single config object with three top-level fields:

| Field    | Type                 | Description                                                       |
| -------- | -------------------- | ----------------------------------------------------------------- |
| server   | EnvSchema            | Server-only variables (never exposed to the client)               |
| public   | EnvSchema            | Public variables (exposed to the client via `import.meta.env`)    |
| mode     | `'warn' \| 'throw'`  | Behavior when validation fails (default: `'warn'` — logs, no throw) |

### Schema entries

Each entry declares the variable type via the **constructor** (`String`, `Number`, `Boolean`), plus optional `default` and `required`:

| Option     | Type                          | Description                         |
| ---------- | ----------------------------- | ----------------------------------- |
| `type`     | `String \| Number \| Boolean` | Variable type (constructor)         |
| `default`  | string \| number \| boolean   | Default value if unset              |
| `required` | boolean                       | Fail validation if missing          |

Standard Schema v1 compatible schemas (e.g. valibot, zod) are also accepted as entry values — anything with `safeParse`/`safeParseAsync`.

### Example

```typescript
// env.ts
import { defineEnv } from 'ubean';

export const { env } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true },
    API_KEY: { type: String, required: true }
  },
  public: {
    APP_NAME: { type: String, default: 'ubean-app' },
    API_URL: { type: String, default: '/api' }
  },
  mode: 'throw'
});
```

## Using Environment Variables

### Server-Side

Access validated values through the `env` proxy returned by `defineEnv()`:

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean';
import { env } from '../../env';

export const GET = defineHandler(c => {
  return c.json({ port: env.PORT, dbUrl: env.DATABASE_URL });
});
```

Raw `process.env` access also works in server code.

### Client-Side

Only variables prefixed with `UBEAN_PUBLIC_`, `VITE_`, or `PUBLIC_` are exposed to the client via `import.meta.env`:

```vue
<script setup lang="ts">
const appName = import.meta.env.UBEAN_PUBLIC_APP_NAME;
const apiUrl = import.meta.env.VITE_API_URL;
</script>
```

## CLI Commands

`ubean env` manages variables in `.env` files (plain key/value lines):

```bash
# Create .env and .env.example from a template
ubean env init

# List variables (--public to show only public ones)
ubean env list
ubean env list --public

# Add or update a variable (--public prefixes with UBEAN_PUBLIC_)
ubean env add DATABASE_URL "postgres://localhost:5432/ubean"
ubean env add API_URL "/api" --public
ubean env add API_URL "/api" --force   # overwrite existing

# Remove a variable
ubean env remove DATABASE_URL
```

Public variables are auto-detected by the `UBEAN_PUBLIC_`, `VITE_`, or `PUBLIC_` prefixes.

## Validation

### Validation mode

Set `mode: 'throw'` to fail fast at startup when a required variable is missing or mis-typed; the default `'warn'` logs errors instead:

```typescript
export const { env } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true }
  },
  mode: 'throw' // throw at startup if DATABASE_URL is missing
});
```

### Manual validation

Call `.validate()` on the result to check a custom source (e.g. a test fixture or a request-specific env):

```typescript
const { validate } = defineEnv({
  server: { DATABASE_URL: { type: String, required: true } }
});

const result = validate(source); // source: Record<string, string | undefined>
if (!result.success) {
  console.error(result.errors); // [{ key, message, value }]
}
```

## TypeScript Support

The `env` proxy is fully typed: `InferEnvOutput<S>` derives `string` / `number` / `boolean` from each entry's constructor, so `env.DATABASE_URL` is typed as `string` without extra declaration files.

## Best Practices

1. **Never commit secrets**: Use `.env.local` for secrets (gitignored); commit `.env.example` instead
2. **Use `UBEAN_PUBLIC_` prefix**: Only expose necessary variables to the client
3. **Validate at startup**: Prefer `mode: 'throw'` for production deployments
4. **Provide defaults**: Use `default` for optional variables
5. **Document variables**: Add comments to the `defineEnv` schema
