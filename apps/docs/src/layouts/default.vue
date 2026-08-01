<script setup lang="ts">
// Default docs layout: header + sidebar + content + outline.
// Mirrors the reference's default.vue shell.
// AppHeader + SiderMenu are auto-imported via the components plugin.
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { AnchorOptionData } from '@soybeanjs/ui';
import { useDocOutline } from '~/composables/use-doc-outline';
import type { DocOutlineItem } from '~/composables/use-doc-outline';
import { useScrollLock } from '~/composables/use-scroll-lock';

const route = useRoute();
const docOutline = useDocOutline();
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));

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

// Mobile sidebar drawer state (P1-A5). On lt-md screens the fixed sidebar is
// hidden; this drawer provides an equivalent navigation surface. Closes
// automatically on route change so users don't have to manually dismiss it
// after tapping a link.
const mobileSidebarOpen = ref(false);
const { lock: lockScroll, unlock: unlockScroll } = useScrollLock();
watch(mobileSidebarOpen, open => {
  if (open) lockScroll();
  else unlockScroll();
});
watch(() => route.path, () => {
  mobileSidebarOpen.value = false;
});
</script>

<template>
  <div
    class="[--app-header-main:3.75rem] [--app-topbar:0rem] [--app-header:calc(var(--app-header-main)+var(--app-topbar))] relative min-h-full pt-[--app-header] text-sm"
  >
    <div class="relative z-10">
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
        <!--
 Mobile sidebar trigger (lt-md only). The fixed sidebar is hidden on
             small screens; this button opens a drawer with the same SiderMenu.
-->
        <button
          v-if="shouldShowSidebar"
          type="button"
          class="docs-border mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-active md:!hidden"
          @click="mobileSidebarOpen = true"
        >
          <SIcon icon="lucide:panel-left" class="size-4" />
          <span>{{ isZh ? '菜单' : 'Menu' }}</span>
        </button>

        <SDrawer
          v-if="shouldShowSidebar"
          v-model:open="mobileSidebarOpen"
          side="left"
          :modal="true"
          class="w-72"
        >
          <SiderMenu @select="mobileSidebarOpen = false" />
        </SDrawer>

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
              <div class="docs-border max-h-[calc(100vh-var(--app-header)-2.5rem)] overflow-auto p-3 rounded-xl">
                <SAnchor :items="anchorItems" :offset-top="124" :target-offset="124" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>
