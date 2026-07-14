<script setup lang="ts">
definePage({
  head: {
    title: '个人资料'
  }
});
</script>

<template>
  <div class="profile-page">
    <h1>个人资料</h1>
    <p>
      嵌套路由:
      <code>/dashboard/profile</code>
    </p>
    <Link to="/dashboard">← 返回控制台</Link>
  </div>
</template>
