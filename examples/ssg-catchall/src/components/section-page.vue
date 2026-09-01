<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

defineOptions({ name: 'SectionPage' });

const route = useRoute();

const segments = computed(() => route.path.split('/').filter(Boolean));
const title = computed(() => segments.value.join(' / ') || 'Home');
</script>

<template>
  <div class="page">
    <h1 class="page-title">{{ title }}</h1>
    <p class="page-path">
      当前路径:
      <code>{{ route.path }}</code>
    </p>
    <p class="page-hint">
      此页面由 catch-all 路由(
      <code>[...slug].vue</code>
      )在 SSG 模式下渲染。产物 chunk 名为
      <code>_...slug_-*.js</code>
      ,用于验证 preview 静态服务器能正确返回该文件(文件名含
      <code>...</code>
      ,不应被路径穿越校验误判为 400)。
    </p>
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
