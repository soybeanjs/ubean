<script setup lang="ts">
// 动态参数列表页:目录内 index.vue → /users(名称 Users)。
import { definePage } from '@ubean/vue';

definePage({ name: 'Users' });

const users = [
  { id: 1, name: '索易 Bean' },
  { id: 2, name: 'Vue Router' },
  { id: 3, name: 'KeepAlive' }
];
</script>

<template>
  <section>
    <h1>用户列表</h1>
    <p class="subtitle">路由 <code>/users</code> —— 子页 <code>[id=numeric].vue</code> 演示动态参数 + matcher</p>
    <ul class="users">
      <li v-for="u in users" :key="u.id">
        <Link :to="`/users/${u.id}`">#{{ u.id }} {{ u.name }}</Link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.users { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
.users a { color: #42b883; text-decoration: none; font-weight: 500; }
.users a:hover { text-decoration: underline; }
</style>
