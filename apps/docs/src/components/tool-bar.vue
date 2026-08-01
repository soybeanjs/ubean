<script setup lang="ts">
// Toolbar: theme toggle + locale toggle.
// Locale detection uses route.path (not useI18n().locale) for SSR consistency
// the i18n state may not be synced during SSR, causing hydration mismatches
// if the toolbar label differs between server and client.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useColorMode } from 'ubean/runtime/vue';

const route = useRoute();
const router = useRouter();
const { value: mode, toggle: toggleMode } = useColorMode();

const isDark = computed(() => mode.value === 'dark');
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));

function toggleLocale() {
  let target: string;
  if (isZh.value) {
    // Switch to English: strip /zh prefix
    target = route.path === '/zh' ? '/' : route.path.replace(/^\/zh/, '');
  } else {
    // Switch to Chinese: add /zh prefix
    target = route.path === '/' ? '/zh' : `/zh${route.path}`;
  }
  if (target !== route.path) {
    router.push(target);
  }
}

function toggleTheme() {
  toggleMode();
}
</script>

<template>
  <div class="flex items-center gap-1">
    <SButtonIcon
      variant="pure"
      :icon="isDark ? 'lucide:moon' : 'lucide:sun'"
      shape="circle"
      :aria-label="isDark ? (isZh ? '切换到浅色主题' : 'Switch to light theme') : (isZh ? '切换到深色主题' : 'Switch to dark theme')"
      :aria-pressed="isDark"
      @click="toggleTheme"
    />
    <SButton
      variant="pure"
      shape="circle"
      size="sm"
      :aria-label="isZh ? '切换到英文' : 'Switch to Chinese'"
      :aria-pressed="isZh"
      @click="toggleLocale"
    >
      <span class="text-xs font-semibold">{{ isZh ? 'EN' : '中' }}</span>
    </SButton>
  </div>
</template>
