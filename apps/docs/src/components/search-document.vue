<script setup lang="ts">
// Client-side search trigger + results popover. Uses useDocSearch (fuse.js over public/search-index.json).
import { useRouter } from 'vue-router';
import { useDocSearch } from '~/composables/use-doc-search';
import { useLocalePrefix } from '~/composables/use-locale-prefix';

const router = useRouter();
const { query, results, loading, open, onInput, close } = useDocSearch();
const { isZh, localizedTo } = useLocalePrefix();

function onSelect(route: string) {
  router.push(localizedTo(route));
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
        :aria-label="isZh ? '搜索文档' : 'Search docs'"
      >
        <template #leading>
          <SIcon icon="lucide:search" />
        </template>
        <span class="lt-md:hidden text-muted-foreground">{{ isZh ? '搜索文档…' : 'Search docs…' }}</span>
      </SButton>
    </template>

    <div class="docs-subtle-card w-72 max-w-[calc(100vw-1.5rem)] p-2 md:w-96">
      <SInput
        v-model="query"
        :placeholder="isZh ? '输入关键词搜索…' : 'Type to search…'"
        :aria-label="isZh ? '搜索文档' : 'Search docs'"
        autofocus
        @input="onInput"
      >
        <template #leading>
          <SIcon icon="lucide:search" class="text-muted-foreground" />
        </template>
      </SInput>

      <div v-if="loading" class="py-4 text-center text-xs text-muted-foreground" role="status">{{ isZh ? '搜索中…' : 'Searching…' }}</div>
      <div v-else-if="results.length" class="mt-2 flex max-h-80 flex-col gap-0.5 overflow-auto" role="listbox" :aria-label="isZh ? '搜索结果' : 'Search results'">
        <button
          v-for="r in results"
          :key="r.item.route"
          type="button"
          role="option"
          class="rounded-md px-2 py-1.5 text-start transition-colors hover:bg-active focus-visible:bg-active focus-visible:outline-none"
          @click="onSelect(r.item.route)"
        >
          <div class="truncate text-sm font-medium">{{ r.item.title }}</div>
          <div class="truncate text-xs text-muted-foreground">
            <span class="opacity-70">{{ r.item.section }}</span> · {{ r.item.route }}
          </div>
        </button>
      </div>
      <div v-else-if="query" class="py-4 text-center text-xs text-muted-foreground">{{ isZh ? '未找到匹配结果。' : 'No matches.' }}</div>
      <div v-else class="py-3 text-center text-xs text-muted-foreground">
        {{ isZh ? '搜索索引在预渲染时构建。请运行 ' : 'Index builds at prerender time. Run ' }}<code class="font-mono">pnpm build</code>{{ isZh ? '。' : '.' }}
      </div>
    </div>
  </SPopover>
</template>
