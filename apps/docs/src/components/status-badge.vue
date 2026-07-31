<script setup lang="ts">
// Status badge for Architecture docs (per DESIGN.md D13).
// Mirrors docs/README.md classification: implemented / historical / proposal / translated-stub.
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const map: Record<string, { label: string; icon: string; variant: string }> = {
  implemented: { label: 'Implemented', icon: 'lucide:check-circle', variant: 'success' },
  historical: { label: 'Historical', icon: 'lucide:archive', variant: 'carbon' },
  proposal: { label: 'Proposal', icon: 'lucide:lightbulb', variant: 'warning' },
  'translated-stub': { label: 'EN stub', icon: 'lucide:languages', variant: 'info' }
};

const info = computed(() => map[props.status] || { label: props.status, icon: 'lucide:circle', variant: 'carbon' });
</script>

<template>
  <STag size="sm" :variant="info.variant as any" shape="rounded" class="uppercase tracking-wide text-xs">
    <template #icon><SIcon :icon="info.icon" /></template>
    {{ info.label }}
  </STag>
</template>
