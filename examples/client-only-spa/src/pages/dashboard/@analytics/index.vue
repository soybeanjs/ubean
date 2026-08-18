<script setup lang="ts">
// 并行路由(命名视图):`@analytics/` 目录注册为 /dashboard 路由的
// "analytics" 命名视图,由 dashboard/index.vue 内的 SlotView 渲染。
import { ref, onMounted } from 'vue';

const visits = ref(0);
onMounted(() => {
  visits.value = 1284;
});
</script>

<template>
  <div class="analytics">
    <p class="stat">访问量:<strong>{{ visits }}</strong></p>
    <p class="stat">来源:@analytics/index.vue</p>
  </div>
</template>

<style scoped>
.stat { margin: 0.25rem 0; font-size: 0.9rem; }
strong { color: #42b883; }
</style>
