<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { SConfigProvider, SIcon } from '@soybeanjs/ui';
import { useRpc } from './composables/useRpc';
import type { CrudResourceType } from './composables/useRpc';
import CreateDialog from './components/CreateDialog.vue';
import EditDialog from './components/EditDialog.vue';
import EnvEditDialog from './components/EnvEditDialog.vue';
import FloatingAiButton from './components/FloatingAiButton.vue';
import PageMetaDialog from './components/PageMetaDialog.vue';
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
import Terminal from './views/Terminal.vue';

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
  crudRead,
  crudUpdate,
  crudDelete,
  aiChatStream,
  terminalStart,
  terminalInput,
  terminalResize,
  terminalPoll,
  terminalKill
} = useRpc();

// --- Hash-based routing ---
// Each dock entry points to /_devtools/index.html#/<route>.
// DTK dock shell provides navigation; the SPA renders only the matching view.
const route = computed(() => {
  const hash = window.location.hash.slice(2); // remove '#/'
  return hash || 'overview';
});

// --- Sub-tab state for grouped views ---
const apiSubTab = ref<'routes' | 'playground'>('routes');
const pagesSubTab = ref<'pages' | 'layouts'>('pages');

// --- Playground cross-view interaction (Routes → Playground within #/api) ---
const playgroundMethod = ref('GET');
const playgroundPath = ref('/api/');
function tryRoute(r: { method: string; path: string }) {
  playgroundMethod.value = r.method;
  playgroundPath.value = r.path;
  apiSubTab.value = 'playground';
}

// --- Floating AI button context ---
// Maps the current route (+ sub-tab) to a human-readable panel name and a
// brief resource summary so the AI drawer knows what the user is looking at.
const currentPanelContext = computed(() => {
  switch (route.value) {
    case 'overview':
      return 'Overview';
    case 'pages':
      return pagesSubTab.value === 'layouts' ? 'Layouts' : 'Pages';
    case 'api':
      return apiSubTab.value === 'playground' ? 'API Playground' : 'API Routes';
    case 'middleware':
      return 'Middlewares';
    case 'crons':
      return 'Crons';
    case 'env':
      return 'Environment Variables';
    case 'config':
      return 'Config';
    case 'api-docs':
      return 'API Docs';
    case 'database':
      return 'Database';
    case 'terminal':
      return 'Terminal';
    default:
      return 'DevTools';
  }
});

const rootDir = computed(() => (info.value?.config.rootDir as string) || '');

const currentResourceSummary = computed(() => {
  if (!info.value) return '';
  const i = info.value;
  switch (route.value) {
    case 'overview':
      return `Project has ${i.pages} pages, ${i.apiRoutes} API routes, ${i.middleware} middleware, ${i.layouts} layouts, ${i.crons} cron jobs.`;
    case 'pages':
      return pagesSubTab.value === 'layouts' ? `${i.layouts} layouts available.` : `${i.pages} pages available.`;
    case 'api':
      return apiSubTab.value === 'playground'
        ? `${i.apiRoutes} API routes available to test.`
        : `${i.apiRoutes} API routes available.`;
    case 'middleware':
      return `${i.middleware} middleware registered.`;
    case 'crons':
      return `${i.crons} cron jobs registered.`;
    case 'env':
      return `${Object.keys(env.value).length} environment variables.`;
    case 'config':
      return `Preset: ${i.presets.join(', ') || 'default'}`;
    default:
      return '';
  }
});

// --- Create dialog (keyboard shortcuts) ---
const createDialogOpen = ref(false);
const createDialogType = ref<CrudResourceType>('page');

// --- Refresh with spin animation ---
const refreshing = ref(false);
async function handleRefresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  await refresh();
  // Keep the spin animation visible for at least 500ms for visual feedback.
  setTimeout(() => {
    refreshing.value = false;
  }, 500);
}
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
  if (key === 'R') {
    handleRefresh();
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

// --- Edit dialog state (reusable for all file-based resources) ---
const editDialogOpen = ref(false);
const editFilePath = ref('');
const editResourceType = ref<CrudResourceType>('page');
const editTitle = ref('');
const editLanguage = ref<'vue' | 'typescript' | 'json' | 'text'>('typescript');

function openEditDialog(
  _filePath: string,
  type: CrudResourceType,
  title: string,
  lang?: 'vue' | 'typescript' | 'json' | 'text'
) {
  editFilePath.value = _filePath;
  editResourceType.value = type;
  editTitle.value = title;
  editLanguage.value = lang || 'typescript';
  editDialogOpen.value = true;
}

// --- Edit handlers ---
function handlePageEdit(page: { filePath?: string; path: string }) {
  if (page.filePath) openEditDialog(page.filePath, 'page', `Edit Page: ${page.path}`, 'vue');
}
function handleApiRouteEdit(r: { filePath?: string; path: string; method: string }) {
  if (r.filePath) openEditDialog(r.filePath, 'api', `Edit Route: ${r.method} ${r.path}`, 'typescript');
}
function handleMiddlewareEdit(mw: { filePath?: string; path: string }) {
  if (mw.filePath) openEditDialog(mw.filePath, 'middleware', `Edit Middleware: ${mw.path}`, 'typescript');
}
function handleLayoutEdit(layout: { filePath?: string; name: string }) {
  if (layout.filePath) openEditDialog(layout.filePath, 'layout', `Edit Layout: ${layout.name}`, 'vue');
}
function handleCronEdit(cron: { filePath?: string; name: string }) {
  if (cron.filePath) openEditDialog(cron.filePath, 'cron', `Edit Cron: ${cron.name}`, 'typescript');
}

// --- Config edit ---
function handleConfigEdit() {
  // The config file is at {cwd}/ubean.config.ts — use 'config' type with explicit path.
  openEditDialog('ubean.config.ts', 'config', 'Edit Project Config', 'typescript');
}

// --- Page meta (definePage) form dialog ---
const pageMetaOpen = ref(false);
const pageMetaFilePath = ref('');
const pageMetaPagePath = ref('');

function handlePageMetaEdit(page: { filePath?: string; path: string }) {
  if (!page.filePath) return;
  pageMetaFilePath.value = page.filePath;
  pageMetaPagePath.value = page.path;
  pageMetaOpen.value = true;
}

// --- Env CRUD dialog ---
const envEditOpen = ref(false);
const envEditKey = ref('');
const envEditValue = ref('');
const envIsNew = ref(false);

function handleEnvAdd() {
  envIsNew.value = true;
  envEditKey.value = '';
  envEditValue.value = '';
  envEditOpen.value = true;
}
function handleEnvEdit(key: string, value: string) {
  envIsNew.value = false;
  envEditKey.value = key;
  envEditValue.value = value;
  envEditOpen.value = true;
}
async function handleEnvSave(key: string, value: string): Promise<boolean> {
  const result = await crudUpdate('env', { key, value });
  if (result.success) {
    await refresh();
    return true;
  }
  return false;
}
function handleEnvDelete(key: string) {
  crudDelete('env', { key });
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
        <img src="https://r2.soybeanjs.tech/soybeanjs/logo-ubean.svg" alt="ubean" class="size-10 op-fade" />
        <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
        <span class="text-sm op-fade">Loading DevTools...</span>
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
            <span class="op-fade">{{ error }}</span>
          </div>
        </div>
      </div>

      <!-- View content -->
      <template v-else-if="info">
        <!-- Refresh button (bottom-right, unobtrusive) -->
        <button
          class="fixed bottom-3 right-3 z-40 size-8 flex items-center justify-center rounded-full bg-secondary border border-base text-muted-foreground hover:text-foreground hover:border-active shadow-md transition-all cursor-pointer"
          title="Refresh (R)"
          @click="handleRefresh"
        >
          <SIcon
            icon="lucide:refresh-cw"
            :size="14"
            :class="{ 'animate-spin': refreshing }"
            class="transition-transform"
          />
        </button>

        <!-- Floating AI button (hidden on the dedicated AI panel to avoid duplication) -->
        <FloatingAiButton
          v-if="route !== 'ai'"
          :panel-context="currentPanelContext"
          :resource-summary="currentResourceSummary"
          :send-chat-stream="aiChatStream"
          :on-refresh="refresh"
          :ai-enabled="info.ai?.enabled"
        />

        <!-- Overview -->
        <div v-if="route === 'overview'" class="h-full overflow-y-auto">
          <Overview :info="info" :uptime="uptime" :fmt-uptime="fmtUptime" :fmt-time="fmtTime" :fmt-val="fmtVal" />
        </div>

        <!-- AI -->
        <AiAssistant
          v-else-if="route === 'ai'"
          class="h-full"
          :info="info"
          :send-chat-stream="aiChatStream"
          :on-refresh="refresh"
        />

        <!-- API (Routes + Playground, grouped) -->
        <div v-else-if="route === 'api'" class="h-full flex flex-col">
          <div class="flex gap-0.5 px-2.5 py-1.5 bg-background border-b border-base flex-shrink-0">
            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 op-fade hover:op100 hover:text-foreground hover:bg-active data-[active=true]:bg-active data-[active=true]:text-foreground data-[active=true]:op100!"
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
            @edit="handleApiRouteEdit"
            @delete="handleApiRouteDelete"
            @create="openCreateDialog('api')"
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

        <!-- Pages (Pages + Layouts, grouped) -->
        <div v-else-if="route === 'pages'" class="h-full flex flex-col">
          <div class="flex gap-0.5 px-2.5 py-1.5 bg-background border-b border-base flex-shrink-0">
            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 op-fade hover:op100 hover:text-foreground hover:bg-active data-[active=true]:bg-active data-[active=true]:text-foreground data-[active=true]:op100!"
              :data-active="pagesSubTab === 'pages'"
              @click="pagesSubTab = 'pages'"
            >
              <SIcon icon="lucide:file-text" :size="13" />
              Pages
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              :data-active="pagesSubTab === 'layouts'"
              @click="pagesSubTab = 'layouts'"
            >
              <SIcon icon="lucide:layout" :size="13" />
              Layouts
            </button>
          </div>
          <Pages
            v-show="pagesSubTab === 'pages'"
            class="flex-1 overflow-hidden"
            :pages="info.pagesList || []"
            :file-path="filePath"
            @edit="handlePageEdit"
            @edit-meta="handlePageMetaEdit"
            @delete="handlePageDelete"
            @create="openCreateDialog('page')"
          />
          <Layouts
            v-show="pagesSubTab === 'layouts'"
            class="flex-1 overflow-hidden"
            :layouts="info.layoutsList || []"
            :file-path="filePath"
            @edit="handleLayoutEdit"
            @delete="handleLayoutDelete"
            @create="openCreateDialog('layout')"
          />
        </div>

        <!-- Middleware -->
        <Middlewares
          v-else-if="route === 'middleware'"
          class="h-full"
          :middlewares="info.middlewaresList || []"
          :file-path="filePath"
          @edit="handleMiddlewareEdit"
          @delete="handleMiddlewareDelete"
          @create="openCreateDialog('middleware')"
        />

        <!-- Crons -->
        <Crons
          v-else-if="route === 'crons'"
          class="h-full"
          :crons="info.cronsList || []"
          :file-path="filePath"
          @edit="handleCronEdit"
          @delete="handleCronDelete"
          @create="openCreateDialog('cron')"
        />

        <!-- Env -->
        <EnvVars
          v-else-if="route === 'env'"
          class="h-full"
          :env="env"
          :on-add="handleEnvAdd"
          :on-edit="handleEnvEdit"
          :on-delete="handleEnvDelete"
        />

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
          @edit="handleConfigEdit"
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

        <!-- Terminal -->
        <Terminal
          v-else-if="route === 'terminal'"
          class="h-full"
          :cwd="rootDir"
          :terminal-start="terminalStart"
          :terminal-input="terminalInput"
          :terminal-resize="terminalResize"
          :terminal-poll="terminalPoll"
          :terminal-kill="terminalKill"
        />

        <!-- Fallback -->
        <div v-else class="flex items-center justify-center h-full text-muted-foreground text-sm op-fade">
          Unknown view: {{ route }}
        </div>
      </template>

      <CreateDialog
        :open="createDialogOpen"
        :initial-type="createDialogType"
        :on-create="crudCreate"
        @close="createDialogOpen = false"
      />

      <!-- Reusable file editor dialog (pages, API routes, layouts, middleware, crons, config) -->
      <EditDialog
        :open="editDialogOpen"
        :file-path="editFilePath"
        :resource-type="editResourceType"
        :title="editTitle"
        :language="editLanguage"
        :on-read="crudRead"
        :on-save="crudUpdate"
        @close="editDialogOpen = false"
        @saved="refresh"
      />

      <!-- Page properties (definePage macro) form dialog -->
      <PageMetaDialog
        :open="pageMetaOpen"
        :file-path="pageMetaFilePath"
        :page-path="pageMetaPagePath"
        :on-read="crudRead"
        :on-save="crudUpdate"
        @close="pageMetaOpen = false"
        @saved="refresh"
      />

      <!-- Env var add/edit dialog -->
      <EnvEditDialog
        :open="envEditOpen"
        :is-new="envIsNew"
        :initial-key="envEditKey"
        :initial-value="envEditValue"
        :on-save="handleEnvSave"
        @close="envEditOpen = false"
      />
    </div>
  </SConfigProvider>
</template>
