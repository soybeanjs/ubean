<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

definePage({
  name: 'OrderDetail',
  // `[id=numeric]` → 该参数必须匹配名为 `numeric` 的 matcher（见 `src/matchers.ts`）。
  // 不匹配时：服务端 router 直接 404；客户端 SPA 导航由 `createMatcherGuard()` 拦下。
  meta: { title: 'Order Detail' }
});

// 传路由名拿类型化的 route：不带参数的 `useRoute()` 的 params 是**全部路由的联合**
// （`Record<never,never> | { slug?: string } | { id: string } | …`），`.id` 在这个联合上不成立；
// 带上 `'OrderDetail'` 后才收窄成本路由的参数（见 `.ubean/typed-router.d.ts` 的 `TypesConfig` 增强）。
const route = useRoute('OrderDetail');
const orderId = computed(() => String(route.params.id ?? ''));
</script>

<template>
  <section class="order-detail">
    <h1>Order Detail</h1>
    <p class="order-id">订单号：{{ orderId }}</p>
  </section>
</template>
