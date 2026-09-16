<script setup lang="ts">
import BrowserClock from '../components/sc/BrowserClock.client.vue';
import ServerGreeting from '../components/sc/ServerGreeting.server.vue';
// 配对组件：磁盘上没有 ThemeBadge.vue，插件按同名 .server.vue / .client.vue 生成包装
import ThemeBadge from '../components/sc/ThemeBadge.vue';

definePage({
  name: 'ServerComponents',
  meta: { title: 'Server / Client Components' }
});
</script>

<template>
  <section class="server-components">
    <h1>Server / Client Components</h1>
    <ServerGreeting />
    <BrowserClock />
    <ThemeBadge />
  </section>
</template>
