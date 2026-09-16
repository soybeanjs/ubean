<script setup lang="ts">
// 配对组件（Task 9.3）的服务端变体：SSR 与客户端首帧都用它。
// 导入方式是 `import ThemeBadge from './ThemeBadge.vue'` —— 该文件**不需要存在**，
// 插件检测到同名 `.server.vue` + `.client.vue` 后会重定向到虚拟包装模块。
const origin = 'paired.server';
</script>

<template>
  <p class="paired-server">配对组件（首帧，服务端变体）：{{ origin }}</p>
</template>
