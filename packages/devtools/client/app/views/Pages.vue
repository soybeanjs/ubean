<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsPageInfo } from '../composables/useRpc';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const props = defineProps<{
  pages: DevToolsPageInfo[];
  filePath: (p?: string) => string;
}>();

const emit = defineEmits<{
  (e: 'delete', page: DevToolsPageInfo): void;
  (e: 'edit', page: DevToolsPageInfo): void;
  (e: 'edit-meta', page: DevToolsPageInfo): void;
  (e: 'create'): void;
}>();

const searchQuery = ref('');
const deleteTarget = ref<DevToolsPageInfo | null>(null);

const filteredPages = computed(() => {
  let pages = [...props.pages];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    pages = pages.filter(
      p =>
        p.path.toLowerCase().includes(q) ||
        (p.filePath && p.filePath.toLowerCase().includes(q)) ||
        (p.name && p.name.toLowerCase().includes(q))
    );
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
});

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return '';
  return `Are you sure you want to delete "${deleteTarget.value.path}"? A backup will be created (.bak file).`;
});

function confirmDelete(page: DevToolsPageInfo) {
  deleteTarget.value = page;
}

function handleDelete() {
  if (deleteTarget.value) {
    emit('delete', deleteTarget.value);
    deleteTarget.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 py-2 border-b border-base bg-background flex items-center gap-2 flex-shrink-0">
      <div class="relative flex-1 max-w-xs">
        <SIcon
          icon="lucide:search"
          :size="14"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search pages..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all"
        />
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0 op-fade">{{ filteredPages.length }} pages</span>
      <button
        class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer flex-shrink-0"
        title="New page (P)"
        @click="emit('create')"
      >
        <SIcon icon="lucide:plus" :size="13" />
        New
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredPages.length > 0" class="flex flex-col gap-1">
        <div v-for="(p, i) in filteredPages" :key="i" class="list-item group">
          <SIcon icon="lucide:file-text" :size="14" class="text-primary flex-shrink-0" />
          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-mono text-primary text-xs" :title="p.path">{{ p.path }}</span>
            <span v-if="p.layout" class="text-2xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <SIcon icon="lucide:layout" :size="11" />
              {{ p.layout }}
            </span>
          </div>
          <span v-if="p.filePath" class="file-name" :title="p.filePath">{{ filePath(p.filePath) }}</span>
          <button
            class="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0 ml-1"
            title="Edit page properties (definePage)"
            @click.stop="emit('edit-meta', p)"
          >
            <SIcon icon="lucide:sliders-horizontal" :size="12" />
          </button>
          <button
            class="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0 ml-1"
            title="Edit page source"
            @click.stop="emit('edit', p)"
          >
            <SIcon icon="lucide:pencil" :size="12" />
          </button>
          <button
            class="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer flex-shrink-0 ml-1"
            title="Delete page"
            @click.stop="confirmDelete(p)"
          >
            <SIcon icon="lucide:trash-2" :size="12" />
          </button>
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
    <ConfirmDialog
      :open="!!deleteTarget"
      title="Delete Page"
      :message="deleteMessage"
      confirm-text="Delete"
      variant="danger"
      @confirm="handleDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
