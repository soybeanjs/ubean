<script setup lang="ts">
import { SlotView } from 'ubean/client';

// 默认视图：与 `@aside/parallel.vue` 共享 `/parallel` 路由，用 `<SlotView>` 渲染插槽。
// （`SlotView` 从 `ubean/client` 导入 —— 主入口是聚合 barrel，客户端模块别从那儿引。）
definePage({
  name: 'ParallelDemo',
  meta: { title: 'Parallel Routes' }
});
</script>

<template>
  <section class="parallel-demo">
    <h1>Parallel Routes</h1>
    <p class="parallel-default">
      默认视图来自
      <code>pages/parallel.vue</code>
    </p>
    <SlotView name="aside" />
  </section>
</template>
