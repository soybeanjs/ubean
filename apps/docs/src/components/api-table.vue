<script setup lang="ts">
// <ApiTable> renders API Reference Entries from public/api/<pkg>.json (TypeDoc output).
// Per DESIGN.md D4/D6/D15. Uses @soybeanjs/ui's STable in its data-driven form
// (columns/data/row-key + per-column slots), mirroring the reference's type-data.vue.
// Falls back gracefully when build:api emitted a stub (no dist/*.d.ts).
import { shallowRef, ref, computed, onMounted, watch } from 'vue';
import type { TableColumn } from '@soybeanjs/ui';
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

const data = shallowRef<ApiDoc | null>(null);
const error = ref<string | null>(null);

async function load() {
  try {
    const res = await fetch(`/api/${props.pkg}.json`);
    if (!res.ok) {
      error.value = `HTTP ${res.status}`;
      return;
    }
    data.value = (await res.json()) as ApiDoc;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(load);
watch(() => props.pkg, load);

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
  { key: 'name', dataIndex: 'name', title: labels.value.name, minWidth: '144px' },
  { key: 'type', dataIndex: 'type', title: labels.value.type, minWidth: '176px' },
  { key: 'default', dataIndex: 'default', title: labels.value.default, minWidth: '120px' },
  { key: 'description', dataIndex: 'description', title: labels.value.description, minWidth: '240px' }
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
  { key: 'name', dataIndex: 'name', title: labels.value.name, minWidth: '144px' },
  { key: 'type', dataIndex: 'type', title: labels.value.type, minWidth: '176px' },
  { key: 'description', dataIndex: 'description', title: labels.value.description, minWidth: '240px' }
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
