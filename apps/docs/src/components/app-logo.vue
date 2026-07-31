<script setup lang="ts">
// ubean logo mark. Inline SVG so it works with no external asset + themable via currentColor.
defineProps<{ class?: string }>();
</script>

<template>
  <svg viewBox="0 0 64 64" class="size-8" :class="$props.class" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="currentColor" />
    <path d="M18 20c0-2 2-4 4-4h8c8 0 14 6 14 14s-6 14-14 14h-8c-2 0-4-2-4-4V20zm8 4v16h4c5 0 9-4 9-8s-4-8-9-8h-4z" fill="#fff" />
    <circle cx="44" cy="44" r="4" fill="#fff" />
  </svg>
</template>

<style scoped>
svg {
  color: var(--primary, hsl(200 90% 45%));
}
</style>
