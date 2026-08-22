---
title: Loaders
description: "Declarative data fetching with useData: caching, TTL, and invalidation."
---

# Data Fetching (useData)

ubean provides `useData()` for declarative data fetching with caching, TTL, and invalidation. It is auto-imported from `ubean` (in the `UBEAN_SERVER_PRESET`).

> ubean does **not** provide `defineLoader`. Use `useData()` inside `<script setup>` for server-side or client-side data fetching.

## Basic Usage

`useData` takes a single options object — `key` (a stable string) plus `fetcher` (the async function that loads the data). It is `await`ed directly in `<script setup>`:

```vue
<script setup lang="ts">
// useData is auto-imported
const { data, error, loading, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});
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
const { data } = await useData({
  key: 'user',
  fetcher: async () => {
    const res = await fetch('/api/user');
    return res.json();
  }
});
</script>
```

## Reading Route Params

Use `useRouter()` to read route params inside the fetcher:

```vue
<script setup lang="ts">
const router = useRouter();

const { data: post } = await useData({
  key: `post-${router.currentRoute.value.params.id}`,
  fetcher: () => fetch(`/api/posts/${router.currentRoute.value.params.id}`).then(r => r.json())
});
</script>
```

## Multiple Sources

Combine multiple `useData` calls:

```vue
<script setup lang="ts">
const { data: posts } = await useData({
  key: 'posts',
  fetcher: () => fetch('/api/posts').then(r => r.json())
});

const { data: user } = await useData({
  key: 'user',
  fetcher: () => fetch('/api/user').then(r => r.json())
});
</script>
```

## Dependent Data

Cache keys are static strings — `useData` fetches once per key per mount. To refetch when a dependency changes, call `refresh()` (e.g., from a watcher):

```vue
<script setup lang="ts">
import { computed, watch } from 'vue';

const router = useRouter();
const postId = computed(() => router.currentRoute.value.params.id as string);

const { data: post, refresh } = await useData({
  key: `post-${postId.value}`,
  fetcher: () => fetch(`/api/posts/${postId.value}`).then(r => r.json())
});

// Refetch when the route param changes
watch(postId, () => refresh());
</script>
```

## Caching & TTL

```vue
<script setup lang="ts">
const { data } = await useData({
  key: 'config',
  fetcher: () => fetch('/api/config').then(r => r.json()),
  ttl: 60_000,   // Cache for 60 seconds
  tags: ['config'], // Tag for group invalidation (invalidateData('config'))
  dedupe: true   // Share in-flight requests with the same key (default)
});
</script>
```

## Refresh & Invalidation

```vue
<script setup lang="ts">
const { data, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: fetchPosts
});

async function handleRefresh() {
  await refresh();
}

// Invalidate this key (refetches on next access)
function handleInvalidate() {
  invalidate();
}
</script>
```

## Error Handling

```vue
<script setup lang="ts">
const { data, error } = await useData({
  key: 'posts',
  fetcher: async () => {
    const res = await fetch('/api/posts');
    if (!res.ok) {
      throw new Error(`Failed: ${res.status}`);
    }
    return res.json();
  }
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
5. **SSR payloads**: Data fetched via `useData` during SSR is serialized into the `__UBEAN_DATA__` payload and hydrated on the client automatically — no extra config needed

## useFetch

`useFetch` wraps `useAsyncData`. It does **not** invent an HTTP client: pass a duck-typed `@soybeanjs/fetch` instance via `setDefaultFetch(createRequest())` (or `options.request`). Without a client it falls back to `fetch` + JSON.

```vue
<script setup lang="ts">
import { createRequest } from '@soybeanjs/fetch';

setDefaultFetch(createRequest());

const { data, pending, refresh } = await useFetch('posts', '/api/posts');
</script>
```
