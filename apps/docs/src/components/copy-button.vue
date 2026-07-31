<script setup lang="ts">
// Standalone copy button (used by markdown code blocks if needed).
import { ref } from 'vue';

const props = defineProps<{ text: string }>();
const copied = ref(false);

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
    :aria-label="copied ? 'Copied' : 'Copy'"
    @click="copy"
  >
    <SIcon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" :class="copied ? 'text-success' : ''" />
  </button>
</template>
