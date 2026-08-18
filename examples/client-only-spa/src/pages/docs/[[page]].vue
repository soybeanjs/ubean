<script setup lang="ts">
// 可选参数:文件名 `[[page]]` → 路由 `/docs/:page?`(零或一个参数)。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { definePage } from '@ubean/vue';

definePage({ name: 'DocsPageOptional' });

const route = useRoute();
// typed-router 生效时 route.params 是全路由参数联合,此处按本页形状窄化。
const params = route.params as { page?: string };
const section = computed(() => params.page ?? 'intro');

const sections: Record<string, string> = {
  intro: '文档首页 —— 未带 :page 参数时渲染本节。',
  install: '安装章节 —— /docs/install。',
  advanced: '进阶章节 —— /docs/advanced。'
};
</script>

<template>
  <section>
    <h1>文档(可选参数)</h1>
    <p class="subtitle">路由 <code>/docs/:page?</code> —— 文件 <code>[[page]].vue</code></p>
    <div class="card">
      <p>当前章节:<strong class="mono">{{ section }}</strong></p>
      <p>{{ sections[section] ?? '未知章节' }}</p>
    </div>
    <nav class="toc">
      <Link to="/docs">intro</Link>
      <Link to="/docs/install">install</Link>
      <Link to="/docs/advanced">advanced</Link>
    </nav>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.card { border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 10px; padding: 1rem 1.25rem; }
.card p { margin: 0.3rem 0; }
.mono { font-family: 'SF Mono', ui-monospace, monospace; }
.toc { display: flex; gap: 1rem; margin-top: 1rem; }
.toc a { color: #42b883; text-decoration: none; }
</style>
