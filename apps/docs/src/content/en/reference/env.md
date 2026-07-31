---
title: Env
---

# Environment Variables

ubean provides `defineEnv()` for type-safe environment variable validation. The schema is defined in `env.ts` (project root) and consumed across server and client.

## defineEnv()

```typescript
// env.ts
import { defineEnv } from 'ubean';

export const env = defineEnv({
  DATABASE_URL: {
    type: 'string',
    required: true
  },
  PORT: {
    type: 'number',
    default: 9527
  },
  DEBUG: {
    type: 'boolean',
    default: false
  }
});
```

### Schema Options

| Option     | Type                          | Description                         |
| ---------- | ----------------------------- | ----------------------------------- |
| `type`     | `'string' \| 'number' \| 'boolean'` | Variable type                |
| `default`  | `string \| number \| boolean` | Default value if unset              |
| `required` | `boolean`                     | Throw if missing                    |
| `warn`     | `boolean`                     | Warn (instead of throw) if missing  |
| `validate` | `(value: string) => boolean`  | Custom validation function          |

### Example

```typescript
export default defineEnv({
  // Required string
  DATABASE_URL: {
    type: 'string',
    required: true
  },

  // Number with default
  PORT: {
    type: 'number',
    default: 9527
  },

  // Boolean with default
  DEBUG: {
    type: 'boolean',
    default: false
  },

  // Enum validation
  NODE_ENV: {
    type: 'string',
    default: 'development',
    validate: value => ['development', 'production', 'test'].includes(value)
  }
});
```

## Using Environment Variables

### Server-Side

In API routes and middleware:

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const port = process.env.PORT;
  const dbUrl = process.env.DATABASE_URL;
  return c.json({ port, dbUrl });
});
```

### Client-Side

Only variables prefixed with `PUBLIC_` (or `VITE_`) are exposed to the client via `import.meta.env`:

```vue
<script setup lang="ts">
const appName = import.meta.env.VITE_APP_NAME;
const apiUrl = import.meta.env.VITE_API_URL;
</script>
```

## .env Files

ubean loads `.env` files in this order (later files override earlier):

1. `.env` — Base environment
2. `.env.local` — Local overrides (gitignored)
3. `.env.<NODE_ENV>` — Environment-specific (`.env.production`, `.env.development`)

```
# .env
APP_NAME=ubean
DATABASE_URL=postgres://localhost:5432/ubean

# .env.local (gitignored)
DATABASE_URL=postgres://localhost:5432/ubean_dev

# .env.production
NODE_ENV=production
DATABASE_URL=postgres://prod-db:5432/ubean
```

## CLI Commands

```bash
# List environment variables
ubean env list

# Add variable
ubean env add DATABASE_URL "postgres://..."

# Update variable
ubean env update DATABASE_URL "postgres://new-host:5432/..."

# Delete variable
ubean env delete DATABASE_URL

# Validate schema
ubean env validate
```

## Public vs Private

### Public Variables

Variables prefixed with `PUBLIC_` or `VITE_` are exposed to the client:

```
VITE_APP_NAME=ubean
VITE_API_URL=https://api.example.com
```

```typescript
// Available in client code
const appName = import.meta.env.VITE_APP_NAME;
```

### Private Variables

Other variables are server-only:

```
DATABASE_URL=postgres://...
API_KEY=secret-key
JWT_SECRET=super-secret
```

```typescript
// Only available in server code (API routes, middleware, loaders)
// Reference via process.env on the server
```

## Validation

### Type Validation

```typescript
export default defineEnv({
  PORT: {
    type: 'number',
    default: 9527,
    validate: value => {
      const num = parseInt(value, 10);
      return num > 0 && num < 65536;
    }
  }
});
```

### Required Variables

```typescript
export default defineEnv({
  DATABASE_URL: {
    type: 'string',
    required: true   // Throws if missing
  },
  API_KEY: {
    type: 'string',
    required: true,
    warn: true        // Warn instead of throw
  }
});
```

## TypeScript Support

ubean generates `.ubean/env.d.ts` with types derived from your `defineEnv` schema:

```typescript
// .ubean/env.d.ts (auto-generated)
interface UbeanEnv {
  DATABASE_URL: string;
  PORT: number;
  DEBUG: boolean;
}
```

## Best Practices

1. **Never commit secrets**: Use `.env.local` for secrets (gitignored)
2. **Use PUBLIC_ prefix**: Only expose necessary variables to client
3. **Validate all variables**: Use `validate` option for custom rules
4. **Provide defaults**: Use `default` for optional variables
5. **Document variables**: Add comments to `defineEnv` schema
6. **Use NODE_ENV**: Branch logic on `NODE_ENV` (development/production/test)
