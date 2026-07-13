<script setup lang="ts">
definePage({
  meta: {
    title: '用户详情'
  }
});

const page = usePage();
const userId = page.params.id || 'unknown';
</script>

<template>
  <div class="user-page">
    <h1>用户详情页</h1>
    <div class="user-card">
      <p class="user-id">
        用户 ID:
        <strong>{{ userId }}</strong>
      </p>
      <p class="route-info">
        当前路由:
        <code>/user/[id]</code>
        →
        <code>/user/{{ userId }}</code>
      </p>
      <p class="route-info">
        当前 URL:
        <code>{{ page.url }}</code>
      </p>
    </div>
    <p class="note">
      ✅ 动态路由
      <code>[id].vue</code>
      参数解析正常 (通过 usePage().params 获取)
    </p>
    <a href="/" class="back-link">← 返回首页</a>
  </div>
</template>

<style scoped>
.user-page h1 {
  color: #42b883;
  font-size: 2rem;
  margin-bottom: 1.5rem;
}

.user-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  margin-bottom: 1rem;
}

.user-id {
  font-size: 1.2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.user-id strong {
  color: #42b883;
  font-size: 1.5rem;
}

.route-info {
  color: #666;
  font-size: 0.95rem;
  margin: 0.3rem 0;
}

.route-info code {
  background: #e9ecef;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.note {
  color: #2e7d32;
  font-weight: 500;
  margin: 1rem 0;
}

.note code {
  background: #e8f5e9;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.85rem;
}

.back-link {
  display: inline-block;
  margin-top: 1rem;
  color: #42b883;
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
