<script setup lang="ts">
// 特殊页 error:根级 error.vue 不生成路由,经虚拟模块 errorComponent 导出,
// 由 main.ts provide(ERROR_KEY) 接入 PageView 的 <ErrorBoundary> 渲染。
defineProps<{ error?: unknown }>();
const message = (props: { error?: unknown }) => {
  const err = props.error as { message?: string } | undefined;
  return err?.message ?? String(props.error ?? '未知错误');
};
const reload = () => window.location.reload();
</script>

<template>
  <div class="error" role="alert">
    <h1>页面出错了</h1>
    <p class="mono">{{ message({ error }) }}</p>
    <button type="button" @click="reload">重新加载</button>
  </div>
</template>

<style scoped>
.error { padding: 2rem 0; color: #dc2626; }
h1 { font-size: 1.3rem; margin-bottom: 0.6rem; }
.mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.85rem; word-break: break-all; }
button { margin-top: 1rem; cursor: pointer; border: 1px solid rgba(220, 38, 38, 0.5); background: transparent; color: inherit; border-radius: 6px; padding: 5px 12px; }
</style>
