<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { SConfigProvider, SIcon, SButtonIcon } from '@soybeanjs/ui';
import { useRpc } from './composables/useRpc';
import type { CrudResourceType } from './composables/useRpc';
import CreateDialog from './components/CreateDialog.vue';
import AiAssistant from './views/AiAssistant.vue';
import ApiDocs from './views/ApiDocs.vue';
import ApiPlayground from './views/ApiPlayground.vue';
import ApiRoutes from './views/ApiRoutes.vue';
import Config from './views/Config.vue';
import Crons from './views/Crons.vue';
import DrizzleStudio from './views/DrizzleStudio.vue';
import EnvVars from './views/EnvVars.vue';
import Layouts from './views/Layouts.vue';
import Middlewares from './views/Middlewares.vue';
import Overview from './views/Overview.vue';
import Pages from './views/Pages.vue';

const {
  loading,
  error,
  info,
  env,
  uptime,
  fmtUptime,
  fmtTime,
  fmtVal,
  filePath,
  methodClass,
  refresh,
  crudCreate,
  crudDelete,
  aiChat
} = useRpc();

// --- Hash-based routing ---
// Each dock entry points to /__ubean_devtools__/index.html#/<route>.
// DTK dock shell provides navigation; the SPA renders only the matching view.
const route = computed(() => {
  const hash = window.location.hash.slice(2); // remove '#/'
  return hash || 'overview';
});

// --- Sub-tab state for grouped views ---
const apiSubTab = ref<'routes' | 'playground'>('routes');
const structureSubTab = ref<'middlewares' | 'layouts'>('middlewares');

// --- Playground cross-view interaction (Routes → Playground within #/api) ---
const playgroundMethod = ref('GET');
const playgroundPath = ref('/api/');
function tryRoute(r: { method: string; path: string }) {
  playgroundMethod.value = r.method;
  playgroundPath.value = r.path;
  apiSubTab.value = 'playground';
}

// --- Create dialog (floating action button + keyboard shortcuts) ---
const showCreateMenu = ref(false);
const createDialogOpen = ref(false);
const createDialogType = ref<CrudResourceType>('page');
const createOptions = [
  { type: 'page' as const, label: 'Page', icon: 'lucide:file-text', shortcut: 'P' },
  { type: 'api' as const, label: 'API Route', icon: 'lucide:send', shortcut: 'A' },
  { type: 'middleware' as const, label: 'Middleware', icon: 'lucide:layers', shortcut: 'M' },
  { type: 'layout' as const, label: 'Layout', icon: 'lucide:layout', shortcut: 'L' },
  { type: 'cron' as const, label: 'Cron Job', icon: 'lucide:clock', shortcut: 'C' }
];
const shortcutMap: Record<string, CrudResourceType> = {
  P: 'page',
  A: 'api',
  M: 'middleware',
  L: 'layout',
  C: 'cron'
};

function openCreateDialog(type: CrudResourceType) {
  createDialogType.value = type;
  createDialogOpen.value = true;
  showCreateMenu.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (createDialogOpen.value) return;
  const key = e.key.toUpperCase();
  if (key === 'N' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openCreateDialog('page');
    return;
  }
  if (shortcutMap[key]) openCreateDialog(shortcutMap[key]);
}

// --- Delete handlers ---
function handlePageDelete(page: { path: string }) {
  crudDelete('page', { path: page.path });
}
function handleApiRouteDelete(r: { filePath?: string; path: string; method: string }) {
  if (r.filePath) crudDelete('api', { path: r.filePath });
}
function handleMiddlewareDelete(mw: { path: string }) {
  crudDelete('middleware', { path: mw.path });
}
function handleLayoutDelete(layout: { path: string }) {
  crudDelete('layout', { path: layout.path });
}
function handleCronDelete(cron: { filePath?: string; name: string }) {
  if (cron.filePath) crudDelete('cron', { path: cron.filePath });
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <SConfigProvider>
    <div class="h-full flex flex-col bg-background text-foreground relative">
      <!-- Loading -->
      <div
        v-if="loading"
        class="flex flex-col items-center justify-center h-full py-20 px-5 gap-3.5 text-muted-foreground"
      >
        <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
        <span class="text-sm">Loading DevTools...</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="p-3.5 overflow-y-auto h-full">
        <div
          class="flex items-start gap-2.5 p-3 rounded-lg text-xs leading-relaxed bg-destructive/10 text-destructive border border-destructive/15"
        >
          <SIcon icon="lucide:alert-circle" :size="16" class="flex-shrink-0 mt-0.5" />
          <div>
            <strong>Connection failed</strong>
            <br />
            {{ error }}
          </div>
        </div>
      </div>

      <!-- View content -->
      <template v-else-if="info">
        <!-- Floating toolbar (New + Refresh) -->
        <div class="absolute top-2 right-2.5 z-40 flex items-center gap-1">
          <div class="relative">
            <SButtonIcon
              icon="lucide:plus"
              size="sm"
              variant="ghost"
              color="secondary"
              title="New... (P/A/M/L/C)"
              @click="showCreateMenu = !showCreateMenu"
            />
            <div
              v-if="showCreateMenu"
              class="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-48 animate-fade-in"
              @click.self="showCreateMenu = false"
            >
              <div
                class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border"
              >
                Create New
              </div>
              <button
                v-for="opt in createOptions"
                :key="opt.type"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary/50 cursor-pointer transition-colors text-foreground border-none bg-transparent"
                @click="openCreateDialog(opt.type)"
              >
                <SIcon :icon="opt.icon" :size="14" />
                <span>{{ opt.label }}</span>
                <span
                  class="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono"
                >
                  {{ opt.shortcut }}
                </span>
              </button>
            </div>
          </div>
          <SButtonIcon
            icon="lucide:refresh-cw"
            size="sm"
            variant="ghost"
            color="secondary"
            title="Refresh"
            @click="refresh"
          />
        </div>

        <!-- Overview -->
        <div v-if="route === 'overview'" class="h-full overflow-y-auto">
          <Overview :info="info" :uptime="uptime" :fmt-uptime="fmtUptime" :fmt-time="fmtTime" :fmt-val="fmtVal" />
        </div>

        <!-- AI -->
        <AiAssistant
          v-else-if="route === 'ai'"
          class="h-full"
          :info="info"
          :send-chat="aiChat"
          :on-refresh="refresh"
        />

        <!-- API (Routes + Playground, grouped) -->
        <div v-else-if="route === 'api'" class="h-full flex flex-col">
          <div class="flex gap-0.5 px-2.5 py-1.5 bg-card border-b border-border flex-shrink-0">
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              :data-active="apiSubTab === 'routes'"
              @click="apiSubTab = 'routes'"
            >
              <SIcon icon="lucide:send" :size="13" />
              Routes
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              :data-active="apiSubTab === 'playground'"
              @click="apiSubTab = 'playground'"
            >
              <SIcon icon="lucide:play" :size="13" />
              Playground
            </button>
          </div>
          <ApiRoutes
            v-show="apiSubTab === 'routes'"
            class="flex-1 overflow-hidden"
            :routes="info.routes || []"
            :file-path="filePath"
            :method-class="methodClass"
            @try-route="tryRoute"
            @delete="handleApiRouteDelete"
          />
          <ApiPlayground
            v-show="apiSubTab === 'playground'"
            class="flex-1 overflow-hidden"
            :routes="info.routes || []"
            :method-class="methodClass"
            :initial-method="playgroundMethod"
            :initial-path="playgroundPath"
          />
        </div>

        <!-- Pages -->
        <Pages
          v-else-if="route === 'pages'"
          class="h-full"
          :pages="info.pagesList || []"
          :file-path="filePath"
          @delete="handlePageDelete"
        />

        <!-- Structure (Middlewares + Layouts, grouped) -->
        <div v-else-if="route === 'structure'" class="h-full flex flex-col">
          <div class="flex gap-0.5 px-2.5 py-1.5 bg-card border-b border-border flex-shrink-0">
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              :data-active="structureSubTab === 'middlewares'"
              @click="structureSubTab = 'middlewares'"
            >
              <SIcon icon="lucide:layers" :size="13" />
              Middlewares
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              :data-active="structureSubTab === 'layouts'"
              @click="structureSubTab = 'layouts'"
            >
              <SIcon icon="lucide:layout" :size="13" />
              Layouts
            </button>
          </div>
          <Middlewares
            v-show="structureSubTab === 'middlewares'"
            class="flex-1 overflow-hidden"
            :middlewares="info.middlewaresList || []"
            :file-path="filePath"
            @delete="handleMiddlewareDelete"
          />
          <Layouts
            v-show="structureSubTab === 'layouts'"
            class="flex-1 overflow-hidden"
            :layouts="info.layoutsList || []"
            :file-path="filePath"
            @delete="handleLayoutDelete"
          />
        </div>

        <!-- Crons -->
        <Crons
          v-else-if="route === 'crons'"
          class="h-full"
          :crons="info.cronsList || []"
          :file-path="filePath"
          @delete="handleCronDelete"
        />

        <!-- Env -->
        <EnvVars v-else-if="route === 'env'" class="h-full" :env="env" />

        <!-- Config -->
        <Config
          v-else-if="route === 'config'"
          class="h-full"
          :config="info.config || {}"
          :info="info"
          :fmt-uptime="fmtUptime"
          :fmt-time="fmtTime"
          :fmt-val="fmtVal"
          :uptime="uptime"
        />

        <!-- API Docs -->
        <ApiDocs
          v-else-if="route === 'api-docs'"
          class="h-full"
          :enabled="info.openAPI?.enabled"
          :scalar-path="info.openAPI?.scalarPath"
        />

        <!-- Database -->
        <DrizzleStudio
          v-else-if="route === 'database'"
          class="h-full"
          :available="info.database?.drizzleStudioAvailable"
          :studio-url="info.database?.studioUrl"
        />

        <!-- Fallback -->
        <div v-else class="flex items-center justify-center h-full text-muted-foreground text-sm">
          Unknown view: {{ route }}
        </div>
      </template>

      <CreateDialog
        :open="createDialogOpen"
        :initial-type="createDialogType"
        :on-create="crudCreate"
        @close="createDialogOpen = false"
      />
    </div>
  </SConfigProvider>
</template>
