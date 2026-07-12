# Environment Variables

## defineEnv()

Define environment variables with type safety.

```typescript
import { defineEnv } from '@ubean/core';

export default defineEnv({
  PORT: {
    type: Number,
    default: 3000
  },
  API_URL: {
    type: String,
    required: true
  },
  DEBUG: {
    type: Boolean,
    default: false
  }
});
```

### Options

| Option   | Type                        | Description            |
| -------- | --------------------------- | ---------------------- |
| type     | String \| Number \| Boolean | Variable type          |
| default  | any                         | Default value          |
| required | boolean                     | Required flag          |
| throw    | boolean                     | Throw error if missing |
| warn     | boolean                     | Warn if missing        |

### Example

```typescript
export default defineEnv({
  // String with default
  APP_NAME: {
    type: String,
    default: 'ubean'
  },

  // Required number
  PORT: {
    type: Number,
    required: true
  },

  // Boolean with validation
  ENABLE_FEATURE: {
    type: Boolean,
    default: false,
    validate: value => {
      return ['true', 'false', '1', '0'].includes(value);
    }
  }
});
```

## useRuntimeEnv()

Access runtime environment variables.

```typescript
import { useRuntimeEnv } from '@ubean/core';

const env = useRuntimeEnv();

console.log(env.API_URL);
console.log(env.PORT);
```

### Server-Side

```typescript
// src/routes/api/hello.get.ts
import { defineEventHandler, useRuntimeEnv } from '@ubean/core';

export default defineEventHandler(() => {
  const env = useRuntimeEnv();
  return { apiUrl: env.API_URL };
});
```

### Client-Side

```typescript
// src/components/Hello.vue
import { useRuntimeEnv } from '@ubean/core';

const env = useRuntimeEnv();

// Only public variables are available
console.log(env.PUBLIC_APP_NAME);
```

## setRuntimeEnv()

Set runtime environment variables.

```typescript
import { setRuntimeEnv } from '@ubean/core';

setRuntimeEnv({
  API_URL: 'https://api.example.com'
});
```

### Merging

```typescript
// Existing: { API_URL: 'https://old.com' }
setRuntimeEnv({ API_URL: 'https://new.com' });
// Result: { API_URL: 'https://new.com' }
```

## Public vs Private

### Public Variables

Variables prefixed with `PUBLIC_` are available on the client:

```
PUBLIC_APP_NAME=ubean
PUBLIC_API_URL=https://api.example.com
```

```typescript
const env = useRuntimeEnv();
console.log(env.PUBLIC_APP_NAME); // Available on client
```

### Private Variables

Other variables are server-only:

```
API_KEY=secret-key
DATABASE_URL=postgres://...
```

```typescript
// Only available on server
const env = useRuntimeEnv();
console.log(env.API_KEY); // undefined on client
```

## .env Files

### .env

Base environment file:

```
APP_NAME=ubean
API_URL=https://api.example.com
```

### .env.local

Local overrides (gitignored):

```
API_URL=http://localhost:3000
```

### .env.production

Production environment:

```
NODE_ENV=production
API_URL=https://api.example.com
```

### .env.development

Development environment:

```
NODE_ENV=development
API_URL=http://localhost:3000
```

## Validation

### Type Validation

```typescript
export default defineEnv({
  PORT: {
    type: Number,
    validate: value => {
      const num = parseInt(value);
      return num > 0 && num < 65536;
    }
  }
});
```

### Custom Validation

```typescript
export default defineEnv({
  NODE_ENV: {
    type: String,
    validate: value => {
      return ['development', 'production', 'test'].includes(value);
    }
  }
});
```

## Default Values

```typescript
export default defineEnv({
  PORT: {
    type: Number,
    default: 3000
  },
  LOG_LEVEL: {
    type: String,
    default: 'info'
  }
});
```

## Error Handling

### Required Variables

```typescript
export default defineEnv({
  DATABASE_URL: {
    type: String,
    required: true,
    throw: true // Throw error if missing
  }
});
```

### Warning Only

```typescript
export default defineEnv({
  API_KEY: {
    type: String,
    required: true,
    warn: true // Warn but continue
  }
});
```

## TypeScript Support

### Generated Types

ubean generates TypeScript types for environment variables:

```typescript
// .ubean/env.d.ts
interface UbeanEnv {
  PORT: number;
  API_URL: string;
  DEBUG: boolean;
}
```

### Using Types

```typescript
import type { UbeanEnv } from '@ubean/core';

const env = useRuntimeEnv() as UbeanEnv;
```

## Best Practices

1. **Never commit secrets**: Use `.env.local` for secrets
2. **Use PUBLIC\_ prefix**: Only expose necessary variables to client
3. **Validate all variables**: Use `validate` option
4. **Provide defaults**: Use `default` for optional variables
5. **Document variables**: Add comments to `defineEnv`
6. **Use type safety**: Leverage TypeScript types
