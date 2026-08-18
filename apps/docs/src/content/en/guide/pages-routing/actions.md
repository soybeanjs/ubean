---
title: Actions
description: Server actions and form actions with defineAction and useAction.
---

# Server Actions & Form Actions

ubean provides built-in Server Actions (P9-02) — type-safe server-side functions invoked from the client with progressive enhancement support. Aligns with patterns from Next.js, SvelteKit, SolidStart, and Astro.

## Core API

| API | Description |
| --- | --- |
| `defineAction(handlerOrSchema, handler?, opts?)` | Defines a server action |
| `fail(status, errors)` | Returns field-level validation errors (SvelteKit style) |
| `ActionError` | User-readable error class (with `code`/`status`) |
| `useAction(actionOrId)` | Vue composable (client) |
| `useFormAction(actionName)` | Vue composable (progressive-enhancement forms) |
| `callAction(id, args)` | Low-level RPC call |
| `defineAction(fn)` | Explicitly declares a server action (recommended); the Vite plugin auto-injects `filePath`/`name` for action ID generation |

## 1. defineAction — Defining a Server Action

```typescript
// src/actions/auth.ts
import { defineAction, fail, ActionError } from 'ubean';

export const login = defineAction(async (input: { email: string; password: string }, ctx) => {
  if (input.password === 'wrong') {
    return fail(400, { password: 'incorrect' });
  }
  const user = await authenticate(input.email, input.password);
  if (!user) throw new ActionError('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  return { user, token: 'abc123' };
});
```

### With Schema Validation

Supports any Standard Schema v1 compatible library (valibot/zod/arktype, etc.) or any object with `safeParse`/`parse` methods:

```typescript
import { defineAction } from 'ubean';
import * as v from 'valibot';

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8))
});

export const register = defineAction(schema, async (data, ctx) => {
  // data is already validated, typed as { email: string; password: string }
  return { registered: true, email: data.email };
});
```

## 2. useAction — Calling from the Client

```vue
<script setup lang="ts">
import { useAction } from 'ubean/runtime/vue';
import { login } from '~/actions/auth';

const { submit, pending, data, error, errors, reset } = useAction(login);

async function handleLogin() {
  const result = await submit({ email: 'alice@example.com', password: 'secret' });
  if (result.data) {
    // success
  } else if (result.errors) {
    // field-level validation errors
  }
}
</script>

<template>
  <button :disabled="pending" @click="handleLogin">
    {{ pending ? 'Loading…' : 'Login' }}
  </button>
  <p v-if="errors?.password" class="error">{{ errors.password }}</p>
  <p v-else-if="error" class="error">{{ error.message }}</p>
</template>
```

`useAction` returns:
- `pending: Ref<boolean>` — submitting in progress
- `data: Ref<TOutput | null>` — the successful return value
- `error: Ref<{ message, code? } | null>` — an `ActionError` or thrown exception
- `errors: Ref<Record<string, string> | null>` — field errors returned by `fail()`
- `status: Ref<number>` — HTTP status code
- `result: Ref<ActionResult | null>` — the full result
- `submit(...args)` — triggers the call
- `reset()` — resets state

## 3. Explicit `defineAction()` Wrapper

The Vite plugin (`ubeanServerActionsPlugin`) detects `defineAction(` call expressions and auto-injects `filePath` and `name` for action ID generation:

```typescript
// src/actions/todos.ts
import { defineAction } from 'ubean';

export const createTodo = defineAction(async (input: { title: string }) => {
  await db.insert(todos).values(input);
  return { success: true };
});

export const deleteTodo = defineAction(async (id: string) => {
  await db.delete(todos).where(eq(todos.id, id));
  return { success: true };
});
```

- **Server side**: functions wrapped by `defineAction()` are automatically registered in the global action registry
- **Client side**: the export is replaced with an RPC stub that POSTs to `/__actions` when called
- **Action ID**: generated from `act_` + `base32(fnv1a(filePath:exportName))` (two FNV-1a 32-bit hashes combined into 60 bits → 12 lowercase base32 chars); the Vite plugin auto-injects `filePath`/`name` so client and server stay in sync

## 4. Form Actions (Progressive Enhancement)

Page modules can export an `actions` map; POST forms are dispatched via the `?/<actionName>` URL (SvelteKit style):

```vue
<!-- src/pages/login.vue -->
<script setup lang="ts">
import { defineAction, fail } from 'ubean';

export const actions = {
  default: defineAction(async (input) => {
    return { ok: true };
  }),
  login: defineAction(async (input: { email: string; password: string }) => {
    if (input.password === 'wrong') {
      return fail(400, { password: 'incorrect' });
    }
    return { user: input.email };
  }),
  register: defineAction(async (input: { email: string }) => {
    return { registered: true, email: input.email };
  })
};
</script>

<template>
  <!-- Works without JS too (native POST form) -->
  <form method="POST" action="?/login">
    <input name="email" type="email" required />
    <input name="password" type="password" required />
    <button type="submit">Login</button>
  </form>

  <!-- Or use useFormAction for SPA-style submission -->
  <form @submit.prevent="onSubmit">
    <input name="email" v-model="email" type="email" required />
    <input name="password" v-model="password" type="password" required />
    <button :disabled="pending" type="submit">
      {{ pending ? 'Submitting…' : 'Login' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFormAction } from 'ubean/runtime/vue';

const email = ref('');
const password = ref('');
const { action, pending, onSubmit, data, errors } = useFormAction('login');
</script>
```

- `?/login` → calls `actions.login`
- `?/register` → calls `actions.register`
- No `?/name` → calls `actions.default`
- When a form action returns a `Response` (redirect), the page request is automatically converted to JSON `{ redirect }` + `X-Ubean-Redirect` header

## 5. Action Return-Value Conventions

| Scenario | Return value | Client `result` |
| --- | --- | --- |
| Success | `return { ... }` | `{ data: { ... }, status: 200 }` |
| Field error | `return fail(400, { field: 'msg' })` | `{ errors: { field: 'msg' }, status: 400 }` |
| User error | `throw new ActionError('msg', { code })` | `{ error: { message, code }, status: 400 }` |
| Redirect | `return new Response(null, { status: 302, headers: { Location } })` | `{ data: { redirect }, status: 302 }` |
| Unexpected error | `throw new Error('boom')` | `{ error: { message: 'boom' }, status: 500 }` |

## 6. Traditional API Routes (Alternative)

Server Actions are for form submissions and type-safe RPC calls. For RESTful APIs or scenarios that need OpenAPI documentation, use `defineHandler` instead:

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
    return c.json({ success: true, name, email });
  }
);
```

## Best Practices

1. **Schema validation**: pass a schema as the first argument to `defineAction`; the framework validates input automatically
2. **Progressive enhancement**: when using `useFormAction`, ensure the native `<form method="POST" action="?/name">` also works
3. **Error classification**: use `fail()` for field errors (form-friendly) and `ActionError` for user-facing errors
4. **Action file location**: `src/actions/` directory, or inline `export const actions` in a page module
5. **Access environment variables via `defineEnv` in actions**: Server Actions run on both Node and Cloudflare Workers
