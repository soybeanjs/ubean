<script setup lang="ts">
import { ref } from 'vue';
import { defineServerIsland } from 'ubean/client';
import EchoWidget from '../components/sc/EchoWidget.vue';

definePage({
  name: 'ServerIslandProps',
  meta: { title: 'Server Island Props' }
});

// 服务端岛屿 + props 重渲染（TS-36）。
// Vite 插件在构建时把组件绝对路径注入为第 3 个参数，`defineServerIsland` 据此：
//   · SSR 端注册组件到全局注册表（`POST /__server-component` 用它渲染）
//   · 客户端 `onMounted` 后立即 POST 一次、`watch(attrs)` 在 props 变化时再 POST
const tone = ref('calm');
const Island = defineServerIsland(EchoWidget, { rerenderOnPropsChange: true });

function toggleTone(): void {
  tone.value = tone.value === 'calm' ? 'loud' : 'calm';
}
</script>

<template>
  <section class="server-island-props">
    <h1>Server Island Props</h1>
    <p class="current-tone">tone={{ tone }}</p>
    <button class="tone-toggle" type="button" @click="toggleTone">Toggle tone</button>
    <Island :tone="tone" />
  </section>
</template>
