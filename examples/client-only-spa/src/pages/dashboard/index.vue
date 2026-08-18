<script setup lang="ts">
// 并行路由(主视图):`dashboard/index.vue` 是 /dashboard 的 default 视图;
// 同目录 `@analytics/index.vue` 注册为命名视图 —— 虚拟模块生成
// `components: { default, analytics }`,SlotView(<RouterView name>)渲染。
import { definePage } from '@ubean/vue';

definePage({ name: 'Dashboard' });
</script>

<template>
  <section>
    <h1>仪表盘(并行路由)</h1>
    <p class="subtitle">
      路由 <code>/dashboard</code> —— 主视图 + 命名视图
      <code>@analytics/</code> 同屏渲染
    </p>
    <div class="grid">
      <div class="card main-panel">
        <h2>主视图</h2>
        <p>dashboard/index.vue(default 视图)</p>
      </div>
      <div class="card slot-panel">
        <h2>命名视图 slot</h2>
        <!-- SlotView = <RouterView name="analytics">,渲染 @analytics/index.vue -->
        <SlotView name="analytics" />
      </div>
    </div>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.card { border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 10px; padding: 1rem 1.25rem; }
.slot-panel { background: rgba(66, 184, 131, 0.06); }
h2 { font-size: 0.95rem; margin-bottom: 0.5rem; }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style>
