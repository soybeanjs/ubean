<script setup lang="ts">
// 配对组件：磁盘上没有 ThemeBadge.vue，插件按同名 .server.vue / .client.vue 生成包装。
// 这里**刻意用别名**（`@/`）而不是相对路径：两种说明符都必须命中配对解析
// （旧实现只支持相对路径，别名会直接 `Cannot find module`），这条导入因此是 e2e 用例的判据。
import ThemeBadge from '@/components/sc/ThemeBadge.vue';
import BrowserClock from '../components/sc/BrowserClock.client.vue';
import ServerGreeting from '../components/sc/ServerGreeting.server.vue';

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
