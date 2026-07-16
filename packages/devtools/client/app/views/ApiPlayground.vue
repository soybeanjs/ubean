<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { DevToolsRouteInfo } from '../composables/useRpc';
import CodeEditor from '../components/CodeEditor.vue';

interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

interface QueryParam {
  key: string;
  value: string;
  enabled: boolean;
}

interface PlaygroundResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
  contentType: string;
}

const props = defineProps<{
  routes: DevToolsRouteInfo[];
  methodClass: (m: string) => string;
  initialMethod?: string;
  initialPath?: string;
}>();

const method = ref(props.initialMethod || 'GET');
const url = ref(props.initialPath || '/api/');
const body = ref('');
const requestTab = ref<'params' | 'headers' | 'body'>('params');
const responseTab = ref<'body' | 'headers'>('body');
const sending = ref(false);
const response = ref<PlaygroundResponse | null>(null);
const error = ref<string | null>(null);

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const params = ref<QueryParam[]>([{ key: '', value: '', enabled: true }]);
const headers = ref<RequestHeader[]>([{ key: 'Content-Type', value: 'application/json', enabled: true }]);

const hasBody = computed(() => ['POST', 'PUT', 'PATCH'].includes(method.value));

const statusClass = computed(() => {
  if (!response.value) return '';
  const s = response.value.status;
  if (s >= 200 && s < 300) return 'bg-success/12 text-success';
  if (s >= 300 && s < 400) return 'bg-info/12 text-info';
  if (s >= 400 && s < 500) return 'bg-warning/12 text-warning';
  return 'bg-destructive/12 text-destructive';
});

const formattedBody = computed(() => {
  if (!response.value) return '';
  const ct = response.value.contentType;
  if (ct.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(response.value.body), null, 2);
    } catch {
      return response.value.body;
    }
  }
  return response.value.body;
});

const responseLanguage = computed((): 'json' | 'javascript' => {
  if (!response.value) return 'json';
  const ct = response.value.contentType;
  if (ct.includes('json')) return 'json';
  if (ct.includes('html')) return 'javascript';
  return 'json';
});

watch(
  () => props.initialPath,
  newPath => {
    if (newPath) url.value = newPath;
  }
);

watch(
  () => props.initialMethod,
  newMethod => {
    if (newMethod) method.value = newMethod;
  }
);

watch(method, _m => {
  if (hasBody.value && !body.value) {
    body.value = '{\n  \n}';
  }
});

function addParam() {
  params.value.push({ key: '', value: '', enabled: true });
}

function removeParam(index: number) {
  params.value.splice(index, 1);
}

function addHeader() {
  headers.value.push({ key: '', value: '', enabled: true });
}

function removeHeader(index: number) {
  headers.value.splice(index, 1);
}

function buildUrl(): string {
  const enabledParams = params.value.filter(p => p.key && p.enabled);
  if (enabledParams.length === 0) return url.value;
  const separator = url.value.includes('?') ? '&' : '?';
  const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
  return `${url.value}${separator}${queryString}`;
}

function getRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  for (const header of headers.value) {
    if (header.key && header.enabled) {
      h[header.key] = header.value;
    }
  }
  return h;
}

async function sendRequest() {
  if (sending.value) return;
  sending.value = true;
  error.value = null;
  response.value = null;

  const start = performance.now();
  const targetUrl = buildUrl();
  const reqHeaders = getRequestHeaders();
  const reqInit: RequestInit = {
    method: method.value,
    headers: reqHeaders
  };

  if (hasBody.value && body.value.trim()) {
    reqInit.body = body.value;
  }

  try {
    const res = await fetch(targetUrl, reqInit);
    const elapsed = Math.round(performance.now() - start);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });
    const text = await res.text();

    response.value = {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body: text,
      time: elapsed,
      size: new Blob([text]).size,
      contentType: res.headers.get('content-type') || ''
    };

    responseTab.value = 'body';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Request failed';
  } finally {
    sending.value = false;
  }
}

function selectRoute(route: DevToolsRouteInfo) {
  method.value = route.method;
  url.value = route.path;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const filteredRoutes = computed(() => {
  return props.routes.filter(r => r.path !== '*' && !r.path.includes('_scalar') && !r.path.includes('_openapi'));
});
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-col border-b border-base flex-shrink-0">
      <div class="flex items-center gap-1.5 px-3 py-2">
        <select
          v-model="method"
          class="px-2 py-1.5 bg-background border border-base rounded-md text-xs font-bold text-foreground outline-none focus:border-active cursor-pointer"
          :class="methodClass(method)"
        >
          <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
        </select>
        <input
          v-model="url"
          type="text"
          placeholder="Enter request URL..."
          class="flex-1 px-3 py-1.5 bg-background border border-base rounded-md text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-active"
          @keydown.enter="sendRequest"
        />
        <button
          class="px-4 py-1.5 rounded-md text-xs font-semibold text-primary-foreground transition-all cursor-pointer flex items-center gap-1.5"
          :class="sending ? 'bg-primary/60 cursor-wait' : 'bg-primary hover:bg-primary/90'"
          :disabled="sending"
          @click="sendRequest"
        >
          <SIcon v-if="sending" icon="lucide:loader-2" :size="12" class="animate-spin" />
          <SIcon v-else icon="lucide:send" :size="12" />
          {{ sending ? 'Sending...' : 'Send' }}
        </button>
      </div>

      <div class="flex gap-0 border-t border-base">
        <button
          class="px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer"
          :class="
            requestTab === 'params'
              ? 'border-active text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="requestTab = 'params'"
        >
          Params
          <span v-if="params.some(p => p.key && p.enabled)" class="ml-1 text-primary">●</span>
        </button>
        <button
          class="px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer"
          :class="
            requestTab === 'headers'
              ? 'border-active text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="requestTab = 'headers'"
        >
          Headers
        </button>
        <button
          v-if="hasBody"
          class="px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors cursor-pointer"
          :class="
            requestTab === 'body'
              ? 'border-active text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="requestTab = 'body'"
        >
          Body
        </button>
      </div>

      <div v-if="requestTab === 'params'" class="px-3 py-2 max-h-32 overflow-y-auto">
        <div class="flex flex-col gap-1">
          <div v-for="(p, i) in params" :key="i" class="flex items-center gap-1.5">
            <input v-model="p.enabled" type="checkbox" class="size-3.5 accent-primary cursor-pointer" />
            <input
              v-model="p.key"
              type="text"
              placeholder="Key"
              class="flex-1 px-2 py-1 bg-background border border-base rounded text-[11px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-active"
            />
            <input
              v-model="p.value"
              type="text"
              placeholder="Value"
              class="flex-1 px-2 py-1 bg-background border border-base rounded text-[11px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-active"
            />
            <button
              class="size-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded cursor-pointer transition-colors"
              @click="removeParam(i)"
            >
              <SIcon icon="lucide:x" :size="11" />
            </button>
          </div>
        </div>
        <button
          class="mt-1 px-2 py-1 text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer"
          @click="addParam"
        >
          <SIcon icon="lucide:plus" :size="11" />
          Add Parameter
        </button>
      </div>

      <div v-else-if="requestTab === 'headers'" class="px-3 py-2 max-h-32 overflow-y-auto">
        <div class="flex flex-col gap-1">
          <div v-for="(h, i) in headers" :key="i" class="flex items-center gap-1.5">
            <input v-model="h.enabled" type="checkbox" class="size-3.5 accent-primary cursor-pointer" />
            <input
              v-model="h.key"
              type="text"
              placeholder="Header name"
              class="flex-1 px-2 py-1 bg-background border border-base rounded text-[11px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-active"
            />
            <input
              v-model="h.value"
              type="text"
              placeholder="Value"
              class="flex-1 px-2 py-1 bg-background border border-base rounded text-[11px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-active"
            />
            <button
              class="size-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded cursor-pointer transition-colors"
              @click="removeHeader(i)"
            >
              <SIcon icon="lucide:x" :size="11" />
            </button>
          </div>
        </div>
        <button
          class="mt-1 px-2 py-1 text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer"
          @click="addHeader"
        >
          <SIcon icon="lucide:plus" :size="11" />
          Add Header
        </button>
      </div>

      <div v-else-if="requestTab === 'body' && hasBody" class="px-3 py-2 h-36">
        <CodeEditor v-model="body" language="json" :line-numbers="false" height="100%" />
      </div>
    </div>

    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <div
        v-if="error"
        class="m-3 p-3 rounded-lg text-xs leading-relaxed bg-destructive/10 text-destructive border border-destructive/15 flex items-start gap-2 flex-shrink-0"
      >
        <SIcon icon="lucide:alert-circle" :size="14" class="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Request failed</strong>
          <br />
          {{ error }}
        </div>
      </div>

      <div v-if="response" class="flex flex-col h-full">
        <div class="flex items-center gap-3 px-3 py-1.5 border-b border-base bg-background/50 flex-shrink-0">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono" :class="statusClass">
            {{ response.status }} {{ response.statusText }}
          </span>
          <span class="text-[11px] text-muted-foreground flex items-center gap-1">
            <SIcon icon="lucide:clock" :size="11" />
            {{ response.time }}ms
          </span>
          <span class="text-[11px] text-muted-foreground flex items-center gap-1">
            <SIcon icon="lucide:hard-drive" :size="11" />
            {{ formatSize(response.size) }}
          </span>
          <div class="ml-auto flex gap-0">
            <button
              class="px-2 py-1 text-[11px] font-medium border-b-2 transition-colors cursor-pointer"
              :class="
                responseTab === 'body'
                  ? 'border-active text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              "
              @click="responseTab = 'body'"
            >
              Body
            </button>
            <button
              class="px-2 py-1 text-[11px] font-medium border-b-2 transition-colors cursor-pointer"
              :class="
                responseTab === 'headers'
                  ? 'border-active text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              "
              @click="responseTab = 'headers'"
            >
              Headers ({{ Object.keys(response.headers).length }})
            </button>
          </div>
        </div>

        <div v-if="responseTab === 'body'" class="flex-1 overflow-hidden p-2 min-h-0">
          <CodeEditor
            :model-value="formattedBody"
            :language="responseLanguage"
            readonly
            :line-numbers="false"
            height="100%"
          />
        </div>
        <div v-else class="flex-1 overflow-y-auto p-2">
          <div class="flex flex-col gap-0">
            <div
              v-for="(val, key) in response.headers"
              :key="String(key)"
              class="flex items-center px-2 py-1 text-[11px] border-b border-base font-mono"
            >
              <span class="text-muted-foreground w-44 flex-shrink-0">{{ key }}</span>
              <span class="text-foreground break-all">{{ val }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!sending && !error" class="flex-1 overflow-y-auto p-3.5">
        <div v-if="filteredRoutes.length > 0" class="section-card">
          <div class="section-header">
            <SIcon icon="lucide:zap" :size="13" class="text-primary" />
            <span class="section-title">Quick Select</span>
          </div>
          <div class="section-body">
            <div class="p-1 flex flex-col gap-0.5 max-h-80 overflow-y-auto">
              <button
                v-for="r in filteredRoutes.slice(0, 50)"
                :key="`${r.method}-${r.path}`"
                class="flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-active transition-colors cursor-pointer"
                @click="selectRoute(r)"
              >
                <span
                  class="min-w-[42px] px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wider text-center font-mono"
                  :class="methodClass(r.method)"
                >
                  {{ r.method }}
                </span>
                <span class="font-mono text-foreground text-xs truncate flex-1" :title="r.path">{{ r.path }}</span>
              </button>
              <div v-if="filteredRoutes.length > 50" class="px-2 py-1 text-[10px] text-muted-foreground text-center">
                ... and {{ filteredRoutes.length - 50 }} more routes
              </div>
            </div>
          </div>
        </div>
        <div class="empty-state py-8">
          <SIcon icon="lucide:play" :size="28" class="text-muted-foreground/40 mb-2" />
          <div class="empty-title">Ready to send</div>
          <div class="empty-desc">Select a route above or enter a URL to test your API</div>
        </div>
      </div>

      <div v-if="sending" class="flex-1 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3 text-muted-foreground">
          <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
          <span class="text-xs">Sending request...</span>
        </div>
      </div>
    </div>
  </div>
</template>
