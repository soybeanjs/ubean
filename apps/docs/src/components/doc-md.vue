<script setup lang="ts">
// Renders a dynamically-imported markdown Vue component (from [...slug].vue).
// unplugin-vue-markdown wraps the rendered markdown in a `.markdown-body` div.
const props = defineProps<{ component: any }>();
</script>

<template>
  <component :is="props.component" v-if="props.component" />
  <div v-else class="text-muted-foreground">Content unavailable.</div>
</template>
