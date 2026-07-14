<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const isWide = ref(false);
const checks = ref(0);
let mql: MediaQueryList | null = null;

function onChange(e: MediaQueryListEvent) {
  isWide.value = e.matches;
  checks.value++;
}

onMounted(() => {
  mql = window.matchMedia('(min-width: 768px)');
  isWide.value = mql.matches;
  mql.addEventListener('change', onChange);
});

onUnmounted(() => {
  if (mql) mql.removeEventListener('change', onChange);
});
</script>

<template>
  <div class="island-media">
    <p class="island-label">client:media Island</p>
    <p class="media-status" :class="{ wide: isWide, narrow: !isWide }">
      {{ isWide ? '🖥 Wide screen (≥768px)' : '📱 Narrow screen (<768px)' }}
    </p>
    <p class="media-info">Media query changes: {{ checks }}</p>
    <p class="media-hint">Resize browser to trigger media query changes</p>
  </div>
</template>

<style scoped>
.island-media {
  padding: 1rem;
  border: 2px solid #8b5cf6;
  border-radius: 8px;
  background: #f5f3ff;
}

.island-label {
  font-size: 0.8rem;
  color: #6d28d9;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.media-status {
  font-size: 1.1rem;
  font-weight: 600;
}

.media-status.wide {
  color: #166534;
}

.media-status.narrow {
  color: #92400e;
}

.media-info,
.media-hint {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
