<script setup lang="ts">
// ubean logo mark. Uses the brand SVG served from R2 so the header logo and the
// favicon in ubean.config.ts stay in sync (same asset, same cache-busting tag).
defineProps<{ class?: string }>();
</script>

<template>
  <img
    src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.svg?v=202608211738"
    alt="ubean logo"
    class="size-8"
    :class="$props.class"
    draggable="false"
  >
</template>
