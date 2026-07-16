<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import CodeEditor from '../components/CodeEditor.vue';

const props = defineProps<{
  env: Record<string, string>;
  onAdd: () => void;
  onEdit: (key: string, value: string) => void;
  onDelete: (key: string) => void;
}>();

const searchQuery = ref('');
const viewMode = ref<'list' | 'json'>('list');

const envEntries = computed(() => {
  let entries = Object.entries(props.env);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    entries = entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
});

const envJson = computed(() => JSON.stringify(props.env, null, 2));

function isSecret(key: string): boolean {
  const upperKey = key.toUpperCase();
  return ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'].some(k => upperKey.includes(k));
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
          placeholder="Search env vars..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all"
        />
      </div>
      <div class="flex gap-1">
        <button
          class="filter-chip"
          :class="viewMode === 'list' ? 'filter-chip-active' : 'filter-chip-idle'"
          @click="viewMode = 'list'"
        >
          List
        </button>
        <button
          class="filter-chip"
          :class="viewMode === 'json' ? 'filter-chip-active' : 'filter-chip-idle'"
          @click="viewMode = 'json'"
        >
          JSON
        </button>
      </div>
      <button
        class="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-2xs font-medium hover:bg-primary/90 transition-colors cursor-pointer flex-shrink-0"
        title="Add env var"
        @click="props.onAdd"
      >
        <SIcon icon="lucide:plus" :size="12" />
        Add
      </button>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0 op-fade">{{ envEntries.length }} vars</span>
    </div>
    <div class="flex-1 overflow-hidden p-3.5">
      <div v-if="viewMode === 'json'" class="h-full">
        <CodeEditor :model-value="envJson" language="json" readonly label="Environment Variables" height="100%" />
      </div>
      <div v-else class="h-full overflow-y-auto">
        <div v-if="envEntries.length > 0" class="section-card">
          <div class="section-header">
            <SIcon icon="lucide:shield" :size="13" class="text-warning" />
            <span class="section-title">Environment Variables</span>
          </div>
          <div class="section-body">
            <div v-for="[key, value] in envEntries" :key="key" class="info-row group">
              <span class="info-key font-mono text-2xs flex items-center gap-1.5">
                <SIcon v-if="isSecret(key)" icon="lucide:eye-off" :size="11" class="text-destructive" />
                {{ key }}
              </span>
              <span class="info-val truncate max-w-[200px]" :title="String(value)">{{ String(value) }}</span>
              <button
                class="opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer flex-shrink-0"
                title="Edit env var"
                @click.stop="props.onEdit(key, String(value))"
              >
                <SIcon icon="lucide:pencil" :size="11" />
              </button>
              <button
                class="opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all cursor-pointer flex-shrink-0"
                title="Delete env var"
                @click.stop="props.onDelete(key)"
              >
                <SIcon icon="lucide:trash-2" :size="11" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <SIcon icon="lucide:terminal" :size="32" class="text-muted-foreground/40 mb-3" />
          <div class="empty-title">
            {{ searchQuery ? 'No env vars match your search' : 'No environment variables' }}
          </div>
          <div class="empty-desc">
            {{ searchQuery ? 'Try different keywords' : 'Define env vars in your .env file' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
