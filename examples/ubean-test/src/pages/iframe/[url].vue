<script setup lang="ts">
// 通用 iframe 承载页。自己的 URL 形态是 `/iframe/:url`（参数即 src），
// 同时作为 reuse 目标被 `routing.onPages` 借走组件 —— 见 ubean.config.ts 的钩子
// 与 `pages/docs/a.meta.ts`。
//
// catch-all 形态下 vue-router 给的是分段数组，统一归一成一个字符串。
import { computed } from 'vue';
import { definePage } from 'ubean/client';

definePage({ name: 'IframeUrl', props: true, meta: { title: 'Iframe' } });

const props = defineProps<{ url: string | string[]; title?: string }>();
const src = computed(() => (Array.isArray(props.url) ? props.url.join('/') : props.url));
</script>

<template>
  <div class="iframe-page">
    <h1>{{ props.title || 'Iframe' }}</h1>
    <p class="iframe-src">
      src:
      <code>{{ src }}</code>
    </p>
    <iframe :src="src" class="iframe-frame" title="embedded" loading="lazy" />
  </div>
</template>

<style scoped>
.iframe-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
}
</style>
