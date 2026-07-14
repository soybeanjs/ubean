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
      <li><Link to="/dashboard/settings">设置页面</Link></li>
      <li><Link to="/dashboard/profile">个人资料</Link></li>
    </ul>
    <Link to="/">← 返回首页</Link>
  </div>
</template>
