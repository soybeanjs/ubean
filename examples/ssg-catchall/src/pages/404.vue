<script setup lang="ts">
defineOptions({ name: 'NotFoundPage' });
</script>

<template>
  <div class="page">
    <h1 class="page-title">404</h1>
    <p class="page-hint">
      页面不存在。SSG 模式下本页面会被渲染为
      <code>404.html</code>
      ，供静态托管平台自定义 404 页使用。
    </p>
    <a href="/">返回首页</a>
  </div>
</template>

<style scoped>
.page-title {
  margin-bottom: 1rem;
}

.page-hint {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.page-hint code {
  background: #f1f5f9;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9rem;
}
</style>
