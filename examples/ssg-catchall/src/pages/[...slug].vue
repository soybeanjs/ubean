<script setup lang="ts">
// 根级 catch-all(仿照 docs 的 src/pages/[...slug].vue)
import SectionPage from '../components/section-page.vue';

defineOptions({ name: 'CatchAllRootPage' });
</script>

<template>
  <SectionPage />
</template>
