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
  <div class="relative group my-4">
    <div ref="wrapper" class="md-code-block rounded-lg overflow-auto text-sm" :data-lang="lang" />
    <button
      type="button"
      class="absolute top-2 end-2 p-1.5 rounded-md bg-background/80 backdrop-blur border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
      :aria-label="copied ? 'Copied' : 'Copy code'"
      @click="copy"
    >
      <SIcon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" />
    </button>
  </div>
</template>
