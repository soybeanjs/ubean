# Data Fetching (useData)

ubean provides `useData()` for declarative data fetching with caching, TTL, dependencies, and invalidation. It is auto-imported from `ubean` (in the `UBEAN_SERVER_PRESET`).

> ubean does **not** provide `defineLoader`. Use `useData()` inside `<script setup>` for server-side or client-side data fetching.

## Basic Usage

```vue
<script setup lang="ts">
// useData is auto-imported
const { data, error, loading, refresh, invalidate } = await useData('posts', () =>
  fetch('/api/posts').then(r => r.json())
);
</script>

<template>
  <div v-if="loading">Loading…</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <ul v-else>
    <li v-for="post in data.posts" :key="post.id">{{ post.title }}</li>
  </ul>
</template>
```

## Async Fetcher

```vue
<script setup lang="ts">
const { data } = await useData('user', async () => {
  const res = await fetch('/api/user');
  return res.json();
});
</script>
```

## Reading Route Params

Use `useRouter()` to read route params inside the fetcher:

```vue
<script setup lang="ts">
const router = useRouter();

const { data: post } = await useData(
  () => `post-${router.currentRoute.value.params.id}`,
  () => fetch(`/api/posts/${router.currentRoute.value.params.id}`).then(r => r.json())
);
</script>
```

## Multiple Sources

Combine multiple `useData` calls:

```vue
<script setup lang="ts">
const { data: posts } = await useData('posts', () =>
  fetch('/api/posts').then(r => r.json())
);

const { data: user } = await useData('user', () =>
  fetch('/api/user').then(r => r.json())
);
</script>
```

## Dependent Data

Use a computed key to refetch when dependencies change:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const router = useRouter();
const postId = computed(() => router.currentRoute.value.params.id as string);

const { data: post } = await useData(
  () => `post-${postId.value}`,
  () => fetch(`/api/posts/${postId.value}`).then(r => r.json())
);

// Comments depend on post being loaded
const { data: comments } = await useData(
  () => `comments-${postId.value}`,
  () => fetch(`/api/posts/${postId.value}/comments`).then(r => r.json())
);
</script>
```

## Caching & TTL

```vue
<script setup lang="ts">
const { data } = await useData('config', () => fetch('/api/config').then(r => r.json()), {
  // Cache key options
  ttl: 60_000,          // Cache for 60 seconds
  defineDataKey: true,   // Auto-derive key from function
  server: true           // Execute on server during SSR
});
</script>
```

## Refresh & Invalidation

```vue
<script setup lang="ts">
const { data, refresh, invalidate } = await useData('posts', fetchPosts);

async function handleRefresh() {
  await refresh();
}

// Invalidate by key (refetches on next access)
async function handleInvalidate() {
  await invalidate('posts');
}
</script>
```

## Error Handling

```vue
<script setup lang="ts">
const { data, error } = await useData('posts', async () => {
  const res = await fetch('/api/posts');
  if (!res.ok) {
    throw new Error(`Failed: ${res.status}`);
  }
  return res.json();
});
</script>

<template>
  <div v-if="error" class="error">{{ error.message }}</div>
</template>
```

## Client-Side Only Fetching

For data that should only load on the client (after hydration), use Vue's `onMounted`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

const data = ref(null);

onMounted(async () => {
  const res = await fetch('/api/analytics');
  data.value = await res.json();
});
</script>
```

## API Routes

For server-side data, prefer API routes with `defineHandler`:

```typescript
// src/routes/api/posts.ts
import { defineHandler } from 'ubean';

export const GET = defineHandler(async c => {
  const posts = await fetchPostsFromDB();
  return c.json({ posts });
});
```

## Best Practices

1. **Stable keys**: Use stable string keys to enable caching across components
2. **Handle errors**: Always handle the `error` state in templates
3. **Use TTLs**: Set TTLs for data that changes infrequently
4. **Invalidate after mutations**: Call `invalidate()` after writes to refetch
5. **Server execution**: Use `server: true` to fetch during SSR for initial render
