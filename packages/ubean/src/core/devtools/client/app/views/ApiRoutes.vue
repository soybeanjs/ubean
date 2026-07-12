<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsRouteInfo } from '../composables/useRpc';

const props = defineProps<{
  routes: DevToolsRouteInfo[];
  fileName: (p?: string) => string;
  filePath: (p?: string) => string;
  methodClass: (m: string) => string;
}>();

const emit = defineEmits<{
  tryRoute: [route: DevToolsRouteInfo];
}>();

const searchQuery = ref('');
const activeMethod = ref<string>('ALL');

const methods = computed(() => {
  const set = new Set(props.routes.map(r => r.method));
  return ['ALL', ...Array.from(set).sort()];
});

const filteredRoutes = computed(() => {
  let routes = [...props.routes];
  if (activeMethod.value !== 'ALL') {
    routes = routes.filter(r => r.method === activeMethod.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    routes = routes.filter(
      r => r.path.toLowerCase().includes(q) || (r.filePath && r.filePath.toLowerCase().includes(q))
    );
  }
  return routes;
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
          placeholder="Search routes..."
          class="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>
      <div class="flex gap-1 overflow-x-auto">
        <button
          v-for="m in methods"
          :key="m"
          class="px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer"
          :class="
            activeMethod === m
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          "
          @click="activeMethod = m"
        >
          {{ m }}
        </button>
      </div>
      <span class="text-2xs text-muted-foreground ml-auto flex-shrink-0">{{ filteredRoutes.length }} routes</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3.5">
      <div v-if="filteredRoutes.length > 0" class="flex flex-col gap-1">
        <div
          v-for="(r, i) in filteredRoutes"
          :key="i"
          class="group flex items-center gap-2.5 px-3 py-2 bg-card border border-border/60 rounded-lg text-xs hover:bg-secondary/30 transition-colors"
        >
          <span
            class="min-w-[46px] px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-center font-mono flex-shrink-0"
            :class="methodClass(r.method)"
          >
            {{ r.method }}
          </span>
          <span class="font-mono text-foreground flex-1 text-xs truncate" :title="r.path">{{ r.path }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center text-muted-foreground hover:text-primary rounded transition-all cursor-pointer flex-shrink-0"
            title="Try in Playground"
            @click="emit('tryRoute', r)"
          >
            <SIcon icon="lucide:play" :size="12" />
          </button>
          <span v-if="r.filePath" class="file-name" :title="r.filePath">{{ filePath(r.filePath) }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <SIcon icon="lucide:route" :size="32" class="text-muted-foreground/40 mb-3" />
        <div class="empty-title">
          {{ searchQuery ? 'No routes match your search' : 'No API routes' }}
        </div>
        <div class="empty-desc">
          {{ searchQuery ? 'Try different keywords' : 'API routes will appear here as you add endpoints' }}
        </div>
      </div>
    </div>
  </div>
</template>
