<script setup lang="ts">
// Suspense fallback shown during SPA lazy-loading of page components.
// Auto-detected by ubean as the loading page (special preset page).
</script>

<template>
  <div class="flex items-center justify-center min-h-50vh">
    <div class="flex flex-col items-center gap-3 text-muted-foreground">
      <SIcon icon="lucide:loader-circle" class="size-6 animate-spin" />
      <span class="text-sm">Loading…</span>
    </div>
  </div>
</template>
