<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsPageInfo } from '../composables/useRpc';

const props = defineProps<{
  pages: DevToolsPageInfo[];
  fileName: (p?: string) => string;
  filePath: (p?: string) => string;
}>();

const searchQuery = ref('');

const filteredPages = computed(() => {
  let pages = [...props.pages];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    pages = pages.filter(p => p.path.toLowerCase().includes(q) || (p.filePath && p.filePath.toLowerCase().includes(q)) || (p.name && p.name.toLowerCase().includes(q)));
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 py-2 border-b border-border bg-card flex items-center gap-2 flex-shrink-0">
      <div class="relative flex-1 max-w-xs">
        <SIcon icon="lucide:search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search pages..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0">{{ filteredPages.length }} pages</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredPages.length > 0" class="flex flex-col gap-1">
        <div v-for="(p, i) in filteredPages" :key="i" class="list-item hover:bg-secondary/30 transition-colors">
          <SIcon icon="lucide:file-text" :size="14" class="text-primary flex-shrink-0" />
          <div class="flex flex-col min-w-0 flex-1">
            <span class="page-path font-mono text-primary" :title="p.path">{{ p.path }}</span>
            <span v-if="p.layout" class="text-2xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <SIcon icon="lucide:layout" :size="11" />
              {{ p.layout }}
            </span>
          </div>
          <span v-if="p.filePath" class="file-name" :title="p.filePath">{{ filePath(p.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:file-text" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">
          {{ searchQuery ? 'No pages match your search' : 'No pages found' }}
        </div>
        <div class="empty-desc">
          {{ searchQuery ? 'Try different keywords' : 'Add .vue files in your pages directory' }}
        </div>
      </div>
    </div>
  </div>
</template>
