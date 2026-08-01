<script setup lang="ts">
// Shiki-powered code block for explicit inline samples in Vue pages.
// Markdown fences use @ubean/markdown's highlighter hook instead; this component
// is for <CodeBlock code="..." lang="ts" /> usage. Shares the same theme config.
import { ref, watch, onMounted, useTemplateRef } from 'vue';
import { codeToHtml } from 'shiki';

interface Props {
  code: string;
  lang: string;
}
const props = defineProps<Props>();

const wrapper = useTemplateRef('wrapper');
const copied = ref(false);

async function renderCode() {
  const html = await codeToHtml(props.code, {
    lang: props.lang,
    defaultColor: false,
    themes: { light: 'one-light', dark: 'one-dark-pro' }
  });
  if (wrapper.value) {
    wrapper.value.innerHTML = html;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // ignore
  }
}

onMounted(renderCode);
watch(() => props.code, renderCode);
</script>

<template>
  <div class="group relative my-4">
    <div ref="wrapper" class="md-code-block overflow-auto text-sm" :data-lang="lang" />
    <button
      type="button"
      class="docs-border absolute end-2 top-2 rounded-md bg-background/80 p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="copied ? 'Copied' : 'Copy code'"
      @click="copy"
    >
      <SIcon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" :class="copied ? 'text-success' : ''" />
    </button>
  </div>
</template>
