<script setup lang="ts">
// 特殊页 loading:根级 loading.vue 不生成路由,经虚拟模块 loadingComponent
// 导出,由 main.ts provide(LOADING_KEY) 接入 PageView 的 <Suspense> fallback。
defineProps<{ retrying?: boolean }>();
</script>

<template>
  <div class="loading" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true" />
    <span>{{ retrying ? '重新加载中…' : '页面加载中…' }}</span>
  </div>
</template>

<style scoped>
.loading { display: flex; align-items: center; gap: 0.6rem; color: gray; padding: 2rem 0; }
.spinner { width: 16px; height: 16px; border: 2px solid rgba(66, 184, 131, 0.3); border-top-color: #42b883; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
