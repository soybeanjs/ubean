<script setup lang="ts">
// 服务端岛屿（P9-04）用的**异步**组件：`await` 让它必须走 Suspense 边界。
const label = await new Promise<string>(resolve => setTimeout(() => resolve('island-resolved'), 50));
</script>

<template>
  <p class="slow-widget">服务端岛屿内容：{{ label }}</p>
</template>
