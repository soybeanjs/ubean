<script setup lang="ts">
definePage({
  head: {
    title: '设置'
  }
});
</script>

<template>
  <div class="settings-page">
    <h1>设置页面</h1>
    <p>
      嵌套路由:
      <code>/dashboard/settings</code>
    </p>
    <p>✅ 嵌套路由功能正常</p>
    <Link to="/dashboard">← 返回控制台</Link>
  </div>
</template>
