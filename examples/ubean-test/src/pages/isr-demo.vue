<script lang="ts">
// 每次**渲染**产生一个不同的 token；ISR 生效时，重复请求应拿到同一个 token（命中缓存）。
export async function loader() {
  return { token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { usePage } from 'ubean/client';

definePage({
  name: 'IsrDemo',
  meta: { title: 'ISR Demo' }
});

const page = usePage<{ token?: string }>();
const token = computed(() => page.props?.token ?? '');
</script>

<template>
  <section class="isr-demo">
    <h1>ISR Demo</h1>
    <p class="isr-token">{{ token }}</p>
  </section>
</template>
