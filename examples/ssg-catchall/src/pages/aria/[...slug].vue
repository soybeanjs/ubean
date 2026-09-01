<script setup lang="ts">
// ARIA 分区 catch-all(仿照 docs 的 src/pages/aria/[...slug].vue)
import SectionPage from '../../components/section-page.vue';

defineOptions({ name: 'AriaSectionPage' });
</script>

<template>
  <SectionPage />
</template>
