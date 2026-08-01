<script setup lang="ts">
// Standalone copy button (used by markdown code blocks if needed).
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{ text: string }>();
const copied = ref(false);
const route = useRoute();
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // ignore
  }
}
</script>

<template>
  <button
    type="button"
    class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    :aria-label="copied ? (isZh ? '已复制' : 'Copied') : (isZh ? '复制' : 'Copy')"
    @click="copy"
  >
    <SIcon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" :class="copied ? 'text-success' : ''" />
  </button>
</template>
