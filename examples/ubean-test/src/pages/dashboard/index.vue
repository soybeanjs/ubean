<script setup lang="ts">
definePage({
  head: {
    title: '控制台'
  }
});
</script>

<template>
  <div class="dashboard-page">
    <h1>控制台首页</h1>
    <p>
      这是嵌套路由示例 -
      <code>/dashboard</code>
    </p>
    <p>子页面：</p>
    <ul>
      <li><RouterLink to="/dashboard/settings">设置页面</RouterLink></li>
      <li><RouterLink to="/dashboard/profile">个人资料</RouterLink></li>
    </ul>
    <RouterLink to="/">← 返回首页</RouterLink>
  </div>
</template>
