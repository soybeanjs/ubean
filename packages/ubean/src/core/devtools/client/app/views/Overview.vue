<script setup lang="ts">
import { computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsInfo } from '../composables/useRpc';

const props = defineProps<{
  info: DevToolsInfo;
  uptime: number;
  fmtUptime: (ms: number) => string;
  fmtTime: (ts: number) => string;
  fmtVal: (v: unknown) => string;
}>();

const statCards = computed(() => {
  if (!props.info) return [];
  return [
    { val: props.info.pages || 0, label: 'Pages', icon: 'lucide:file-text', color: 'primary' },
    { val: props.info.apiRoutes || 0, label: 'API Routes', icon: 'lucide:send', color: 'info' },
    { val: props.info.middleware || 0, label: 'Middleware', icon: 'lucide:layers', color: 'warning' },
    { val: props.info.crons || 0, label: 'Cron Jobs', icon: 'lucide:clock', color: 'accent' }
  ];
});

const iconBgMap: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  info: 'bg-info/12 text-info',
  accent: 'bg-accent/10 text-accent',
  destructive: 'bg-destructive/12 text-destructive'
};

const presetColors = ['primary', 'success', 'info', 'warning', 'accent'];
</script>

<template>
  <div class="p-3.5">
    <div class="grid grid-cols-4 gap-2 mb-3">
      <div v-for="(s, i) in statCards" :key="i" class="stat-card">
        <div class="stat-icon-wrap" :class="[iconBgMap[s.color]]">
          <SIcon :icon="s.icon" :size="18" />
        </div>
        <div>
          <div class="stat-value">{{ s.val }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5 mb-2.5">
      <div class="section-card">
        <div class="section-header">
          <SIcon icon="lucide:activity" :size="13" class="text-primary" />
          <span class="section-title">Server Status</span>
        </div>
        <div class="section-body">
          <div class="info-row">
            <span class="info-key">Status</span>
            <span class="running-badge">
              <span class="status-dot"></span>
              Running
            </span>
          </div>
          <div class="info-row">
            <span class="info-key">Uptime</span>
            <span class="info-val">{{ fmtUptime(uptime) }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Version</span>
            <span class="info-val">v{{ info.version }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Start Time</span>
            <span class="info-val">{{ fmtTime(info.startTime) }}</span>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-header">
          <SIcon icon="lucide:cpu" :size="13" class="text-info" />
          <span class="section-title">Presets</span>
        </div>
        <div class="section-body">
          <div v-if="info.presets && info.presets.length > 0" class="px-3.5 py-2.5 flex flex-wrap gap-1.5">
            <span
              v-for="(p, i) in info.presets"
              :key="p"
              class="inline-flex items-center px-2.5 py-1 rounded-md text-2xs font-medium"
              :class="[iconBgMap[presetColors[i % presetColors.length]]]"
            >
              {{ p }}
            </span>
          </div>
          <div v-else class="empty-state py-6">
            <span class="text-xs text-muted-foreground">No presets loaded</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="info.config && Object.keys(info.config).length > 0" class="section-card">
      <div class="section-header">
        <SIcon icon="lucide:settings" :size="13" class="text-warning" />
        <span class="section-title">Configuration</span>
      </div>
      <div class="section-body">
        <div v-for="(v, k) in info.config" :key="String(k)" class="info-row">
          <span class="info-key font-mono text-2xs">{{ k }}</span>
          <span class="info-val">{{ fmtVal(v) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
