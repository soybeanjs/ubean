<script setup lang="ts">
import { computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  scalarPath?: string;
  enabled?: boolean;
}>();

const iframeSrc = computed(() => props.scalarPath || '/_scalar');
</script>

<template>
  <div class="w-full h-full relative bg-background">
    <div
      v-if="enabled === false"
      class="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-10 py-10 text-center"
    >
      <SIcon icon="lucide:file-text" :size="40" class="text-muted-foreground/50" />
      <div class="text-[15px] font-semibold text-foreground">API Docs Not Enabled</div>
      <div class="text-xs leading-relaxed max-w-80 op-fade">
        Set
        <code class="bg-secondary px-1.5 py-0.5 rounded text-[11px] font-mono text-primary">openAPI: true</code>
        in your ubean config to enable Scalar API reference.
      </div>
    </div>
    <iframe
      v-else
      :src="iframeSrc"
      class="w-full h-full border-none bg-white"
      title="API Reference"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  </div>
</template>
