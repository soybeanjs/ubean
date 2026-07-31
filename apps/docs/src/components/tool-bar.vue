<script setup lang="ts">
// Toolbar: theme toggle + locale toggle. Adapted from the reference's tool-bar.vue.
// Per DESIGN.md D17: locale switching uses switchLocalePath + router.push (not
// useI18n().setLocale, which only mutates internal state and does not navigate).
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n, useColorMode, switchLocalePath } from 'ubean/runtime/vue';

const { locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { value: mode, toggle: toggleMode } = useColorMode();

const isDark = computed(() => mode.value === 'dark');
const isZh = computed(() => locale.value === 'zh');

function toggleLocale() {
  const next = isZh.value ? 'en' : 'zh';
  const target = switchLocalePath(next, route.path);
  if (target && target !== route.path) {
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
      aria-label="Toggle theme"
      @click="toggleTheme"
    />
    <SButton
      variant="pure"
      shape="circle"
      size="sm"
      :aria-label="`Switch to ${isZh ? 'en' : 'zh'}`"
      @click="toggleLocale"
    >
      <span class="text-xs font-semibold">{{ isZh ? 'EN' : '中' }}</span>
    </SButton>
  </div>
</template>
