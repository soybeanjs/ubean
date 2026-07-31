<script setup lang="ts">
// Renders a dynamically-imported markdown Vue component (from [...slug].vue).
// unplugin-vue-markdown wraps the rendered markdown in a `.markdown-wrapper`
// div (configured via ubean.config.ts → markdown.wrapperClass). This component
// provides the outer article "card" with border + gradient header (D22 port).
import { shallowRef } from 'vue';
const props = defineProps<{ component: any; path?: string }>();
const contentRef = shallowRef<HTMLElement | null>(null);
</script>

<template>
  <div ref="contentRef" class="min-w-0">
    <article
      v-if="props.component"
      :data-doc-path="path"
      class="docs-card relative min-w-0 overflow-hidden"
    >
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-r from-primary/8 via-warning/6 to-info/8 opacity-80"
      />
      <div class="relative min-w-0 px-5 py-6 sm:px-8 sm:py-8 xl:px-10 xl:py-10">
        <div class="min-w-0">
          <component :is="props.component" />
        </div>
      </div>
    </article>
    <div v-else class="text-muted-foreground">Content unavailable.</div>
  </div>
</template>
