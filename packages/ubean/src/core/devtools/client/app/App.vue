<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon, SButtonIcon } from '@soybeanjs/ui';
import { useRpc } from './composables/useRpc';
import Overview from './views/Overview.vue';
import ApiRoutes from './views/ApiRoutes.vue';
import Pages from './views/Pages.vue';
import Middlewares from './views/Middlewares.vue';
import Crons from './views/Crons.vue';
import EnvVars from './views/EnvVars.vue';

const { loading, error, info, env, uptime, close, fmtUptime, fmtTime, fmtVal, fileName, filePath, methodClass, refresh } = useRpc();

const activeTab = ref('overview');

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

function setActiveTab(id: string) {
  activeTab.value = id;
}
</script>

<template>
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
          icon="lucide:refresh-cw"
          size="sm"
          variant="ghost"
          color="secondary"
          class="close-btn"
          title="Refresh"
          @click="refresh"
        />
        <SButtonIcon
          icon="lucide:x"
          size="sm"
          variant="ghost"
          color="secondary"
          class="close-btn"
          @click="close"
        />
      </div>
    </header>

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
          <EnvVars
            v-show="activeTab === 'env'"
            :env="env"
          />
        </template>
      </main>
    </div>
  </div>
</template>















