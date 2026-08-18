<script setup lang="ts">
// catch-all:文件名 `[...slug]` → 路由 `/blog/**:slug`(零或多个参数,数组)。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { definePage } from '@ubean/vue';

definePage({ name: 'BlogAllSlug' });

const route = useRoute();
// typed-router 生效时 route.params 是全路由参数联合,此处按本页形状窄化。
const params = route.params as { slug?: string[] };
const crumbs = computed(() => params.slug ?? []);
</script>

<template>
  <section>
    <h1>博客(catch-all)</h1>
    <p class="subtitle">路由 <code>/blog/**:slug</code> —— 文件 <code>[...slug].vue</code></p>
    <div class="card">
      <p>slug 段数:<strong>{{ crumbs.length }}</strong></p>
      <ol class="crumbs">
        <li v-for="(c, i) in crumbs" :key="i" class="mono">{{ c }}</li>
      </ol>
    </div>
    <nav class="toc">
      <Link to="/blog">/blog</Link>
      <Link to="/blog/vue/release-notes">/blog/vue/release-notes</Link>
      <Link to="/blog/2026/08/kernel">/blog/2026/08/kernel</Link>
    </nav>
  </section>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.subtitle { color: gray; margin-bottom: 1.25rem; font-size: 0.92rem; }
.card { border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 10px; padding: 1rem 1.25rem; }
.crumbs { margin: 0.5rem 0 0 1.2rem; }
.mono { font-family: 'SF Mono', ui-monospace, monospace; }
.toc { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
.toc a { color: #42b883; text-decoration: none; }
</style>
