<script setup lang="ts">
// App root component (ubean auto-detected via `src/App.vue`): wraps the
// framework outlet (layout chain + page) in SConfigProvider so @soybeanjs/ui
// components (SToast/SDialog/SPopover) inherit theme context across the whole
// tree — above every layout. Per DESIGN.md D25. The `.dark` class on <html>
// is set by ubean's no-flash color-mode script (ubean.config.ts colorMode
// block) before Vue mounts.
//
// The framework injects the layout chain + page through the DEFAULT SLOT —
// render it with `<slot />`. Do NOT drop a `<RouterView />` here: that would
// bypass ubean's layout system.
import { SConfigProvider } from '@soybeanjs/ui';
</script>

<template>
  <SConfigProvider>
    <slot />
  </SConfigProvider>
</template>
