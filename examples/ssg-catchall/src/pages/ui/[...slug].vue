<script setup lang="ts">
// UI 分区 catch-all(仿照 docs 的 src/pages/ui/[...slug].vue)
import SectionPage from '../../components/section-page.vue';

defineOptions({ name: 'UISectionPage' });
</script>

<template>
  <SectionPage />
</template>
