<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { extractLocaleFromPath } from 'ubean/client';
import type { TreeMenuOptionData } from '@vean/aria/tree-menu';
import { menuSections } from '~/constants/menus';

type Emits = {
  select: [];
};

const emit = defineEmits<Emits>();

const route = useRoute();
const { t } = useI18n();

const selected = ref<string>('');

const barePath = computed(() => extractLocaleFromPath(route.path).pathWithoutLocale);

const menus = computed<TreeMenuOptionData[]>(() =>
  menuSections.map(section => ({
    isGroup: true,
    label: t(`sidebar.${section.value}`),
    value: section.value,
    children: [
      ...section.items.map(item => ({
        label: item.label,
        value: item.to.split('/').filter(Boolean).join('-'),
        to: item.to
      })),
      ...(section.groups ?? []).map(group => ({
        label: group.label,
        value: `${section.value}-${group.label.toLowerCase().replace(/\s+/gu, '-')}`,
        children: group.items.map(item => ({
          label: item.label,
          value: item.to.split('/').filter(Boolean).join('-'),
          to: item.to
        }))
      }))
    ]
  }))
);

// The selected value must match the `value` generated above, which is the
// route path with `/` replaced by `-` and the locale prefix stripped.
watchEffect(() => {
  selected.value = barePath.value.split('/').filter(Boolean).join('-');
});
</script>

<template>
  <div class="max-h-full overflow-auto md:border md:border-border/50 md:dark:border-border md:rounded-xl">
    <STreeMenu :model-value="selected" :items="menus" :indent="4" @update:model-value="emit('select')" />
  </div>
</template>
