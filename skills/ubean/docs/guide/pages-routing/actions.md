# Form Actions & Mutations

ubean does **not** provide a built-in `defineAction` composable. Handle form submissions by calling API routes that use `defineHandler` with HTTP methods (POST/PUT/PATCH/DELETE).

## Basic Pattern

Define an API route with `defineHandler`:

```typescript
// src/routes/api/submit.ts
import { defineHandler, validator } from 'ubean';
import { z } from 'zod';

const submitSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

export const POST = defineHandler(
  validator('json', submitSchema),
  async c => {
    const { name, email } = c.req.valid('json');
    // Process submission...
    return c.json({ success: true, name, email });
  }
);
```

In the page, submit via fetch with reactive state:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const pending = ref(false);
const result = ref<unknown>(null);
const error = ref<Error | null>(null);

async function execute(formData: FormData) {
  pending.value = true;
  error.value = null;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    result.value = await res.json();
  } catch (e) {
    error.value = e as Error;
  } finally {
    pending.value = false;
  }
}

function handleSubmit(event: Event) {
  const form = event.target as HTMLFormElement;
  execute(new FormData(form));
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input type="text" name="name" required />
    <input type="email" name="email" required />
    <button :disabled="pending">{{ pending ? 'Submitting…' : 'Submit' }}</button>
  </form>

  <p v-if="error" class="error">{{ error.message }}</p>
  <p v-else-if="result">Submitted: {{ JSON.stringify(result) }}</p>
</template>
```

## Typed Requests (validator + describeRoute)

For type-safe requests with OpenAPI documentation:

```typescript
// src/routes/api/users.ts
import { defineHandler, validator, describeRoute, resolver } from 'ubean';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

export const POST = defineHandler(
  describeRoute({
    tags: ['Users'],
    summary: 'Create user',
    responses: {
      201: {
        description: 'Created',
        content: { 'application/json': { schema: resolver(z.object({ id: z.string() }).merge(createUserSchema)) } }
      }
    }
  }),
  validator('json', createUserSchema),
  async c => {
    const body = c.req.valid('json');
    // Persist user...
    return c.json({ id: '1', ...body }, 201);
  }
);
```

## Using $fetch (ofetch)

ubean bundles `ofetch` for ergonomic HTTP calls:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const pending = ref(false);
const error = ref<string | null>(null);

async function submit(payload: { name: string; email: string }) {
  pending.value = true;
  error.value = null;
  try {
    await $fetch('/api/users', {
      method: 'POST',
      body: payload
    });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    pending.value = false;
  }
}
</script>
```

## Multiple Mutations

Define multiple API methods in a single file using void-style named exports:

```typescript
// src/routes/api/items.ts
import { defineHandler } from 'ubean';

export const POST = defineHandler(async c => {
  const body = await c.req.json();
  // create item
  return c.json({ created: body });
});

export const DELETE = defineHandler(async c => {
  const id = c.req.param('id');
  // delete item
  return c.json({ deleted: id });
});
```

## Optimistic Updates

Use Vue refs to manage optimistic UI:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const items = ref<string[]>(['Item 1', 'Item 2']);
const optimistic = ref<string | null>(null);

async function addItem(name: string) {
  optimistic.value = name;
  try {
    await $fetch('/api/items', { method: 'POST', body: { name } });
    items.value.push(name);
  } catch (e) {
    // rollback handled by not pushing
  } finally {
    optimistic.value = null;
  }
}
</script>
```

## Server-Side Handlers

For mutations that don't need a UI, define API routes directly:

```typescript
// src/routes/api/admin/cleanup.ts
import { defineHandler, defineHandlerMeta } from 'ubean';

export const POST = defineHandler(
  defineHandlerMeta({ requiresAuth: true }),
  async c => {
    // Run cleanup
    return c.json({ success: true });
  }
);
```

## Best Practices

1. **Validate inputs**: Always use `validator('json', schema)` (or `validator('form', ...)`) at API boundaries
2. **Show loading state**: Use reactive `pending` ref during submission
3. **Display errors**: Surface API errors to users
4. **Disable submit button**: Prevent duplicate submissions while pending
5. **Reset form on success**: Clear the form after a successful submission
6. **Use CSRF protection**: For cookie-based auth, ensure CSRF tokens are sent
