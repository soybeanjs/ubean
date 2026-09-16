<script setup lang="ts">
import { defineServerIsland } from 'ubean/client';
import SlowWidget from '../components/sc/SlowWidget.vue';

definePage({
  name: 'ServerIslandDemo',
  meta: { title: 'Server Island Demo' }
});

// 服务端岛屿：异步组件包在 Suspense 里；`fallback` 是首屏（或流式期间）显示的内容。
// 组件必须是异步的（`async setup()` / `defineAsyncComponent`）才会真正流式。
const Island = defineServerIsland(SlowWidget, { fallback: 'island-fallback' });
</script>

<template>
  <section class="server-island-demo">
    <h1>Server Island Demo</h1>
    <Suspense>
      <template #default><Island /></template>
      <template #fallback><p class="island-fallback">island-fallback</p></template>
    </Suspense>
  </section>
</template>
