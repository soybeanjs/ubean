# Actions

Handle form submissions and user interactions with server-side actions.

## Basic Action

```vue
<script setup lang="ts">
import { defineAction } from '@ubean/core';

const { pending, execute } = defineAction(async (formData: FormData) => {
  const name = formData.get('name');
  const email = formData.get('email');
  
  await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });
  
  return { success: true };
});
</script>

<template>
  <form @submit.prevent="execute">
    <input type="text" name="name" required />
    <input type="email" name="email" required />
    <button :disabled="pending">Submit</button>
  </form>
</template>
```

## Action Status

The `defineAction` composable returns status information:

```typescript
const {
  pending,        // Boolean: action is executing
  execute,        // Function: execute the action
  result,         // Result of the last execution
  error,          // Error if execution failed
  reset           // Function: reset state
} = defineAction(async (data) => {
  // ...
});
```

## Typed Actions

Type your action inputs and outputs:

```typescript
interface FormInput {
  name: string;
  email: string;
}

interface FormResult {
  success: boolean;
  message: string;
}

const { execute } = defineAction<FormInput, FormResult>(async (input) => {
  // input is typed as FormInput
  return { success: true, message: 'Submitted' };
});
```

## Multiple Actions

Define multiple actions in one component:

```vue
<script setup lang="ts">
import { defineAction } from '@ubean/core';

const { execute: addItem } = defineAction(async (formData: FormData) => {
  await fetch('/api/items', { method: 'POST', body: formData });
});

const { execute: deleteItem } = defineAction(async (id: number) => {
  await fetch(`/api/items/${id}`, { method: 'DELETE' });
});
</script>
```

## Action Context

Access request information in actions:

```typescript
const { execute } = defineAction(async (data, ctx) => {
  // Get current user
  const user = ctx.user;
  
  // Get request headers
  const auth = ctx.headers.get('Authorization');
  
  // Get route params
  const id = ctx.params.id;
  
  // Access environment variables
  const apiUrl = ctx.env.API_URL;
});
```

## Error Handling

Handle errors in actions:

```typescript
const { execute, error } = defineAction(async (formData) => {
  const res = await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message);
  }
  
  return { success: true };
});
```

Display errors:

```vue
<template>
  <form @submit.prevent="execute">
    <!-- ... -->
    <p v-if="error" class="error">{{ error.message }}</p>
  </form>
</template>
```

## Optimistic Updates

Update UI optimistically before the action completes:

```vue
<script setup lang="ts">
import { defineAction, useOptimistic } from '@ubean/core';
import { ref } from 'vue';

const items = ref(['Item 1', 'Item 2']);
const optimisticItems = useOptimistic(items);

const { execute } = defineAction(async (name: string) => {
  await fetch('/api/items', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Update real data
  items.value.push(name);
}, {
  onBefore(name) {
    // Optimistic update
    optimisticItems.value.push(name);
  },
  onError() {
    // Rollback on error
    optimisticItems.value = [...items.value];
  }
});
</script>
```

## Server Actions

Define actions directly on the server:

```typescript
// src/routes/api/submit.post.ts
import { defineEventHandler } from '@ubean/core';

export default defineEventHandler(async (c) => {
  const body = await c.req.json();
  // Process submission...
  return { success: true };
});
```

## Best Practices

1. **Keep actions focused**: Each action should do one thing
2. **Error handling**: Always handle errors and display feedback
3. **Loading state**: Show loading indicators during execution
4. **Security**: Validate and sanitize all inputs
5. **Optimistic updates**: Improve perceived performance
6. **Debouncing**: Debounce rapid actions
