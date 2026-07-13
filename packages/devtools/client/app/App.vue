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
  close,
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

const activeTab = ref('overview');
const showCreateMenu = ref(false);
const playgroundMethod = ref('GET');
const playgroundPath = ref('/api/');
const createDialogOpen = ref(false);
const createDialogType = ref<CrudResourceType>('page');

const tabs = computed(() => {
  const list = [
    { id: 'overview', label: 'Overview', icon: 'lucide:layout-dashboard' },
    { id: 'ai', label: 'AI', icon: 'lucide:sparkles' },
    { id: 'routes', label: 'Routes', icon: 'lucide:send' },
    { id: 'playground', label: 'Playground', icon: 'lucide:play' },
    { id: 'pages', label: 'Pages', icon: 'lucide:file-text' },
    { id: 'middlewares', label: 'Middlewares', icon: 'lucide:layers' }
  ];
  if (info.value?.layouts && info.value.layouts > 0) {
    list.push({ id: 'layouts', label: 'Layouts', icon: 'lucide:layout' });
  }
  if (info.value?.crons && info.value.crons > 0) {
    list.push({ id: 'crons', label: 'Cron Jobs', icon: 'lucide:clock' });
  }
  list.push({ id: 'env', label: 'Env', icon: 'lucide:terminal' });
  list.push({ id: 'config', label: 'Config', icon: 'lucide:settings' });
  if (info.value?.openAPI) {
    list.push({ id: 'api-docs', label: 'API Docs', icon: 'lucide:book-open' });
  }
  if (info.value?.database) {
    list.push({ id: 'drizzle', label: 'Database', icon: 'lucide:database' });
  }
  if (info.value?.customTabs && info.value.customTabs.length > 0) {
    for (const tab of info.value.customTabs) {
      list.push({ id: `custom:${tab.id}`, label: tab.label, icon: tab.icon || 'lucide:plugin' });
    }
  }
  return list;
});

const createOptions = computed(() => [
  { type: 'page' as const, label: 'Page', icon: 'lucide:file-text', shortcut: 'P' },
  { type: 'api' as const, label: 'API Route', icon: 'lucide:send', shortcut: 'A' },
  { type: 'middleware' as const, label: 'Middleware', icon: 'lucide:layers', shortcut: 'M' },
  { type: 'layout' as const, label: 'Layout', icon: 'lucide:layout', shortcut: 'L' },
  { type: 'cron' as const, label: 'Cron Job', icon: 'lucide:clock', shortcut: 'C' }
]);

const shortcutMap: Record<string, CrudResourceType> = {
  P: 'page',
  A: 'api',
  M: 'middleware',
  L: 'layout',
  C: 'cron'
};

function setActiveTab(id: string) {
  activeTab.value = id;
}

function toggleCreateMenu() {
  showCreateMenu.value = !showCreateMenu.value;
}

function openCreateDialog(type: CrudResourceType) {
  createDialogType.value = type;
  createDialogOpen.value = true;
  showCreateMenu.value = false;
}

function tryRoute(route: { method: string; path: string }) {
  playgroundMethod.value = route.method;
  playgroundPath.value = route.path;
  activeTab.value = 'playground';
}

function handlePageDelete(page: { path: string }) {
  crudDelete('page', { path: page.path });
}

function handleApiRouteDelete(route: { filePath?: string; path: string; method: string }) {
  if (route.filePath) {
    crudDelete('api', { path: route.filePath });
  }
}

function handleMiddlewareDelete(mw: { path: string }) {
  crudDelete('middleware', { path: mw.path });
}

function handleLayoutDelete(layout: { path: string }) {
  crudDelete('layout', { path: layout.path });
}

function handleCronDelete(cron: { filePath?: string; name: string }) {
  if (cron.filePath) {
    crudDelete('cron', { path: cron.filePath });
  }
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
  if (shortcutMap[key]) {
    openCreateDialog(shortcutMap[key]);
  }
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
      <header class="flex items-center justify-between px-3.5 py-2.5 bg-card border-b border-border flex-shrink-0">
        <div class="flex items-center gap-2.5">
          <div
            class="size-7 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0"
          >
            <SIcon icon="lucide:layers" :size="16" class="text-white" />
          </div>
          <span class="text-sm font-semibold">Ubean DevTools</span>
          <span
            v-if="info"
            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary"
          >
            v{{ info.version }}
          </span>
          <span
            class="inline-flex items-center pl-3.5 pr-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/12 text-success relative"
          >
            <span
              class="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-success animate-pulse"
            ></span>
            Connected
          </span>
        </div>
        <div class="flex items-center gap-1">
          <SButtonIcon
            icon="lucide:plus"
            size="sm"
            variant="ghost"
            color="secondary"
            class="close-btn"
            title="New..."
            @click="toggleCreateMenu"
          />
          <SButtonIcon
            icon="lucide:refresh-cw"
            size="sm"
            variant="ghost"
            color="secondary"
            class="close-btn"
            title="Refresh"
            @click="refresh"
          />
          <SButtonIcon icon="lucide:x" size="sm" variant="ghost" color="secondary" class="close-btn" @click="close" />
        </div>
      </header>

      <div
        v-if="showCreateMenu"
        class="absolute top-full left-0 right-0 z-40 flex justify-end pt-1 pr-2"
        @click.self="showCreateMenu = false"
      >
        <div class="bg-popover border border-border rounded-lg shadow-xl py-1 min-w-48 animate-fade-in">
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
            <span class="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              {{ opt.shortcut }}
            </span>
          </button>
        </div>
      </div>

      <div class="flex flex-col flex-1 overflow-hidden">
        <nav class="flex gap-0.5 px-2.5 py-1.5 bg-card border-b border-border flex-shrink-0 overflow-x-auto">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-md text-muted-foreground text-xs font-medium cursor-pointer whitespace-nowrap transition-all duration-150 hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
            :data-active="activeTab === t.id"
            @click="setActiveTab(t.id)"
          >
            <SIcon :icon="t.icon" :size="13" />
            {{ t.label }}
          </button>
        </nav>

        <main
          class="flex-1 overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-sm"
        >
          <div
            v-if="loading"
            class="flex flex-col items-center justify-center h-full py-20 px-5 gap-3.5 text-muted-foreground"
          >
            <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
            <span class="text-sm">Loading DevTools...</span>
          </div>

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

          <template v-else-if="info">
            <div v-show="activeTab === 'overview'" class="h-full overflow-y-auto">
              <Overview :info="info" :uptime="uptime" :fmt-uptime="fmtUptime" :fmt-time="fmtTime" :fmt-val="fmtVal" />
            </div>
            <div v-show="activeTab === 'ai'" class="h-full">
              <AiAssistant :info="info" :send-chat="aiChat" :on-refresh="refresh" />
            </div>
            <ApiRoutes
              v-show="activeTab === 'routes'"
              class="h-full"
              :routes="info.routes || []"
              :file-path="filePath"
              :method-class="methodClass"
              @try-route="tryRoute"
              @delete="handleApiRouteDelete"
            />
            <ApiPlayground
              v-show="activeTab === 'playground'"
              class="h-full"
              :routes="info.routes || []"
              :method-class="methodClass"
              :initial-method="playgroundMethod"
              :initial-path="playgroundPath"
            />
            <Pages
              v-show="activeTab === 'pages'"
              class="h-full"
              :pages="info.pagesList || []"
              :file-path="filePath"
              @delete="handlePageDelete"
            />
            <Middlewares
              v-show="activeTab === 'middlewares'"
              class="h-full"
              :middlewares="info.middlewaresList || []"
              :file-path="filePath"
              @delete="handleMiddlewareDelete"
            />
            <Layouts
              v-show="activeTab === 'layouts'"
              class="h-full"
              :layouts="info.layoutsList || []"
              :file-path="filePath"
              @delete="handleLayoutDelete"
            />
            <Crons
              v-show="activeTab === 'crons'"
              class="h-full"
              :crons="info.cronsList || []"
              :file-path="filePath"
              @delete="handleCronDelete"
            />
            <EnvVars v-show="activeTab === 'env'" class="h-full" :env="env" />
            <Config
              v-show="activeTab === 'config'"
              class="h-full"
              :config="info.config || {}"
              :info="info"
              :fmt-uptime="fmtUptime"
              :fmt-time="fmtTime"
              :fmt-val="fmtVal"
              :uptime="uptime"
            />
            <ApiDocs
              v-show="activeTab === 'api-docs'"
              class="h-full"
              :enabled="info.openAPI?.enabled"
              :scalar-path="info.openAPI?.scalarPath"
            />
            <DrizzleStudio
              v-show="activeTab === 'drizzle'"
              class="h-full"
              :available="info.database?.drizzleStudioAvailable"
              :studio-url="info.database?.studioUrl"
            />
            <template v-for="ct in info.customTabs || []" :key="ct.id">
              <div v-show="activeTab === `custom:${ct.id}`" class="h-full">
                <iframe
                  :src="ct.src"
                  class="w-full h-full border-0"
                  :sandbox="ct.sandbox?.join(' ') || 'allow-scripts allow-same-origin allow-forms'"
                />
              </div>
            </template>
          </template>
        </main>
      </div>

      <CreateDialog
        :open="createDialogOpen"
        :initial-type="createDialogType"
        :on-create="crudCreate"
        @close="createDialogOpen = false"
      />
    </div>
  </SConfigProvider>
</template>
