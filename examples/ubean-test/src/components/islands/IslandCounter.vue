<script setup lang="ts">
import { ref, onMounted } from 'vue';

const count = ref(0);
const mountedAt = ref<string>('');

function increment() {
  count.value++;
}

onMounted(() => {
  mountedAt.value = new Date().toISOString();
});
</script>

<template>
  <div class="island-counter">
    <p class="island-label">client:load Island</p>
    <p class="counter-value">{{ count }}</p>
    <button @click="increment">+1</button>
    <p v-if="mountedAt" class="mounted-info">Mounted at: {{ mountedAt }}</p>
  </div>
</template>

<style scoped>
.island-counter {
  padding: 1rem;
  border: 2px solid #42b883;
  border-radius: 8px;
  background: #f0fdf4;
}

.island-label {
  font-size: 0.8rem;
  color: #15803d;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.counter-value {
  font-size: 2rem;
  font-weight: 700;
  color: #166534;
}

button {
  padding: 0.4rem 1rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

button:hover {
  background: #35495e;
}

.mounted-info {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}
</style>
