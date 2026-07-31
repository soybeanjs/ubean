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
    class="p-1.5 rounded-md hover:bg-active transition-colors"
    :aria-label="copied ? 'Copied' : 'Copy'"
    @click="copy"
  >
    <SIcon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="size-4" />
  </button>
</template>
