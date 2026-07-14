<script setup lang="ts">
import { ref, onMounted } from 'vue';

const visible = ref(false);
const visibleCount = ref(0);
const firstVisibleAt = ref<string>('');

onMounted(() => {
  // The IntersectionObserver is set up by the bootstrap script;
  // once the island is hydrated, we mark it as visible.
  visible.value = true;
  visibleCount.value = 1;
  firstVisibleAt.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-visibility">
    <p class="island-label">client:visible Island</p>
    <p class="vis-status" :class="{ active: visible }">
      {{ visible ? '✓ Visible & Hydrated' : '○ Waiting for visibility...' }}
    </p>
    <p v-if="firstVisibleAt" class="vis-time">First visible: {{ firstVisibleAt }}</p>
    <p class="vis-count">Visibility events: {{ visibleCount }}</p>
  </div>
</template>

<style scoped>
.island-visibility {
  padding: 1rem;
  border: 2px solid #f59e0b;
  border-radius: 8px;
  background: #fffbeb;
}

.island-label {
  font-size: 0.8rem;
  color: #b45309;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.vis-status {
  font-size: 1.1rem;
  font-weight: 600;
  color: #92400e;
}

.vis-status.active {
  color: #166534;
}

.vis-time,
.vis-count {
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}
</style>
