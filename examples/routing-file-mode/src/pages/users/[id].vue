<script setup lang="ts">
import { useRoute } from 'vue-router';

useHead({
  title: '用户详情 - routing-file-mode'
});

// 传入路由名 'UsersId' 作为泛型参数,vue-router 会根据 `.ubean/typed-router.d.ts`
// 中的 `RouteNamedMap` 自动推断 `route.params.id` 的类型为 `ParamValue<true>`(string),
// 无需手动 `as string` 断言。
const route = useRoute('UsersId');
const userId = route.params.id ?? 'unknown';
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
        通过
        <code>useRoute().params.id</code>
        获取动态参数
      </p>
    </div>
    <p class="note">
      ✅ 动态路由
      <code>[id].vue</code>
      在 file 模式下同样正常工作
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
