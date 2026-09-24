---
title: 数据加载器
description: "用 useData 声明式获取数据：缓存、TTL 与失效。"
---

# 数据获取（useData）

ubean 提供 `useData()` 用于声明式数据获取，支持缓存、TTL 与失效。它从 `ubean/client` 自动导入（位于 `UBEAN_CLIENT_PRESET` 中）。

> ubean **不**提供 `defineLoader`。要在服务端或客户端获取数据，请在 `<script setup>` 里使用 `useData()`。

## 基本用法

`useData` 接收单个 options 对象 —— `key`（稳定的字符串）加上 `fetcher`（加载数据的异步函数）。它在 `<script setup>` 中被直接 `await`：

```vue
<script setup lang="ts">
// useData 是自动导入的
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

## 异步 fetcher

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

## 读取路由参数

在 fetcher 内读取路由参数请用 `useRouter()`（从 `vue-router` 导入，或启用 `autoImports: { vueRouter: true }`）：

```vue
<script setup lang="ts">
const router = useRouter();

const { data: post } = await useData({
  key: `post-${router.currentRoute.value.params.id}`,
  fetcher: () => fetch(`/api/posts/${router.currentRoute.value.params.id}`).then(r => r.json())
});
</script>
```

## 多个数据源

组合多个 `useData` 调用：

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

## 依赖型数据

缓存键是静态字符串 —— `useData` 每次挂载对同一个 key 只获取一次。要在依赖变化时重新获取，请调用 `refresh()`（例如在 watcher 里）：

```vue
<script setup lang="ts">
import { computed, watch } from 'vue';

const router = useRouter();
const postId = computed(() => router.currentRoute.value.params.id as string);

const { data: post, refresh } = await useData({
  key: `post-${postId.value}`,
  fetcher: () => fetch(`/api/posts/${postId.value}`).then(r => r.json())
});

// 路由参数变化时重新获取
watch(postId, () => refresh());
</script>
```

## 缓存与 TTL

```vue
<script setup lang="ts">
const { data } = await useData({
  key: 'config',
  fetcher: () => fetch('/api/config').then(r => r.json()),
  ttl: 60_000,   // 缓存 60 秒
  tags: ['config'], // 用于按组失效的标签（invalidateData('config')）
  dedupe: true   // 合并同 key 的进行中请求（默认开启）
});
</script>
```

## 刷新与失效

```vue
<script setup lang="ts">
const { data, refresh, invalidate } = await useData({
  key: 'posts',
  fetcher: fetchPosts
});

async function handleRefresh() {
  await refresh();
}

// 使该 key 失效（下次访问时重新获取）
function handleInvalidate() {
  invalidate();
}
</script>
```

## 错误处理

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

## 仅客户端获取

对于只应在客户端加载的数据（水合之后），使用 Vue 的 `onMounted`：

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

## API 路由

服务端数据推荐用 `defineHandler` 写 API 路由：

```typescript
// src/routes/api/posts.ts
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(async c => {
  const posts = await fetchPostsFromDB();
  return c.json({ posts });
});
```

## 最佳实践

1. **稳定的 key**：使用稳定的字符串 key，才能跨组件共享缓存
2. **处理错误**：始终在模板中处理 `error` 状态
3. **设置 TTL**：为不常变更的数据设置 TTL
4. **写操作后失效**：写入完成后调用 `invalidate()` 重新获取
5. **SSR 数据载荷**：SSR 期间通过 `useData` 获取的数据会序列化进 `__UBEAN_DATA__` 载荷，并在客户端自动水合 —— 无需额外配置

## useFetch

`useFetch` 包装了 `useAsyncData`。它**不**自研 HTTP 客户端：请通过 `setDefaultFetch(createRequest())`（或 `options.request`）传入一个鸭子类型的 `@soybeanjs/fetch` 实例。未提供客户端时，它回退到 `fetch` + JSON。

```vue
<script setup lang="ts">
import { createRequest } from '@soybeanjs/fetch';

setDefaultFetch(createRequest());

const { data, pending, refresh } = await useFetch('posts', '/api/posts');
</script>
```
