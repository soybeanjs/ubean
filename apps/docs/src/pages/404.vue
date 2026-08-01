<script setup lang="ts">
// Standalone 404 page. Auto-detected by the framework as the catch-all route
// for both Vue Router (/:pathMatch(.*)*) and Hono (GET * fallback returning
// HTTP 404). Replaces the inline 404 rendering in [...slug].vue.
import { computed } from 'vue';
import { useRoute } from 'vue-router';

definePage({
  layout: 'default'
});

const route = useRoute();
const isZh = computed(() => route.path.startsWith('/zh'));
const prefix = computed(() => isZh.value ? '/zh' : '');
const homeTo = computed(() => `${prefix.value}/`);
</script>

<template>
  <main class="mx-auto flex min-w-0 max-w-2xl flex-col items-center py-24 text-center">
    <p class="mb-2 text-7xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300">
      404
    </p>
    <h1 class="mb-3 text-2xl font-bold">{{ isZh ? '页面未找到' : 'Page not found' }}</h1>
    <p class="mb-8 max-w-md text-muted-foreground">
      {{ isZh ? '您访问的页面不存在或已被移动。' : "The page you're looking for doesn't exist or has been moved." }}
    </p>
    <SButtonLink size="lg" shape="rounded" :to="homeTo">
      <SIcon icon="lucide:home" />
      {{ isZh ? '返回首页' : 'Back to home' }}
    </SButtonLink>
  </main>
</template>
