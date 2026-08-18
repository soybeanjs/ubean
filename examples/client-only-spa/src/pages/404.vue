<script setup lang="ts">
// 特殊页:pages/404.vue 由 vite 插件注册为 catch-all /:pathMatch(.*)*
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <section class="not-found">
    <h1>404</h1>
    <p class="mono">未匹配的路径:{{ route.fullPath }}</p>
    <p>
      回到 <Link to="/">首页</Link>
    </p>
  </section>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding: 4rem 0;
}

h1 {
  font-size: 4rem;
  color: #42b883;
  margin-bottom: 0.5rem;
}

.mono {
  font-family: 'SF Mono', ui-monospace, monospace;
  color: gray;
  margin-bottom: 1rem;
}
</style>
