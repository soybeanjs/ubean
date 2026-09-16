<script setup lang="ts">
// Server Component（Task 9.1）：`.server.vue` **只在服务端渲染**，客户端构建里被换成通用 stub，
// 组件实现不会进入客户端产物（可以用只存在于服务端的东西，如读环境变量）。
const renderedAt = 'server-only';
</script>

<template>
  <p class="sc-server">来自 Server Component（仅服务端渲染）：{{ renderedAt }}</p>
</template>
