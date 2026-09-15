<script setup lang="ts">
useHead({
  title: '404 · 页面不存在'
});
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>页面不存在</p>
    <Link to="/">返回首页</Link>
  </div>
</template>
