<script setup lang="ts">
// AppHeader + BackgroundDecoration are auto-imported via the components plugin.
</script>

<template>
  <div class="[--app-header-main:3.75rem] [--app-topbar:0rem] [--app-header:var(--app-header-main)] relative h-full text-sm">
    <BackgroundDecoration />
    <div class="relative z-10">
      <AppHeader />
      <RouterView />
    </div>
  </div>
</template>
