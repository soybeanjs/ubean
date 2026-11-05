<script setup lang="ts">
import { useRoute } from 'vue-router';

defineOptions({ name: 'PlaygroundPage' });

// `definePage({ alias })` 在 SSG 直接渲染路径下的验证点：别名会被
// `compilePageRouteWithAliases` 匹配（fetcher 能渲染它），也会进预渲染候选池。
// 注意 ssg 示例的 `prerender.include` 是白名单，所以 `include` 里也要列出别名。
definePage({ alias: '/play' });

const route = useRoute();
</script>

<template>
  <div class="page">
    <h1 class="page-title">Playground</h1>
    <p class="page-path">
      当前路径:
      <code>{{ route.path }}</code>
    </p>
    <p class="page-hint">这是一个静态页面(非 catch-all),用于对照验证普通页面与动态页面的产物差异。</p>
  </div>
</template>

<style scoped>
.page-title {
  margin-bottom: 1rem;
}

.page-path {
  margin-bottom: 0.5rem;
}

.page-path code {
  background: #f1f5f9;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.page-hint {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.6;
}
</style>
