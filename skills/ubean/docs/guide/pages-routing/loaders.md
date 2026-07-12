# Data Loaders

Load data on the server before rendering a page.

## Basic Loader

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const data = await defineLoader(() => {
  return {
    posts: [
      { id: 1, title: 'Getting Started' },
      { id: 2, title: 'Advanced Topics' }
    ]
  };
});
</script>

<template>
  <ul>
    <li v-for="post in data.posts" :key="post.id">
      {{ post.title }}
    </li>
  </ul>
</template>
```

## Async Loaders

Fetch data from APIs or databases:

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const data = await defineLoader(async () => {
  const response = await fetch('https://api.example.com/posts');
  return response.json();
});
</script>
```

## Loader Context

Access request information:

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const data = await defineLoader(async ctx => {
  // Get route parameters
  const { id } = ctx.params;

  // Get query parameters
  const { page } = ctx.query;

  // Get request headers
  const auth = ctx.headers.get('Authorization');

  // Access runtime environment
  const apiUrl = ctx.env.API_URL;

  return { id, page };
});
</script>
```

## Multiple Loaders

Combine multiple loaders:

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const posts = await defineLoader(async () => {
  const res = await fetch('/api/posts');
  return res.json();
});

const user = await defineLoader(async () => {
  const res = await fetch('/api/user');
  return res.json();
});
</script>
```

## Dependent Loaders

Loaders can depend on each other:

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const post = await defineLoader(async ctx => {
  const res = await fetch(`/api/posts/${ctx.params.id}`);
  return res.json();
});

// This loader depends on the first one
const comments = await defineLoader(async () => {
  const res = await fetch(`/api/posts/${post.id}/comments`);
  return res.json();
});
</script>
```

## Error Handling

Handle errors in loaders:

```vue
<script setup lang="ts">
import { defineLoader, createError } from '@ubean/core';

const data = await defineLoader(async ctx => {
  const res = await fetch(`/api/posts/${ctx.params.id}`);

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: 'Post not found'
    });
  }

  return res.json();
});
</script>
```

## Caching

Cache loader results:

```vue
<script setup lang="ts">
import { defineLoader } from '@ubean/core';

const data = await defineLoader(
  async () => {
    const res = await fetch('/api/posts');
    return res.json();
  },
  {
    cache: {
      maxAge: 60 // Cache for 60 seconds
    }
  }
);
</script>
```

## Deferred Loading

Load non-critical data asynchronously:

```vue
<script setup lang="ts">
import { defineLoader, defer } from '@ubean/core';

const data = await defineLoader(async () => {
  return {
    posts: await fetch('/api/posts').then(res => res.json()),
    comments: defer(fetch('/api/comments').then(res => res.json()))
  };
});

// Access deferred data when needed
const comments = await data.comments;
</script>
```

## Client-Side Data Fetching

For client-only data, use Vue's `onMounted`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

const data = ref(null);

onMounted(async () => {
  const res = await fetch('/api/data');
  data.value = await res.json();
});
</script>
```

## Best Practices

1. **Keep loaders focused**: Each loader should do one thing
2. **Error handling**: Always handle errors gracefully
3. **Caching**: Cache expensive operations
4. **Defer non-critical data**: Use defer for secondary data
5. **Security**: Never trust user input in loaders
