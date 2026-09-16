<script setup lang="ts">
// 配对组件的客户端变体：水合完成后由包装组件切换过来（可依赖浏览器 API）。
const origin = 'paired.client';
</script>

<template>
  <p class="paired-client">配对组件（水合后，客户端变体）：{{ origin }}</p>
</template>
