<script setup lang="ts">
import { ref, computed } from 'vue';
import { SConfigProvider, SIcon, SButtonIcon } from '@soybeanjs/ui';
import { useRpc } from './composables/useRpc';
import ApiRoutes from './views/ApiRoutes.vue';
import Crons from './views/Crons.vue';
import EnvVars from './views/EnvVars.vue';
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
  fileName,
  filePath,
  methodClass,
  refresh
} = useRpc();

const activeTab = ref('overview');
const showCreateMenu = ref(false);

const tabs = computed(() => {
  const list = [
    { id: 'overview', label: 'Overview', icon: 'lucide:layout-dashboard' },
    { id: 'routes', label: 'Routes', icon: 'lucide:send' },
    { id: 'pages', label: 'Pages', icon: 'lucide:file-text' },
    { id: 'middlewares', label: 'Middlewares', icon: 'lucide:layers' }
  ];
  if (info.value?.crons && info.value.crons > 0) {
    list.push({ id: 'crons', label: 'Cron Jobs', icon: 'lucide:clock' });
  }
  list.push({ id: 'env', label: 'Env', icon: 'lucide:terminal' });
  return list;
});

const createOptions = computed(() => [
  { type: 'page', label: 'Page', icon: 'lucide:file-text', shortcut: 'P' },
  { type: 'api', label: 'API Route', icon: 'lucide:send', shortcut: 'A' },
  { type: 'middleware', label: 'Middleware', icon: 'lucide:layers', shortcut: 'M' },
  { type: 'layout', label: 'Layout', icon: 'lucide:layout', shortcut: 'L' },
  { type: 'cron', label: 'Cron Job', icon: 'lucide:clock', shortcut: 'C' }
]);

function setActiveTab(id: string) {
  activeTab.value = id;
}

function toggleCreateMenu() {
  showCreateMenu.value = !showCreateMenu.value;
}
</script>

<template>
  <SConfigProvider :theme="{ theme: { primary: 'indigo' }, size: 'sm' }">
    <div class="devtools-root">
      <header class="devtools-header">
        <div class="devtools-header-left">
          <div class="devtools-logo">
            <SIcon icon="lucide:layers" :size="16" class="text-white" />
          </div>
          <span class="devtools-title">Ubean DevTools</span>
          <span v-if="info" class="version-badge">v{{ info.version }}</span>
          <span class="connected-badge">
            <span class="pulse-dot"></span>
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

      <div v-if="showCreateMenu" class="create-menu-popover" @click.self="showCreateMenu = false">
        <div class="create-menu">
          <div class="create-menu-title">Create New</div>
          <button v-for="opt in createOptions" :key="opt.type" class="create-menu-item" @click="showCreateMenu = false">
            <SIcon :icon="opt.icon" :size="14" />
            <span>{{ opt.label }}</span>
            <span class="create-menu-shortcut">{{ opt.shortcut }}</span>
          </button>
          <div class="create-menu-hint">CRUD UI coming soon (P6-12)</div>
        </div>
      </div>

      <div class="devtools-body">
        <nav class="tabs-list">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="tab-trigger"
            :data-active="activeTab === t.id"
            @click="setActiveTab(t.id)"
          >
            <SIcon :icon="t.icon" :size="13" />
            {{ t.label }}
          </button>
        </nav>

        <main class="tab-content-area">
          <div v-if="loading" class="loading-wrap">
            <div class="spinner"></div>
            <span class="loading-text">Loading DevTools...</span>
          </div>

          <div v-else-if="error" class="p-3.5">
            <div class="alert-error">
              <SIcon icon="lucide:alert-circle" :size="16" class="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Connection failed</strong>
                <br />
                {{ error }}
              </div>
            </div>
          </div>

          <template v-else-if="info">
            <Overview
              v-show="activeTab === 'overview'"
              :info="info"
              :uptime="uptime"
              :fmt-uptime="fmtUptime"
              :fmt-time="fmtTime"
              :fmt-val="fmtVal"
            />
            <ApiRoutes
              v-show="activeTab === 'routes'"
              :routes="info.routes || []"
              :file-name="fileName"
              :file-path="filePath"
              :method-class="methodClass"
            />
            <Pages
              v-show="activeTab === 'pages'"
              :pages="info.pagesList || []"
              :file-name="fileName"
              :file-path="filePath"
            />
            <Middlewares
              v-show="activeTab === 'middlewares'"
              :middlewares="info.middlewaresList || []"
              :file-name="fileName"
              :file-path="filePath"
            />
            <Crons
              v-show="activeTab === 'crons'"
              :crons="info.cronsList || []"
              :file-name="fileName"
              :file-path="filePath"
            />
            <EnvVars v-show="activeTab === 'env'" :env="env" />
          </template>
        </main>
      </div>
    </div>
  </SConfigProvider>
</template>
