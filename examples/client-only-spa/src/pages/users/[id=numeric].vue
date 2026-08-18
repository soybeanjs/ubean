<script setup lang="ts">
// 动态参数 + matcher 语法:文件名 `[id=numeric]` → 路由 `/users/:id` +
// meta.matchers = { id: 'numeric' };matcher 注册在 src/main.ts
// (defineMatcher('numeric', ...)),守卫 createMatcherGuard 校验失败重定向 404。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { definePage } from '@ubean/vue';

definePage({ name: 'UsersId', head: { title: '用户详情' } });

const route = useRoute();
// typed-router 生效时 route.params 是全路由参数联合,此处按本页形状窄化。
const params = route.params as { id?: string };
const id = computed(() => params.id ?? '');

const users: Record<string, string> = {
  '1': '索易 Bean',
  '2': 'Vue Router',
  '3': 'KeepAlive'
};
const name = computed(() => users[id.value] ?? '未知用户');
</script>

<template>
  <section>
    <h1>用户详情</h1>
    <p class="subtitle">路由 <code>/users/:id</code> + matcher <code>[id=numeric]</code></p>
    <div class="card">
      <p>参数 id = <strong class="mono">{{ id }}</strong></p>
      <p>用户 = <strong>{{ name }}</strong></p>
      <p class="mono">useRoute().fullPath = {{ route.fullPath }}</p>
    </div>
    <p class="hint">
      访问 <Link to="/users/abc">/users/abc</Link> 触发 matcher 校验失败 → 重定向 NotFound;
      <Link to="/users">返回列表</Link>
    </p>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.card { border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 10px; padding: 1rem 1.25rem; }
.card p { margin: 0.3rem 0; }
.mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.85rem; }
.hint { margin-top: 1.25rem; font-size: 0.88rem; color: gray; }
</style>
