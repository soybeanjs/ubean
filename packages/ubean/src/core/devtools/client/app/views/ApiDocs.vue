<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  scalarPath?: string;
  enabled?: boolean;
}>();

const iframeSrc = computed(() => props.scalarPath || '/_scalar');
</script>

<template>
  <div class="api-docs-container">
    <div v-if="enabled === false" class="docs-unavailable">
      <div class="docs-empty-icon">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </div>
      <div class="docs-empty-title">API Docs Not Enabled</div>
      <div class="docs-empty-desc">
        Set
        <code>openAPI: true</code>
        in your ubean config to enable Scalar API reference.
      </div>
    </div>
    <iframe
      v-else
      :src="iframeSrc"
      class="api-docs-iframe"
      title="API Reference"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  </div>
</template>

<style scoped>
.api-docs-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--dt-bg, #0f0f12);
}

.api-docs-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.docs-unavailable {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--dt-text-secondary, #6b6b78);
  gap: 12px;
  padding: 40px;
  text-align: center;
}

.docs-empty-icon {
  color: var(--dt-text-muted, #3f3f46);
}

.docs-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dt-text, #e4e4e7);
}

.docs-empty-desc {
  font-size: 13px;
  line-height: 1.6;
  max-width: 320px;
}

.docs-empty-desc code {
  background: var(--dt-bg-elevated, #27272a);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--dt-font-mono, ui-monospace, monospace);
  color: var(--dt-accent, #818cf8);
}
</style>
