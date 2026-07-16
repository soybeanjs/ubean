<script setup lang="ts">
import { computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  config: Record<string, unknown>;
  info: {
    version: string;
    startTime: number;
    presets: string[];
    pages: number;
    apiRoutes: number;
    middleware: number;
    layouts: number;
    crons: number;
  };
  fmtUptime: (ms: number) => string;
  fmtTime: (ts: number) => string;
  fmtVal: (v: unknown) => string;
  uptime: number;
}>();

const emit = defineEmits<{
  edit: [];
}>();

const configEntries = computed(() => Object.entries(props.config));

const stats = computed(() => [
  { label: 'Version', value: props.info.version, icon: 'lucide:tag', color: 'text-primary' },
  { label: 'Uptime', value: props.fmtUptime(props.uptime), icon: 'lucide:clock', color: 'text-success' },
  { label: 'Started', value: props.fmtTime(props.info.startTime), icon: 'lucide:play', color: 'text-info' },
  {
    label: 'Preset',
    value: props.info.presets.join(', ') || 'standard',
    icon: 'lucide:package',
    color: 'text-warning'
  },
  { label: 'Pages', value: String(props.info.pages), icon: 'lucide:file-text', color: 'text-info' },
  { label: 'API Routes', value: String(props.info.apiRoutes), icon: 'lucide:send', color: 'text-success' },
  { label: 'Middleware', value: String(props.info.middleware), icon: 'lucide:layers', color: 'text-warning' },
  { label: 'Layouts', value: String(props.info.layouts), icon: 'lucide:layout', color: 'text-purple-400' },
  { label: 'Cron Jobs', value: String(props.info.crons), icon: 'lucide:clock-4', color: 'text-accent' }
]);
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 py-2 border-b border-base bg-background flex items-center justify-between gap-2 flex-shrink-0">
      <span class="text-xs font-semibold text-foreground">Configuration</span>
      <button
        class="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
        title="Edit Config File"
        @click="emit('edit')"
      >
        <SIcon icon="lucide:pencil" :size="12" />
        Edit Config File
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div v-for="stat in stats" :key="stat.label" class="bg-background border border-base rounded-lg p-2.5">
          <div class="flex items-center gap-1.5 mb-1">
            <SIcon :icon="stat.icon" :size="12" :class="stat.color" />
            <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{{ stat.label }}</span>
          </div>
          <div class="text-xs font-semibold text-foreground font-mono truncate" :title="stat.value">
            {{ stat.value }}
          </div>
        </div>
      </div>

      <div v-if="configEntries.length > 0" class="bg-background border border-base rounded-lg overflow-hidden">
        <div class="px-3 py-2 border-b border-base bg-secondary">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resolved Config</span>
        </div>
        <div class="divide-y divide-#8882">
          <div
            v-for="[key, value] in configEntries"
            :key="key"
            class="flex items-center px-3 py-2 gap-2 hover:bg-active transition-colors"
          >
            <span class="text-xs font-mono text-primary font-medium min-w-24">{{ key }}</span>
            <span class="text-xs font-mono text-foreground truncate" :title="fmtVal(value)">{{ fmtVal(value) }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="info.presets && info.presets.length > 0"
        class="mt-3 bg-background border border-base rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 border-b border-base bg-secondary">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Presets</span>
        </div>
        <div class="p-3 flex flex-wrap gap-1.5">
          <span
            v-for="p in info.presets"
            :key="p"
            class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-md"
          >
            <SIcon icon="lucide:package" :size="10" />
            {{ p }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
