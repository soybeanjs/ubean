<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsMiddlewareInfo } from '../composables/useRpc';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const props = defineProps<{
  middlewares: DevToolsMiddlewareInfo[];
  fileName: (p?: string) => string;
  filePath: (p?: string) => string;
}>();

const emit = defineEmits<{
  delete: [middleware: DevToolsMiddlewareInfo];
}>();

const searchQuery = ref('');
const filterGlobal = ref<string>('ALL');
const deleteTarget = ref<DevToolsMiddlewareInfo | null>(null);

const filteredMiddlewares = computed(() => {
  let mws = [...props.middlewares];
  if (filterGlobal.value === 'GLOBAL') {
    mws = mws.filter(m => m.global);
  } else if (filterGlobal.value === 'ROUTE') {
    mws = mws.filter(m => !m.global);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    mws = mws.filter(m => m.path.toLowerCase().includes(q) || (m.filePath && m.filePath.toLowerCase().includes(q)));
  }
  return mws.sort((a, b) => {
    if (a.global !== b.global) return a.global ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
});

const globalCount = computed(() => props.middlewares.filter(m => m.global).length);
const routeCount = computed(() => props.middlewares.filter(m => !m.global).length);

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return '';
  return `Are you sure you want to delete middleware "${deleteTarget.value.path}"? A backup will be created.`;
});

function confirmDelete(mw: DevToolsMiddlewareInfo) {
  deleteTarget.value = mw;
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
          placeholder="Search middlewares..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>
      <div class="flex gap-1">
        <button
          class="px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer"
          :class="
            filterGlobal === 'ALL'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          "
          @click="filterGlobal = 'ALL'"
        >
          All ({{ middlewares.length }})
        </button>
        <button
          class="px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer"
          :class="
            filterGlobal === 'GLOBAL'
              ? 'bg-warning/15 text-warning'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          "
          @click="filterGlobal = 'GLOBAL'"
        >
          Global ({{ globalCount }})
        </button>
        <button
          class="px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer"
          :class="
            filterGlobal === 'ROUTE'
              ? 'bg-info/15 text-info'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          "
          @click="filterGlobal = 'ROUTE'"
        >
          Route ({{ routeCount }})
        </button>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredMiddlewares.length > 0" class="flex flex-col gap-1">
        <div
          v-for="(mw, i) in filteredMiddlewares"
          :key="i"
          class="list-item group hover:bg-secondary/30 transition-colors"
        >
          <SIcon icon="lucide:layers" :size="14" class="text-warning flex-shrink-0" />
          <span class="font-mono text-foreground flex-1 text-xs truncate" :title="mw.path">{{ mw.path }}</span>
          <span v-if="mw.global" class="text-[10px] px-1.5 py-0.5 bg-warning/12 text-warning rounded-md font-semibold">
            GLOBAL
          </span>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-all cursor-pointer flex-shrink-0"
            title="Delete middleware"
            @click="confirmDelete(mw)"
          >
            <SIcon icon="lucide:trash-2" :size="12" />
          </button>
          <span v-if="mw.filePath" class="file-name" :title="mw.filePath">{{ filePath(mw.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:layers" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">No middlewares found</div>
        <div class="empty-desc">Add middleware files to intercept requests</div>
      </div>
    </div>
    <ConfirmDialog
      :open="!!deleteTarget"
      title="Delete Middleware"
      :message="deleteMessage"
      confirm-text="Delete"
      variant="danger"
      @confirm="handleDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
