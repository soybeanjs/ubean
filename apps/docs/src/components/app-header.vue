<script setup lang="ts">
// Top app header: logo + title + search + nav + toolbar.
// Adapted from soybean-ui/apps/docs/src/components/app-header.vue (structural shell only).
import { shallowRef, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import pkg from '../../package.json' with { type: 'json' };
import AppLogo from './app-logo.vue';
import ToolBar from './tool-bar.vue';
import HeaderNav from './header-nav.vue';
import SearchDocument from './search-document.vue';
import { useLocalePrefix } from '~/composables/use-locale-prefix';

const { version } = pkg;
const route = useRoute();
const isScrolled = shallowRef(false);
const { localePrefix } = useLocalePrefix();

const showTopBar = computed(() => route.path !== '/' && route.path !== '/zh');

function syncScrollState() {
  isScrolled.value = (window.scrollY || 0) > 24;
}

onMounted(() => {
  syncScrollState();
  window.addEventListener('scroll', syncScrollState, { passive: true });
  window.addEventListener('resize', syncScrollState, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('scroll', syncScrollState);
  window.removeEventListener('resize', syncScrollState);
});
</script>

<template>
  <header
    :data-scrolled="isScrolled"
    class="docs-header-shell"
  >
    <div class="docs-header-frame lt-md:group-data-[scrolled=true]:py-2">
      <div class="flex min-w-0 items-center gap-4 lg:gap-6 xl:gap-8">
        <SLink :to="localePrefix || '/'" class="group flex items-center gap-3">
          <AppLogo class="size-8 transition-transform duration-300 group-hover:scale-110" />
          <h1 class="text-lg font-bold bg-clip-text text-transparent whitespace-nowrap bg-gradient-to-r from-primary-600 to-primary dark:from-primary dark:to-primary-300">
            ubean
          </h1>
        </SLink>
        <SearchDocument />
      </div>

      <div class="flex items-center gap-3 xl:gap-4">
        <HeaderNav v-if="!showTopBar" class="lt-xl:!hidden" />
        <STag size="lg" variant="soft" color="carbon" shape="rounded" class="lt-xl:!hidden">v{{ version }}</STag>
        <SSeparator orientation="vertical" class="h-8 lt-xl:!hidden" />
        <ToolBar class="lt-xl:!hidden" />

        <SPopover :modal="false" placement="bottom-end">
          <template #trigger>
            <SButtonIcon icon="lucide:menu" class="xl:!hidden text-xl" />
          </template>
          <div class="flex flex-col gap-4 pt-4">
            <HeaderNav orientation="vertical" />
            <SSeparator />
            <ToolBar />
          </div>
        </SPopover>
      </div>
    </div>
  </header>
</template>
