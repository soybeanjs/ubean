<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { decodeBase64Utf8 } from '~/shared/encode';

interface Props {
  codeBase64: string;
}

const props = defineProps<Props>();

const code = decodeBase64Utf8(props.codeBase64);

const { copy, copied } = useClipboard({
  source: code,
  copiedDuring: 2000
});
</script>

<template>
  <SButtonIcon
    :icon="copied ? 'lucide:check' : 'lucide:copy'"
    :fit-content="false"
    class="absolute end-3 top-3 z-10 opacity-78 transition-opacity duration-200 hover:opacity-100"
    @click="copy(code)"
  />
</template>
