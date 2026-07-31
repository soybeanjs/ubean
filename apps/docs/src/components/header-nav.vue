<script setup lang="ts">
// Top-level nav: 4 primary destinations. Horizontal by default, vertical in the mobile popover.
import { computed } from 'vue';
import { menuSections } from '~/constants/menus';

const props = defineProps<{ orientation?: 'horizontal' | 'vertical' }>();

// Use the first item of each of the first 4 sections as the nav target.
const navItems = computed(() =>
  menuSections.slice(0, 4).map(s => ({ label: s.label, to: s.items[0].to }))
);
</script>

<template>
  <nav
    class="flex gap-1"
    :class="props.orientation === 'vertical' ? 'flex-col' : 'flex-row'"
  >
    <SLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-active transition-colors"
      active-class="text-foreground bg-active"
    >
      {{ item.label }}
    </SLink>
  </nav>
</template>
