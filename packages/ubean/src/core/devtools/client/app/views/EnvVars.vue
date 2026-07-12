<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  env: Record<string, string>;
}>();

const searchQuery = ref('');

const envEntries = computed(() => {
  let entries = Object.entries(props.env);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    entries = entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
});

function isSecret(key: string): boolean {
  const upperKey = key.toUpperCase();
  return ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'].some(k => upperKey.includes(k));
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
          placeholder="Search env vars..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0">{{ envEntries.length }} vars</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="envEntries.length > 0" class="section-card">
        <div class="section-header">
          <SIcon icon="lucide:shield" :size="13" class="text-warning" />
          <span class="section-title">Environment Variables</span>
        </div>
        <div class="section-body">
          <div v-for="[key, value] in envEntries" :key="key" class="info-row">
            <span class="info-key font-mono text-2xs flex items-center gap-1.5">
              <SIcon v-if="isSecret(key)" icon="lucide:eye-off" :size="11" class="text-destructive" />
              {{ key }}
            </span>
            <span class="info-val truncate max-w-[200px]" :title="String(value)">{{ String(value) }}</span>
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
</template>
