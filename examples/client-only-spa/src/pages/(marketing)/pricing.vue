<script setup lang="ts">
// 路由组:`(marketing)/` 目录名不参与 URL 与路由名 → 路由 /pricing。
// 用途:按业务域分组组织文件,不改变路由结构。
import { definePage } from '@ubean/vue';

definePage({ name: 'Pricing', head: { title: '定价 - @ubean/vue SPA' } });

const plans = [
  { name: 'Lean', price: '0', desc: 'vue + vue-router,内核即全部' },
  { name: 'Aggregator', price: '0', desc: '+ routing(服务端路由聚合)' },
  { name: 'Framework', price: '0', desc: '+ client(head/i18n/islands/SSR)' }
];
</script>

<template>
  <section>
    <h1>定价(路由组)</h1>
    <p class="subtitle">路由 <code>/pricing</code> —— 文件 <code>(marketing)/pricing.vue</code>(组名剥离)</p>
    <ul class="plans">
      <li v-for="p in plans" :key="p.name">
        <strong>{{ p.name }}</strong>
        <span class="price">¥{{ p.price }}</span>
        <span class="desc">{{ p.desc }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.plans { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.9rem; }
.plans li { border: 1px solid rgba(128, 128, 128, 0.25); border-radius: 10px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
.price { color: #42b883; font-weight: 700; }
.desc { color: gray; font-size: 0.85rem; }
</style>
