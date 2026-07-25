<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

useHead({
  title: '用户详情 - frontend-only'
});

// useRoute 来自 vue-router(ubean 内部依赖,无需额外安装)
const route = useRoute();
const userId = computed(() => (route.params.id as string) || 'unknown');
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
        <code>/users/[id]</code>
        →
        <code>/users/{{ userId }}</code>
      </p>
      <p class="route-info">
        完整路径:
        <code>{{ route.fullPath }}</code>
      </p>
    </div>
    <p class="note">
      ✅ 动态路由
      <code>[id].vue</code>
      参数解析正常(通过 vue-router 的
      <code>useRoute()</code>
      获取)
    </p>
    <p class="links">
      尝试其他 ID:
      <Link to="/users/1">1</Link>
      ·
      <Link to="/users/2">2</Link>
      ·
      <Link to="/users/42">42</Link>
    </p>
    <Link to="/" class="back-link">← 返回首页</Link>
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

.links {
  margin: 1rem 0;
  color: #555;
}

.links a {
  color: #42b883;
  text-decoration: none;
  font-weight: 500;
  margin: 0 0.2rem;
}

.links a:hover {
  text-decoration: underline;
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
