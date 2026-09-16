<script setup lang="ts">
import { defer, useDeferredData } from 'ubean/client';

definePage({
  name: 'DeferredDemo',
  meta: { title: 'Deferred Demo' }
});

// 非关键数据：SSR 不阻塞首屏，主内容之后把结果流式注入 `__UBEAN_DEFERRED__`；
// 客户端水合时从该 script 标签直接读取（无二次请求、无闪烁）。
const { data: extra, pending } = useDeferredData(
  'extra',
  defer(
    () =>
      new Promise<{ text: string }>(resolve => {
        setTimeout(() => resolve({ text: 'deferred-resolved' }), 60);
      })
  )
);
</script>

<template>
  <section class="deferred-demo">
    <h1>Deferred Demo</h1>
    <p class="deferred-critical">critical-inline</p>
    <p v-if="pending" class="deferred-pending">deferred-pending</p>
    <p v-else class="deferred-value">{{ extra?.text }}</p>
  </section>
</template>
