<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const now = ref<string>('--:--:--');
let timer: ReturnType<typeof setInterval> | null = null;

function update() {
  now.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

onMounted(() => {
  update();
  timer = setInterval(update, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="island-clock">
    <p class="island-label">client:idle Island</p>
    <p class="clock-time">{{ now }}</p>
    <p class="clock-hint">Hydrated when browser is idle</p>
  </div>
</template>

<style scoped>
.island-clock {
  padding: 1rem;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: #eff6ff;
}

.island-label {
  font-size: 0.8rem;
  color: #1d4ed8;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.clock-time {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1e3a8a;
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: 2px;
}

.clock-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
