<script setup lang="ts">
// Sidebar menu: renders the 8-section IA from constants/menus.ts.
// Mobile drawer variant is driven by the parent (default.vue could wrap in SDrawer).
import { useRoute } from 'vue-router';
import { menuSections } from '~/constants/menus';
import { useLocalePrefix } from '~/composables/use-locale-prefix';

const route = useRoute();
const emit = defineEmits<{ (e: 'select'): void }>();
const { isZh, localizedTo } = useLocalePrefix();

function isActive(to: string) {
  // Match the locale-specific route. `to` is locale-agnostic (e.g. '/guide/introduction');
  // the actual path may be '/guide/introduction' or '/zh/guide/introduction'.
  return route.path === to || route.path === `/zh${to}` || route.path.startsWith(`${to}/`) || route.path.startsWith(`/zh${to}/`);
}
</script>

<template>
  <nav
    class="docs-subtle-card h-full overflow-auto p-3"
  >
    <div v-for="section in menuSections" :key="section.value" class="mb-4">
      <div class="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {{ isZh ? (section.labelZh || section.label) : section.label }}
      </div>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="item in section.items" :key="item.to">
          <SLink
            :to="localizedTo(item.to)"
            class="relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            :class="isActive(item.to) ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-active hover:text-foreground'"
            @click="emit('select')"
          >
            <span
              v-if="isActive(item.to)"
              aria-hidden="true"
              class="absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary"
            />
            <span class="truncate">{{ isZh ? (item.labelZh || item.label) : item.label }}</span>
          </SLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
