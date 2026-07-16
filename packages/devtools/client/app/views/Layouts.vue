<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsLayoutInfo } from '../composables/useRpc';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const props = defineProps<{
  layouts: DevToolsLayoutInfo[];
  filePath: (p?: string) => string;
}>();

const emit = defineEmits<{
  delete: [layout: DevToolsLayoutInfo];
  edit: [layout: DevToolsLayoutInfo];
}>();

const searchQuery = ref('');
const deleteTarget = ref<DevToolsLayoutInfo | null>(null);

const filteredLayouts = computed(() => {
  let lays = [...props.layouts];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    lays = lays.filter(l => l.name.toLowerCase().includes(q) || l.path.toLowerCase().includes(q));
  }
  return lays.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return '';
  return `Are you sure you want to delete layout "${deleteTarget.value.name}"? A backup will be created.`;
});

function confirmDelete(layout: DevToolsLayoutInfo) {
  deleteTarget.value = layout;
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
          placeholder="Search layouts..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all"
        />
      </div>
      <span class="text-[10px] text-muted-foreground ml-auto op-fade">{{ layouts.length }} layouts</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredLayouts.length > 0" class="flex flex-col gap-1">
        <div v-for="(l, i) in filteredLayouts" :key="i" class="list-item group">
          <SIcon icon="lucide:layout" :size="14" class="text-purple-400 flex-shrink-0" />
          <div class="flex flex-col flex-1 min-w-0">
            <span class="text-xs font-medium text-foreground truncate">{{ l.name }}</span>
            <span class="text-[10px] text-muted-foreground font-mono truncate" :title="l.path">{{ l.path }}</span>
          </div>
          <span
            v-if="l.isDefault"
            class="text-[10px] px-1.5 py-0.5 bg-purple-500/12 text-purple-400 rounded-md font-semibold"
          >
            DEFAULT
          </span>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer flex-shrink-0"
            title="Edit layout"
            @click.stop="emit('edit', l)"
          >
            <SIcon icon="lucide:pencil" :size="12" />
          </button>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-all cursor-pointer flex-shrink-0"
            title="Delete layout"
            @click="confirmDelete(l)"
          >
            <SIcon icon="lucide:trash-2" :size="12" />
          </button>
          <span v-if="l.filePath" class="file-name" :title="l.filePath">{{ filePath(l.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:layout" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">No layouts found</div>
        <div class="empty-desc">Add layout files to the layouts/ directory</div>
      </div>
    </div>
    <ConfirmDialog
      :open="!!deleteTarget"
      title="Delete Layout"
      :message="deleteMessage"
      confirm-text="Delete"
      variant="danger"
      @confirm="handleDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
