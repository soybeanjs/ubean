<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsCronInfo } from '../composables/useRpc';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const props = defineProps<{
  crons: DevToolsCronInfo[];
  filePath: (p?: string) => string;
}>();

const emit = defineEmits<{
  delete: [cron: DevToolsCronInfo];
  edit: [cron: DevToolsCronInfo];
  create: [];
}>();

const searchQuery = ref('');
const deleteTarget = ref<DevToolsCronInfo | null>(null);

const filteredCrons = computed(() => {
  let items = [...props.crons];
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    items = items.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.schedule?.toLowerCase().includes(q) ||
        (c.filePath && c.filePath.toLowerCase().includes(q))
    );
  }
  return items;
});

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return '';
  return `Are you sure you want to delete cron job "${deleteTarget.value.name}"? A backup will be created.`;
});

function confirmDelete(cron: DevToolsCronInfo) {
  deleteTarget.value = cron;
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
          placeholder="Search cron jobs..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all"
        />
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0 op-fade">{{ filteredCrons.length }} jobs</span>
      <button
        class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer flex-shrink-0"
        title="New cron job (C)"
        @click="emit('create')"
      >
        <SIcon icon="lucide:plus" :size="13" />
        New
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredCrons.length > 0" class="flex flex-col gap-1">
        <div v-for="(c, i) in filteredCrons" :key="i" class="list-item group">
          <SIcon icon="lucide:clock" :size="14" class="text-accent flex-shrink-0" />
          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-mono text-sm font-medium text-foreground">{{ c.name }}</span>
            <span class="font-mono text-2xs text-accent/80">{{ c.schedule }}</span>
          </div>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer flex-shrink-0"
            title="Edit cron job"
            @click.stop="emit('edit', c)"
          >
            <SIcon icon="lucide:pencil" :size="12" />
          </button>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-all cursor-pointer flex-shrink-0"
            title="Delete cron job"
            @click="confirmDelete(c)"
          >
            <SIcon icon="lucide:trash-2" :size="12" />
          </button>
          <span v-if="c.filePath" class="file-name" :title="c.filePath">{{ filePath(c.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:clock" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">No cron jobs</div>
        <div class="empty-desc">Define scheduled tasks with defineScheduled()</div>
      </div>
    </div>
    <ConfirmDialog
      :open="!!deleteTarget"
      title="Delete Cron Job"
      :message="deleteMessage"
      confirm-text="Delete"
      variant="danger"
      @confirm="handleDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
