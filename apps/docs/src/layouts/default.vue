<script setup lang="ts">
// Default docs layout: header + sidebar + content + outline.
// Mirrors the reference's default.vue shell.
// AppHeader + SiderMenu are auto-imported via the components plugin.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { AnchorOptionData } from '@soybeanjs/ui';
import { useDocOutline } from '~/composables/use-doc-outline';
import type { DocOutlineItem } from '~/composables/use-doc-outline';

const route = useRoute();
const docOutline = useDocOutline();

// Per D16: map the UI-agnostic DocOutlineItem tree → SAnchor's AnchorOptionData
// (title, href:'#'+value, children). Keeps the composable decoupled from the
// anchor UI shape.
function toAnchorItems(items: DocOutlineItem[]): AnchorOptionData[] {
  return items.map(item => ({
    title: item.label,
    href: `#${item.value}`,
    ...(item.children?.length ? { children: toAnchorItems(item.children) } : {})
  }));
}

const anchorItems = computed<AnchorOptionData[]>(() => toAnchorItems(docOutline.value));
const hasDocOutline = computed(() => docOutline.value.length > 0);

const shouldReserveOutlineSpace = computed(() => !['/', '/zh'].includes(route.path));
const shouldShowSidebar = computed(() =>
  route.path.startsWith('/guide') ||
  route.path.startsWith('/zh/guide') ||
  route.path.startsWith('/integrations') ||
  route.path.startsWith('/zh/integrations') ||
  route.path.startsWith('/reference') ||
  route.path.startsWith('/zh/reference') ||
  route.path.startsWith('/architecture') ||
  route.path.startsWith('/zh/architecture')
);
</script>

<template>
  <div
    class="[--app-header-main:3.75rem] [--app-topbar:0rem] md:[--app-topbar:2.75rem] [--app-header:calc(var(--app-header-main)+var(--app-topbar))] min-h-full pt-[--app-header] text-sm"
  >
    <AppHeader />

    <div
      v-if="shouldShowSidebar"
      class="lt-md:!hidden fixed top-[calc(var(--app-header)+0.5rem)] start-0 z-49 w-55 h-[calc(100vh-var(--app-header)-0.5rem)] p-3"
    >
      <SiderMenu />
    </div>

    <div
      :class="shouldShowSidebar ? 'lt-md:ms-0 md:ms-55' : 'ms-0'"
      class="px-4 py-5 md:px-8 md:pb-7 md:pt-5 xl:px-10 lt-md:pt-12!"
    >
      <div
        class="mx-auto min-w-0"
        :class="shouldReserveOutlineSpace ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-8' : ''"
      >
        <div class="min-w-0">
          <RouterView />
        </div>

        <aside v-if="shouldReserveOutlineSpace" class="lt-xl:hidden xl:w-72 xl:min-w-0">
          <div
            class="fixed top-[calc(var(--app-header)+1.25rem)] end-8 z-40 w-72 transition-opacity duration-200"
            :class="hasDocOutline ? 'opacity-100' : 'pointer-events-none opacity-0'"
          >
            <div class="max-h-[calc(100vh-var(--app-header)-2.5rem)] overflow-auto border border-border/50 dark:border-border p-3 rounded-xl">
              <SAnchor :items="anchorItems" :offset-top="124" :target-offset="124" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
