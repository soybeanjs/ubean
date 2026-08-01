<script setup lang="ts">
// App root: wraps RouterView in SConfigProvider so @soybeanjs/ui components
// (SToast/SDialog/SPopover) inherit theme context across the whole tree.
// Per DESIGN.md D25. The `.dark` class on <html> is set by ubean's no-flash
// color-mode script (ubean.config.ts colorMode block) before Vue mounts.
import { SConfigProvider } from '@soybeanjs/ui';
</script>

<template>
  <SConfigProvider>
    <RouterView />
  </SConfigProvider>
</template>
