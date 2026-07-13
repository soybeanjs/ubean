<script setup lang="ts">
definePage({
  head: {
    title: '营销页面 (路由组测试)'
  }
});
</script>

<template>
  <div class="marketing-page">
    <h1>营销页面 (Route Group)</h1>
    <p>
      此页面位于
      <code>(marketing)</code>
      路由组目录中。
    </p>
    <p>
      路由组目录不影响 URL 路径，访问地址为
      <code>/marketing-page</code>
    </p>
    <p>
      ✅ 路由组
      <code>(group)</code>
      功能正常
    </p>
    <RouterLink to="/">← 返回首页</RouterLink>
  </div>
</template>
