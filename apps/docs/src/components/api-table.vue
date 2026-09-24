<script setup lang="ts">
// <ApiTable> renders API Reference entries from src/generated/api/<pkg>.json
// (TypeDoc output, written by scripts/build-api.ts).
//
// The data is imported, not fetched. A runtime `fetch('/api/<pkg>.json')` is
// what this used to do, and it failed twice over:
//
//   1. ubean's static middleware skips `/api/*` to leave it for `src/routes/`
//      handlers. This site has no API routes, so the request reached the 404
//      fallback and came back as HTML — the client then threw
//      `Unexpected token '<', "<!doctype "... is not valid JSON`.
//   2. `onMounted` only runs in the browser, so SSG prerendered the page with
//      the "Loading…" placeholder as its permanent static content — nothing for
//      a crawler to index.
//
// `import.meta.glob` (eager) fixes both: the JSON is bundled at build time, so
// the tables render during prerender and there is no request to route.
import { computed } from 'vue';
import type { TableColumn } from '@vean/ui';
import { useApiI18n } from '~/composables/use-api-i18n';

const props = defineProps<{ pkg: string }>();

interface ApiParam {
  name: string;
  type: string;
  description?: string;
  default?: string;
  __rowKey: string;
}

interface ApiProperty {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
  __rowKey: string;
}

interface ApiEntry {
  name: string;
  kind: string;
  summary?: string;
  signature?: string;
  parameters?: { name: string; type: string; description?: string; default?: string }[];
  properties?: { name: string; type: string; description?: string; optional?: boolean }[];
  returns?: string;
}

interface ApiDoc {
  name: string;
  generatedAt?: string;
  stub?: boolean;
  reason?: string;
  entries?: ApiEntry[];
}

/**
 * One glob per generated file. Eager so the data is inlined into the page chunk
 * — the tables must be present in the prerendered HTML.
 */
const apiModules = import.meta.glob<ApiDoc>('../generated/api/*.json', { eager: true, import: 'default' });

const data = computed<ApiDoc | null>(() => apiModules[`../generated/api/${props.pkg}.json`] ?? null);

/** Set only when the JSON for this package is genuinely absent (build:api not run). */
const error = computed(() => (data.value ? null : `No data for "${props.pkg}" — run \`pnpm build:api\`.`));

const { labels } = useApiI18n();

// Parameter table rows + columns.
const paramRowsByEntry = computed(() => {
  const map: Record<string, ApiParam[]> = {};
  for (const entry of data.value?.entries ?? []) {
    if (!entry.parameters?.length) continue;
    map[entry.name] = entry.parameters.map((p, i) => ({
      ...p,
      __rowKey: `${entry.name}-p-${i}-${p.name}`
    }));
  }
  return map;
});

const paramColumns = computed<TableColumn<ApiParam>[]>(() => [
  { id: 'name', accessorKey: 'name', header: labels.value.name, minSize: 144 },
  { id: 'type', accessorKey: 'type', header: labels.value.type, minSize: 176 },
  { id: 'default', accessorKey: 'default', header: labels.value.default, minSize: 120 },
  { id: 'description', accessorKey: 'description', header: labels.value.description, minSize: 240 }
]);

// Property table rows + columns.
const propRowsByEntry = computed(() => {
  const map: Record<string, ApiProperty[]> = {};
  for (const entry of data.value?.entries ?? []) {
    if (!entry.properties?.length) continue;
    map[entry.name] = entry.properties.map((p, i) => ({
      ...p,
      __rowKey: `${entry.name}-prop-${i}-${p.name}`
    }));
  }
  return map;
});

const propColumns = computed<TableColumn<ApiProperty>[]>(() => [
  { id: 'name', accessorKey: 'name', header: labels.value.name, minSize: 144 },
  { id: 'type', accessorKey: 'type', header: labels.value.type, minSize: 176 },
  { id: 'description', accessorKey: 'description', header: labels.value.description, minSize: 240 }
]);

function rowKey(row: ApiParam | ApiProperty) {
  return row.__rowKey;
}
</script>

<template>
  <div>
    <!-- Stub notice -->
    <SAlert
      v-if="data?.stub"
      variant="soft"
      color="warning"
      class="mb-6"
    >
      <template #icon><SIcon icon="lucide:alert-triangle" /></template>
      <div class="text-sm">
        <p class="font-semibold">{{ labels.stub }}</p>
        <p class="text-muted-foreground text-xs mt-1">{{ data.reason }}</p>
      </div>
    </SAlert>

    <!-- Empty -->
    <p v-else-if="data && data.entries && data.entries.length === 0" class="text-muted-foreground text-sm">
      {{ labels.empty }}
    </p>

    <!-- Entries -->
    <div v-else-if="data && data.entries" class="flex flex-col gap-6">
      <section v-for="entry in data.entries" :id="entry.name" :key="entry.name" class="scroll-mt-24">
        <div class="flex items-center gap-2 mb-2">
          <STag size="sm" variant="soft" color="primary" shape="rounded">{{ labels.kind[entry.kind] || entry.kind }}</STag>
          <h2 class="text-lg font-mono font-semibold">{{ entry.name }}</h2>
        </div>
        <p v-if="entry.summary" class="text-sm text-muted-foreground mb-3">{{ entry.summary }}</p>

        <!-- Signature -->
        <div v-if="entry.signature" class="bg-muted/50 dark:bg-muted/20 rounded-lg p-3 my-3 overflow-auto">
          <pre class="text-xs font-mono"><code>{{ entry.signature }}</code></pre>
        </div>

        <!-- Parameters -->
        <div v-if="entry.parameters && entry.parameters.length" class="my-4">
          <h3 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{{ labels.parameters }}</h3>
          <div class="min-w-0 overflow-x-auto">
            <STable
              :columns="paramColumns"
              :data="paramRowsByEntry[entry.name]"
              :row-key="rowKey"
              size="sm"
              bordered
            >
              <template #name="{ row }">
                <span class="font-mono text-xs">{{ row.name }}</span>
              </template>
              <template #type="{ row }">
                <span class="font-mono text-xs">{{ row.type }}</span>
              </template>
              <template #default="{ row }">
                <span class="font-mono text-xs text-muted-foreground">{{ row.default || '-' }}</span>
              </template>
              <template #description="{ row }">
                <span class="text-xs">{{ row.description || '-' }}</span>
              </template>
            </STable>
          </div>
        </div>

        <!-- Properties -->
        <div v-if="entry.properties && entry.properties.length" class="my-4">
          <h3 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{{ labels.properties }}</h3>
          <div class="min-w-0 overflow-x-auto">
            <STable
              :columns="propColumns"
              :data="propRowsByEntry[entry.name]"
              :row-key="rowKey"
              size="sm"
              bordered
            >
              <template #name="{ row }">
                <span class="font-mono text-xs">{{ row.name }}<span v-if="row.optional" class="text-muted-foreground">?</span></span>
              </template>
              <template #type="{ row }">
                <span class="font-mono text-xs">{{ row.type }}</span>
              </template>
              <template #description="{ row }">
                <span class="text-xs">{{ row.description || '-' }}</span>
              </template>
            </STable>
          </div>
        </div>

        <!-- Returns -->
        <div v-if="entry.returns" class="my-3">
          <span class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{{ labels.returns }}: </span>
          <code class="font-mono text-xs">{{ entry.returns }}</code>
        </div>
      </section>
    </div>

    <!-- Error -->
    <p v-else-if="error" class="text-destructive text-sm">{{ labels.errorPrefix }}{{ error }}</p>
    <p v-else class="text-muted-foreground text-sm">{{ labels.loading }}</p>
  </div>
</template>
