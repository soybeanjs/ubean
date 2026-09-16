<script setup lang="ts">
// 并行路由（P9-18）：`@aside/` 目录段不贡献 URL —— 本文件的 route 与 `pages/parallel.vue`
// 同为 `/parallel`，两者被归入**同一条** Vue Router 记录（`components: { default, aside }`），
// 由默认视图里的 `<SlotView name="aside" />` 渲染。
definePage({
  name: 'ParallelAside',
  meta: { title: 'Parallel · aside' }
});
</script>

<template>
  <aside class="slot-aside">
    <h2>Aside slot</h2>
    <p>
      这段来自
      <code>@aside/parallel.vue</code>
      （并行路由插槽）。
    </p>
  </aside>
</template>
