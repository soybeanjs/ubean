<script setup lang="ts">
// ubean logo mark. Uses /favicon.svg (the brand bean mark) instead of an
// inline SVG so the header logo and the favicon stay in sync.
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
