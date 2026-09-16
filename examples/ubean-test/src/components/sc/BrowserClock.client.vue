<script setup lang="ts">
import { onMounted, ref } from 'vue';

// Client Component（Task 9.2）：`.client.vue` 在 SSR 输出 `<div data-client-only>` 占位符，
// 客户端挂载后才渲染真实内容（依赖浏览器 API 的组件适用）。
const ticks = ref(0);
onMounted(() => {
  ticks.value = 1;
});
</script>

<template>
  <p class="sc-client">Client Component 已挂载（ticks={{ ticks }}）</p>
</template>
