<script setup lang="ts">
// Status badge for Architecture docs (per DESIGN.md D13).
// Mirrors docs/README.md classification: implemented / historical / proposal / translated-stub.
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{ status: string }>();

const route = useRoute();
const isZh = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'));

const map: Record<string, { label: { en: string; zh: string }; icon: string; variant: string }> = {
  implemented: { label: { en: 'Implemented', zh: '已实现' }, icon: 'lucide:check-circle', variant: 'success' },
  historical: { label: { en: 'Historical', zh: '历史' }, icon: 'lucide:archive', variant: 'carbon' },
  proposal: { label: { en: 'Proposal', zh: '提案' }, icon: 'lucide:lightbulb', variant: 'warning' },
  'translated-stub': { label: { en: 'EN stub', zh: '英文占位' }, icon: 'lucide:languages', variant: 'info' }
};

const info = computed(() => {
  const entry = map[props.status];
  if (!entry) return { label: props.status, icon: 'lucide:circle', variant: 'carbon' };
  return { label: isZh.value ? entry.label.zh : entry.label.en, icon: entry.icon, variant: entry.variant };
});
</script>

<template>
  <STag size="sm" :variant="info.variant as any" shape="rounded" class="uppercase tracking-wide text-xs">
    <template #icon><SIcon :icon="info.icon" /></template>
    {{ info.label }}
  </STag>
</template>
