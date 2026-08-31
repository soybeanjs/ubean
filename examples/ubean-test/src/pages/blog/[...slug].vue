<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

definePage({
  path: '/blog/:slug(.*)*'
});

const route = useRoute('BlogAllSlug');
const slug = computed(() => {
  const value = route.params.slug;
  if (Array.isArray(value)) return value.filter(Boolean).join('/');
  return typeof value === 'string' ? value : '';
});
</script>

<template>
  <article>
    <h1>Blog {{ slug }}</h1>
    <p>
      Catch-all file route for
      <code>@ubean/content</code>
      . Prerender URLs come from
      <code>discoverContentPageRoutes</code>
      /
      <code>extractContentPageRoutes</code>
      .
    </p>
  </article>
</template>
