<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

definePage({
  name: 'OrderDetail',
  // `[id=numeric]` → 该参数必须匹配名为 `numeric` 的 matcher（见 `src/matchers.ts`）。
  // 不匹配时：服务端 router 直接 404；客户端 SPA 导航由 `createMatcherGuard()` 拦下。
  meta: { title: 'Order Detail' }
});

const route = useRoute();
const orderId = computed(() => String(route.params.id ?? ''));
</script>

<template>
  <section class="order-detail">
    <h1>Order Detail</h1>
    <p class="order-id">订单号：{{ orderId }}</p>
  </section>
</template>
