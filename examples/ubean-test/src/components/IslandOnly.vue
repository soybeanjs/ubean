<script setup lang="ts">
import { ref, onMounted } from 'vue';

const clientTime = ref<string>('');

onMounted(() => {
  clientTime.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-only">
    <p class="island-label">client:only Island</p>
    <p class="only-status">✓ Rendered on client only</p>
    <p v-if="clientTime" class="only-time">Client time: {{ clientTime }}</p>
    <p class="only-hint">This component was NOT server-side rendered</p>
  </div>
</template>

<style scoped>
.island-only {
  padding: 1rem;
  border: 2px dashed #ec4899;
  border-radius: 8px;
  background: #fdf2f8;
}

.island-label {
  font-size: 0.8rem;
  color: #be185d;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.only-status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #166534;
}

.only-time {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}

.only-hint {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #9ca3af;
  font-style: italic;
}
</style>
