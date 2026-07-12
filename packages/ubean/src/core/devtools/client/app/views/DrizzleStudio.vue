<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  studioUrl?: string;
  available?: boolean;
}>();

const iframeLoaded = ref(false);
const iframeError = ref(false);

const studioSrc = props.studioUrl || 'http://127.0.0.1:4983';

function handleLoad() {
  iframeLoaded.value = true;
  iframeError.value = false;
}

function handleError() {
  iframeError.value = true;
}

function openInNewTab() {
  window.open(studioSrc, '_blank', 'noopener,noreferrer');
}

function openDrizzleStudio() {
  window.open('https://local.drizzle.studio', '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="drizzle-container">
    <div v-if="available !== false" class="drizzle-iframe-wrap">
      <div v-if="!iframeLoaded && !iframeError" class="drizzle-loading">
        <div class="spinner"></div>
        <span>Connecting to Drizzle Studio...</span>
        <p class="drizzle-hint">
          Make sure
          <code>drizzle-kit studio</code>
          is running on port 4983
        </p>
        <button class="drizzle-external-btn" @click="openDrizzleStudio">Open local.drizzle.studio →</button>
      </div>
      <iframe
        v-show="iframeLoaded"
        :src="studioSrc"
        class="drizzle-iframe"
        title="Drizzle Studio"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        @load="handleLoad"
        @error="handleError"
      />
      <div v-if="iframeError || !available" class="drizzle-fallback">
        <div class="drizzle-fallback-icon">
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
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div class="drizzle-fallback-title">Drizzle Studio Not Connected</div>
        <div class="drizzle-fallback-desc">
          Drizzle Studio needs to be started separately. Run the command below and refresh:
        </div>
        <pre class="drizzle-command">npx drizzle-kit studio</pre>
        <button class="drizzle-open-btn" @click="openInNewTab">Open in Browser ({{ studioSrc }}) →</button>
      </div>
    </div>
    <div v-else class="drizzle-fallback">
      <div class="drizzle-fallback-icon">
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
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      </div>
      <div class="drizzle-fallback-title">Database Not Configured</div>
      <div class="drizzle-fallback-desc">
        Drizzle Studio requires a database connection. Configure
        <code>db0</code>
        or Drizzle ORM to enable.
      </div>
    </div>
  </div>
</template>

<style scoped>
.drizzle-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--dt-bg, #0f0f12);
}

.drizzle-iframe-wrap {
  width: 100%;
  height: 100%;
  position: relative;
}

.drizzle-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

.drizzle-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--dt-text-secondary, #6b6b78);
  font-size: 13px;
}

.drizzle-hint {
  font-size: 12px;
  color: var(--dt-text-muted, #52525b);
  margin: 0;
}

.drizzle-hint code {
  background: var(--dt-bg-elevated, #27272a);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--dt-font-mono, ui-monospace, monospace);
  color: var(--dt-accent, #818cf8);
  font-size: 11px;
}

.drizzle-external-btn {
  margin-top: 8px;
  padding: 6px 14px;
  background: var(--dt-bg-elevated, #27272a);
  border: 1px solid var(--dt-border, #3f3f46);
  border-radius: 6px;
  color: var(--dt-text, #e4e4e7);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.drizzle-external-btn:hover {
  background: var(--dt-bg-hover, #3f3f46);
  border-color: var(--dt-accent, #818cf8);
}

.drizzle-fallback {
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

.drizzle-fallback-icon {
  color: var(--dt-text-muted, #3f3f46);
}

.drizzle-fallback-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--dt-text, #e4e4e7);
}

.drizzle-fallback-desc {
  font-size: 13px;
  line-height: 1.6;
  max-width: 360px;
}

.drizzle-fallback-desc code {
  background: var(--dt-bg-elevated, #27272a);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--dt-font-mono, ui-monospace, monospace);
  color: var(--dt-accent, #818cf8);
}

.drizzle-command {
  background: var(--dt-bg-elevated, #18181b);
  border: 1px solid var(--dt-border, #3f3f46);
  padding: 10px 16px;
  border-radius: 6px;
  font-family: var(--dt-font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--dt-text, #e4e4e7);
  margin: 4px 0;
}

.drizzle-open-btn {
  margin-top: 8px;
  padding: 8px 18px;
  background: var(--dt-accent, #818cf8);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.drizzle-open-btn:hover {
  background: #6366f1;
}
</style>
