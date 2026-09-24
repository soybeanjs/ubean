<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { extractLocaleFromPath } from 'ubean/client';
import type { TreeMenuOptionData } from '@vean/aria/tree-menu';
import { menuSections, sidebarItemKey } from '~/constants/menus';
import type { MenuItem } from '~/constants/menus';

type Emits = {
  select: [];
};

const emit = defineEmits<Emits>();

const route = useRoute();
const { t, te } = useI18n();

const selected = ref<string>('');

const barePath = computed(() => extractLocaleFromPath(route.path).pathWithoutLocale);

/**
 * An item's label comes from `sidebar_items.*` so it follows the active locale;
 * `item.label` (English) is only a fallback for a route with no catalogue entry.
 * `te` rather than a bare `t` so a missing key degrades to English instead of
 * rendering the raw key.
 */
function itemLabel(item: MenuItem): string {
  const key = `sidebar_items.${sidebarItemKey(item.to)}`;
  return te(key) ? t(key) : item.label;
}

/**
 * A sub-group's key is `sidebar_groups.<slug(label)>`, e.g. `api_reference`.
 *
 * Kept mechanical (label only, no section prefix) so the catalogue can be
 * generated from this exact rule — the previous hand-written key disagreed with
 * the derivation and the group silently fell back to English.
 */
function groupLabel(label: string): string {
  const key = `sidebar_groups.${label.toLowerCase().replace(/\s+/gu, '_')}`;
  return te(key) ? t(key) : label;
}

const menus = computed<TreeMenuOptionData[]>(() =>
  menuSections.map(section => ({
    isGroup: true,
    label: t(`sidebar.${section.value}`),
    value: section.value,
    children: [
      ...section.items.map(item => ({
        label: itemLabel(item),
        value: item.to.split('/').filter(Boolean).join('-'),
        to: item.to
      })),
      // Sub-groups stay one level deep: their label is a section title (not a
      // route), so it needs a key of its own; their items reuse the same
      // route-derived keys as top-level entries.
      ...(section.groups ?? []).map(group => ({
        label: groupLabel(group.label),
        value: `${section.value}-${group.label.toLowerCase().replace(/\s+/gu, '-')}`,
        children: group.items.map(item => ({
          label: itemLabel(item),
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
