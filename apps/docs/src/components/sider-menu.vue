<script setup lang="ts">
// Sidebar menu: renders the 5-section IA from constants/menus.ts.
// Mobile drawer variant is driven by the parent (default.vue could wrap in SDrawer).
import { useRoute } from 'vue-router';
import { menuSections } from '~/constants/menus';

const route = useRoute();
const emit = defineEmits<{ (e: 'select'): void }>();

function isActive(to: string) {
  // Match either the EN route or its /zh mirror.
  return route.path === to || route.path === `/zh${to}` || route.path.startsWith(`${to}/`);
}

const statusLabel: Record<string, string> = {
  implemented: '✅',
  historical: '📝',
  proposal: '⬜'
};
</script>

<template>
  <nav
    class="docs-subtle-card h-full overflow-auto border border-border/50 p-3 dark:border-border"
  >
    <div v-for="section in menuSections" :key="section.value" class="mb-4">
      <div class="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {{ section.label }}
      </div>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="item in section.items" :key="item.to">
          <SLink
            :to="item.to"
            class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            :class="isActive(item.to) ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-active hover:text-foreground'"
            @click="emit('select')"
          >
            <span class="truncate">{{ item.label }}</span>
            <span v-if="item.status" class="ms-auto text-xs opacity-70">{{ statusLabel[item.status] }}</span>
          </SLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
