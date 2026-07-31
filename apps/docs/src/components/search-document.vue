<script setup lang="ts">
// Client-side search trigger + results popover. Uses useDocSearch (fuse.js over public/search-index.json).
import { useRouter } from 'vue-router';
import { useDocSearch } from '~/composables/use-doc-search';

const { query, results, loading, open, onInput, close } = useDocSearch();

function onSelect(route: string) {
  const router = useRouter();
  router.push(route);
  close();
}
</script>

<template>
  <SPopover v-model:open="open" placement="bottom-start" :modal="false">
    <template #trigger>
      <SButton
        variant="outline"
        shape="rounded"
        class="w-64 lt-md:w-12 lt-md:px-2"
        aria-label="Search docs"
      >
        <template #icon>
          <SIcon icon="lucide:search" />
        </template>
        <span class="lt-md:hidden text-muted-foreground">Search docs…</span>
      </SButton>
    </template>

    <div class="w-80 md:w-96 p-2">
      <SInput
        v-model="query"
        placeholder="Type to search…"
        autofocus
        @input="onInput"
      >
        <template #prefix>
          <SIcon icon="lucide:search" class="text-muted-foreground" />
        </template>
      </SInput>

      <div v-if="loading" class="py-4 text-center text-muted-foreground text-xs">Searching…</div>
      <div v-else-if="results.length" class="mt-2 max-h-80 overflow-auto flex flex-col gap-0.5">
        <button
          v-for="r in results"
          :key="r.item.route"
          type="button"
          class="text-start px-2 py-1.5 rounded-md hover:bg-active transition-colors"
          @click="onSelect(r.item.route)"
        >
          <div class="text-sm font-medium truncate">{{ r.item.title }}</div>
          <div class="text-xs text-muted-foreground truncate">
            <span class="opacity-70">{{ r.item.section }}</span> · {{ r.item.route }}
          </div>
        </button>
      </div>
      <div v-else-if="query" class="py-4 text-center text-muted-foreground text-xs">No matches.</div>
      <div v-else class="py-3 text-center text-muted-foreground text-xs">
        Index builds at prerender time. Run <code class="font-mono">pnpm build</code>.
      </div>
    </div>
  </SPopover>
</template>
