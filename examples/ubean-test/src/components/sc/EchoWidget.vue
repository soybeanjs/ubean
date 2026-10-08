<script setup lang="ts">
/**
 * Props 重渲染演示用的服务端岛屿组件（TS-36）。
 *
 * 它不需要是 `.server.vue`：`defineServerIsland(comp, { rerenderOnPropsChange: true })`
 * 会把组件注册到服务端注册表，`POST /__server-component` 用新 props 重新渲染并返回 HTML 片段。
 * 这里的 props 会直接出现在输出里，浏览器层据此断言「服务端真的用新 props 重渲染了」。
 */
defineProps<{ tone: string }>();
</script>

<template>
  <p class="echo-widget">Echo tone: {{ tone }}</p>
</template>
