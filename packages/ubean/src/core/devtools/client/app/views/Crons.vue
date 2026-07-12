<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsCronInfo } from '../composables/useRpc';

const props = defineProps<{
  crons: DevToolsCronInfo[];
  fileName: (p?: string) => string;
  filePath: (p?: string) => string;
}>();

const searchQuery = ref('');

const filteredCrons = computed(() => {
  let items = [...props.crons];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    items = items.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.schedule.toLowerCase().includes(q) ||
        (c.filePath && c.filePath.toLowerCase().includes(q))
    );
  }
  return items;
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 py-2 border-b border-border bg-card flex items-center gap-2 flex-shrink-0">
      <div class="relative flex-1 max-w-xs">
        <SIcon
          icon="lucide:search"
          :size="14"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search cron jobs..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0">{{ filteredCrons.length }} jobs</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredCrons.length > 0" class="flex flex-col gap-1">
        <div v-for="(c, i) in filteredCrons" :key="i" class="list-item hover:bg-secondary/30 transition-colors">
          <SIcon icon="lucide:clock" :size="14" class="text-accent flex-shrink-0" />
          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-mono text-sm font-medium text-foreground">{{ c.name }}</span>
            <span class="font-mono text-2xs text-accent/80">{{ c.schedule }}</span>
          </div>
          <span v-if="c.filePath" class="file-name" :title="c.filePath">{{ filePath(c.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:clock" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">No cron jobs</div>
        <div class="empty-desc">Define scheduled tasks with defineScheduled()</div>
      </div>
    </div>
  </div>
</template>
