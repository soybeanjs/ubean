<script setup lang="ts">
import { ref, computed } from 'vue';
import { SIcon, SButtonIcon } from '@soybeanjs/ui';
import { useRpc } from './composables/useRpc';

const { loading, error, info, uptime, close, fmtUptime, fmtTime, fmtVal, fileName } = useRpc();

const activeTab = ref('overview');

const tabs = [
  { id: 'overview', label: 'Overview', icon: 'lucide:layout-dashboard' },
  { id: 'routes', label: 'Routes', icon: 'lucide:route' },
  { id: 'pages', label: 'Pages', icon: 'lucide:file-text' },
  { id: 'middleware', label: 'Middleware', icon: 'lucide:layers' }
];

const statCards = computed(() => {
  if (!info.value) return [];
  return [
    { val: info.value.pages || 0, label: 'Pages', icon: 'lucide:file-text', color: 'primary' },
    { val: info.value.apiRoutes || 0, label: 'API Routes', icon: 'lucide:send', color: 'info' },
    { val: info.value.middleware || 0, label: 'Middleware', icon: 'lucide:layers', color: 'warning' },
    { val: fmtUptime(uptime.value), label: 'Uptime', icon: 'lucide:clock', color: 'success' }
  ];
});

const iconBgMap: Record<string, string> = {
  primary: 'bg-primary/10 text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  info: 'bg-info/12 text-info',
  danger: 'bg-destructive/12 text-destructive'
};

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
      <SButtonIcon icon="lucide:x" size="sm" variant="ghost" color="secondary" class="close-btn" @click="close" />
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

        <div v-else-if="error" class="tab-content">
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
          <div v-show="activeTab === 'overview'" class="tab-content">
            <div class="stat-grid">
              <div v-for="(s, i) in statCards" :key="i" class="stat-card">
                <div class="stat-icon-wrap" :class="[iconBgMap[s.color]]">
                  <SIcon :icon="s.icon" :size="18" />
                </div>
                <div>
                  <div class="stat-value">{{ s.val }}</div>
                  <div class="stat-label">{{ s.label }}</div>
                </div>
              </div>
            </div>

            <div class="section-card">
              <div class="section-header">
                <SIcon icon="lucide:activity" :size="13" class="text-accent" />
                <span class="section-title">Server Status</span>
              </div>
              <div class="section-body">
                <div class="info-row">
                  <span class="info-key">Status</span>
                  <span class="running-badge">
                    <span class="status-dot"></span>
                    Running
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-key">Version</span>
                  <span class="info-val">{{ info.version }}</span>
                </div>
                <div class="info-row">
                  <span class="info-key">Start Time</span>
                  <span class="info-val">{{ fmtTime(info.startTime) }}</span>
                </div>
              </div>
            </div>

            <div v-if="info.config && Object.keys(info.config).length > 0" class="section-card">
              <div class="section-header">
                <SIcon icon="lucide:settings" :size="13" class="text-accent" />
                <span class="section-title">Configuration</span>
              </div>
              <div class="section-body">
                <div v-for="(v, k) in info.config" :key="k" class="info-row">
                  <span class="info-key info-mono">{{ k }}</span>
                  <span class="info-val">{{ fmtVal(v) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'routes'" class="tab-content">
            <div v-if="info.routes && info.routes.length > 0" class="list-wrap">
              <div v-for="(r, i) in info.routes" :key="i" class="list-item">
                <span class="method-badge" :class="'method-' + r.method.toLowerCase()">
                  {{ r.method }}
                </span>
                <span class="route-path">{{ r.path }}</span>
                <span v-if="r.filePath" class="file-name">{{ fileName(r.filePath) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <SIcon icon="lucide:route" :size="32" class="text-muted-foreground/40 mb-3" />
              <div class="empty-title">No routes registered</div>
              <div class="empty-desc">API routes will appear here as you add endpoints</div>
            </div>
          </div>

          <div v-show="activeTab === 'pages'" class="tab-content">
            <div v-if="info.pagesList && info.pagesList.length > 0" class="list-wrap">
              <div v-for="(p, i) in info.pagesList" :key="i" class="list-item">
                <SIcon icon="lucide:file-text" :size="14" class="text-accent flex-shrink-0" />
                <span class="page-path">{{ p.path }}</span>
                <span v-if="p.filePath" class="file-name">{{ fileName(p.filePath) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <SIcon icon="lucide:file-text" :size="32" class="text-muted-foreground/40 mb-3" />
              <div class="empty-title">No pages found</div>
              <div class="empty-desc">Add .vue files in your pages directory</div>
            </div>
          </div>

          <div v-show="activeTab === 'middleware'" class="tab-content">
            <div v-if="info.middlewaresList && info.middlewaresList.length > 0" class="list-wrap">
              <div v-for="(mw, i) in info.middlewaresList" :key="i" class="list-item">
                <SIcon icon="lucide:layers" :size="14" class="text-warning flex-shrink-0" />
                <span class="route-path">{{ mw.path }}</span>
                <span v-if="mw.global" class="global-badge">GLOBAL</span>
                <span v-if="mw.filePath" class="file-name">{{ fileName(mw.filePath) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <SIcon icon="lucide:layers" :size="32" class="text-muted-foreground/40 mb-3" />
              <div class="empty-title">No middleware registered</div>
              <div class="empty-desc">Add middleware files to intercept requests</div>
            </div>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>
