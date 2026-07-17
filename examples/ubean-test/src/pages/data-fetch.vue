<script setup lang="ts">
import { ref, onMounted } from 'vue';

useHead({
  title: 'Data Fetch Test - ubean',
  meta: [{ name: 'description', content: 'Data fetching and ofetch client integration test' }]
});

interface ApiResponse {
  method: string;
  url: string;
  status: number;
  data: unknown;
  duration: number;
}

const results = ref<ApiResponse[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchApi(method: string, url: string, body?: unknown): Promise<ApiResponse> {
  const start = performance.now();
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  const duration = Math.round(performance.now() - start);
  return { method, url, status: res.status, data, duration };
}

async function runTests() {
  loading.value = true;
  error.value = null;
  results.value = [];
  try {
    results.value.push(await fetchApi('GET', '/api/hello'));
    results.value.push(await fetchApi('GET', '/api/users'));
    results.value.push(await fetchApi('GET', '/api/env'));
    results.value.push(await fetchApi('POST', '/api/users', { name: 'Frontend Test', email: 'fe@test.com' }));
    results.value.push(await fetchApi('GET', '/api/data-test?action=cache'));
    results.value.push(await fetchApi('GET', '/api/data-test?action=invalidateByTag'));
    results.value.push(await fetchApi('GET', '/api/data-test?action=ttl'));
    results.value.push(await fetchApi('GET', '/api/client-test?action=env'));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(runTests);
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-2">Data Fetch Test</h1>
    <p class="text-gray-500 mb-6">Client-side data fetching via fetch API + server-side useData/ofetch verification</p>

    <div v-if="loading" class="mb-4 text-blue-500">Running tests...</div>
    <div v-if="error" class="mb-4 p-3 bg-red-100 text-red-700 rounded">{{ error }}</div>

    <button
      :disabled="loading"
      class="mb-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      @click="runTests"
    >
      Re-run Tests
    </button>

    <section v-for="(r, i) in results" :key="i" class="mb-6 p-4 border rounded-lg">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span
            class="px-2 py-0.5 text-xs font-mono rounded"
            :class="
              r.method === 'GET'
                ? 'bg-blue-100 text-blue-700'
                : r.method === 'POST'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
            "
          >
            {{ r.method }}
          </span>
          <code class="text-sm">{{ r.url }}</code>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span
            class="px-2 py-0.5 rounded font-mono"
            :class="r.status >= 200 && r.status < 300 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ r.status }}
          </span>
          <span class="text-gray-500">{{ r.duration }}ms</span>
        </div>
      </div>
      <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto">{{ JSON.stringify(r.data, null, 2) }}</pre>
    </section>
  </div>
</template>
