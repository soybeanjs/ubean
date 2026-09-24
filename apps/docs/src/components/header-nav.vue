<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { extractLocaleFromPath } from 'ubean/client';
import type { NavMenuOptionData } from '@vean/aria/nav-menu';
import { headerNavSections, menuSections } from '~/constants/menus';

interface Props {
  orientation?: 'horizontal' | 'vertical';
}

withDefaults(defineProps<Props>(), {
  orientation: 'horizontal'
});

const route = useRoute();
const { t } = useI18n();

const iconBySection: Record<string, string> = {
  guide: 'lucide:rocket',
  integrations: 'lucide:plug',
  reference: 'lucide:book-open',
  architecture: 'lucide:blocks'
};

const menus = computed<NavMenuOptionData[]>(() => {
  const path = extractLocaleFromPath(route.path).pathWithoutLocale;

  return headerNavSections.flatMap(sectionValue => {
    const section = menuSections.find(s => s.value === sectionValue);

    if (!section || section.items.length === 0) {
      return [];
    }

    const target = section.items[0].to;

    return [
      {
        value: sectionValue,
        label: t(`sidebar.${sectionValue}`),
        icon: iconBySection[sectionValue],
        to: target,
        selected: path.startsWith(`/${sectionValue}`)
      }
    ];
  });
});
</script>

<template>
  <SNavMenu :orientation="orientation" :items="menus" />
</template>
