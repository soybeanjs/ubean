import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH } from '../types';

export function getDevtoolsClientScript(): string {
  return `(function() {
  if (window.__ubeanDevtoolsInstalled) return;
  window.__ubeanDevtoolsInstalled = true;

  const RPC_PATH = ${JSON.stringify(DEVTOOLS_RPC_PATH)};
  const IFRAME_PATH = ${JSON.stringify(DEVTOOLS_IFRAME_PATH)};

  let isOpen = false;
  let panel = null;

  function createButton() {
    const btn = document.createElement('div');
    btn.id = '__ubean_devtools_btn';
    btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';
    btn.title = 'Ubean DevTools (Shift+D)';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '44px',
      height: '44px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
      zIndex: '2147483646',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      userSelect: 'none',
      border: 'none'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-2px) scale(1.02)';
      btn.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.55)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.4)';
    });
    return btn;
  }

  function createPanel() {
    const panelEl = document.createElement('div');
    panelEl.id = '__ubean_devtools_panel';
    Object.assign(panelEl.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '480px',
      height: '100vh',
      maxWidth: '100vw',
      zIndex: '2147483647',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f0f12',
      borderRadius: '14px 0 0 14px',
      overflow: 'hidden',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.25), -1px 0 0 rgba(255,255,255,0.05)'
    });

    const iframe = document.createElement('iframe');
    iframe.src = IFRAME_PATH;
    iframe.id = '__ubean_devtools_iframe';
    Object.assign(iframe.style, {
      flex: '1',
      border: 'none',
      width: '100%'
    });

    panelEl.appendChild(iframe);
    return panelEl;
  }

  function togglePanel() {
    isOpen = !isOpen;
    if (!panel) {
      panel = createPanel();
      document.body.appendChild(panel);
      requestAnimationFrame(() => {
        panel.style.transform = 'translateX(0)';
      });
    } else {
      panel.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === '__ubean_devtools_close') {
      if (isOpen) togglePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable) {
        e.preventDefault();
        togglePanel();
      }
    }
  });

  function init() {
    const btn = createButton();
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__ubeanDevtools = { toggle: togglePanel };
})();`;
}

export function getDevtoolsIframeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ubean DevTools</title>
<link rel="stylesheet" href="https://unpkg.com/@soybeanjs/ui@0.10.2/dist/styles.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #0f0f12; }
  #app { height: 100%; }
  .devtools-root { height: 100%; display: flex; flex-direction: column; }
  .devtools-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; background: #141418; border-bottom: 1px solid #222228; flex-shrink: 0;
  }
  .devtools-header-left { display: flex; align-items: center; gap: 10px; }
  .devtools-logo {
    width: 28px; height: 28px; border-radius: 8px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .devtools-logo svg { width: 16px; height: 16px; color: white; }
  .devtools-title { font-size: 13px; font-weight: 600; color: #fafafa; }
  .devtools-spacer { flex: 1; }
  .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
  .stat-card {
    display: flex; align-items: center; gap: 10px; padding: 14px;
    background: #16161b; border: 1px solid #222228; border-radius: 10px;
  }
  .stat-icon-wrap {
    width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .stat-icon-wrap svg { width: 18px; height: 18px; }
  .stat-icon-primary { background: rgba(99,102,241,0.1); color: #818cf8; }
  .stat-icon-success { background: rgba(34,197,94,0.12); color: #22c55e; }
  .stat-icon-warning { background: rgba(245,158,11,0.12); color: #f59e0b; }
  .stat-icon-info { background: rgba(59,130,246,0.12); color: #3b82f6; }
  .stat-value { font-size: 22px; font-weight: 700; color: #fafafa; line-height: 1.1; }
  .stat-label { font-size: 10px; color: #6b6b78; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; font-weight: 500; }
  .section-card { background: #16161b; border: 1px solid #222228; border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
  .section-header { padding: 12px 14px; border-bottom: 1px solid #222228; display: flex; align-items: center; gap: 8px; }
  .section-header svg { width: 13px; height: 13px; color: #818cf8; }
  .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #6b6b78; }
  .section-body { padding: 4px 0; }
  .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; border-bottom: 1px solid #1e1e24; font-size: 12px; }
  .info-row:last-child { border-bottom: none; }
  .info-key { color: #6b6b78; }
  .info-val { color: #d4d4d8; font-weight: 500; font-family: 'SF Mono', Monaco, monospace; font-size: 11px; }
  .list-wrap { display: flex; flex-direction: column; gap: 3px; }
  .list-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px;
    background: #16161b; border: 1px solid #1e1e24; border-radius: 8px; font-size: 12px;
  }
  .method-badge {
    min-width: 46px; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.3px; text-align: center; font-family: 'SF Mono', Monaco, monospace;
  }
  .method-get { background: rgba(34,197,94,0.12); color: #22c55e; }
  .method-post { background: rgba(59,130,246,0.12); color: #3b82f6; }
  .method-put { background: rgba(245,158,11,0.12); color: #f59e0b; }
  .method-delete { background: rgba(239,68,68,0.12); color: #ef4444; }
  .method-patch { background: rgba(139,92,246,0.12); color: #a78bfa; }
  .method-all { background: #1e1e24; color: #6b6b78; }
  .route-path { font-family: 'SF Mono', Monaco, monospace; color: #d4d4d8; flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .page-path { font-family: 'SF Mono', Monaco, monospace; color: #818cf8; flex: 1; }
  .file-name { color: #6b6b78; font-size: 11px; font-family: 'SF Mono', Monaco, monospace; }
  .list-icon { width: 14px; height: 14px; flex-shrink: 0; color: #818cf8; }
  .list-icon.warn { color: #f59e0b; }
  .loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; gap: 14px; color: #6b6b78; }
  .spinner-el { width: 28px; height: 28px; border: 2.5px solid #222228; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty-state { text-align: center; padding: 48px 20px; color: #6b6b78; }
  .empty-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.4; }
  .empty-title { font-size: 13px; font-weight: 500; color: #d4d4d8; margin-bottom: 4px; }
  .empty-desc { font-size: 12px; color: #6b6b78; line-height: 1.5; }
  .global-badge { font-size: 10px; padding: 2px 7px; background: rgba(245,158,11,0.12); color: #f59e0b; border-radius: 6px; font-weight: 600; }
  .alert-box { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 12px; line-height: 1.5; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.15); }
  .alert-icon { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; }
  .tab-content { padding: 14px; }
  /* Override @soybeanjs/ui styles for dark theme consistency */
  .s-tabs-list { background: #141418 !important; padding: 6px 10px !important; border-radius: 0 !important; border-bottom: 1px solid #1e1e24 !important; }
  .s-tabs-trigger { font-size: 12px !important; padding: 7px 13px !important; border-radius: 6px !important; }
  .s-badge { font-weight: 600 !important; }
  .s-button--icon-sm { width: 30px !important; height: 30px !important; }
  .s-scroll-area { height: 0; flex: 1; }
  /* Ensure lucide icons have stroke width */
  svg[class*="s-icon"], svg[data-lucide] { stroke-width: 2; }
</style>
</head>
<body>
<div id="app"></div>
<script type="importmap">
{
  "imports": {
    "vue": "https://esm.sh/vue@3.5.13/dist/vue.esm-browser.prod.js"
  }
}
</script>
<script type="module">
import { createApp, ref, h, onMounted, onUnmounted } from 'vue';

const RPC_PATH = ${JSON.stringify(DEVTOOLS_RPC_PATH)};

async function rpc(method, params) {
  const res = await fetch(RPC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: String(Date.now() + Math.random()), method, params })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const fmtUptime = ms => {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0 ? h + 'h ' + (m % 60) + 'm' : m > 0 ? m + 'm ' + (s % 60) + 's' : s + 's';
};
const fmtTime = ts => new Date(ts).toLocaleTimeString();
const fmtVal = v => typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'object' ? JSON.stringify(v) : String(v);
const fileName = p => p.split('/').pop() || p;
const methodCls = m => ({ GET: 'method-get', POST: 'method-post', PUT: 'method-put', DELETE: 'method-delete', PATCH: 'method-patch' }[m] || 'method-all');

const LucideIcon = {
  props: ['name', 'size'],
  template: '<svg :width="size || 16" :height="size || 16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="path"></svg>',
  computed: {
    path() {
      const icons = {
        x: '<path d="M18 6L6 18M6 6l12 12"/>',
        'layout-dashboard': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
        route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
        'file-text': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
        clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
        activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
        logo: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
      };
      return icons[this.name] || '';
    }
  }
};

const SBadge = {
  props: ['variant', 'theme', 'size', 'dot'],
  template: \`<span :class="cls"><slot /></span>\`,
  computed: {
    cls() {
      const themeMap = {
        primary: { soft: 'background:rgba(99,102,241,0.1);color:#818cf8;' },
        success: { soft: 'background:rgba(34,197,94,0.12);color:#22c55e;' },
        warning: { soft: 'background:rgba(245,158,11,0.12);color:#f59e0b;' },
        danger: { soft: 'background:rgba(239,68,68,0.12);color:#ef4444;' },
        info: { soft: 'background:rgba(59,130,246,0.12);color:#3b82f6;' },
        secondary: { soft: 'background:#1e1e24;color:#6b6b78;' }
      };
      let style = 'display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;line-height:1.5;white-space:nowrap;';
      const t = themeMap[this.theme] || themeMap.primary;
      const v = t[this.variant] || t.soft;
      if (this.dot) style += 'position:relative;padding-left:14px;';
      return '';
    }
  }
};

const SButton = {
  props: ['variant', 'size'],
  emits: ['click'],
  template: \`<button :class="cls" @click="$emit('click')"><slot /></button>\`,
  computed: {
    cls() {
      const base = 'display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:6px;color:#6b6b78;cursor:pointer;transition:all 0.15s ease;padding:0;';
      const sz = this.size === 'icon-sm' ? 'width:30px;height:30px;' : '';
      return '';
    }
  }
};

const App = {
  components: { LucideIcon },
  setup() {
    const loading = ref(true);
    const error = ref(null);
    const info = ref(null);
    const activeTab = ref('overview');
    const uptime = ref(0);
    let interval = null;

    const tabs = [
      { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { id: 'routes', label: 'Routes', icon: 'route' },
      { id: 'pages', label: 'Pages', icon: 'file-text' },
      { id: 'middleware', label: 'Middleware', icon: 'layers' }
    ];

    const statCards = computed(() => {
      if (!info.value) return [];
      return [
        { val: info.value.pages || 0, label: 'Pages', icon: 'file-text', cls: 'stat-icon-primary' },
        { val: info.value.apiRoutes || 0, label: 'API Routes', icon: 'send', cls: 'stat-icon-info' },
        { val: info.value.middleware || 0, label: 'Middleware', icon: 'layers', cls: 'stat-icon-warning' },
        { val: fmtUptime(uptime.value), label: 'Uptime', icon: 'clock', cls: 'stat-icon-success' }
      ];
    });

    async function loadInfo() {
      try {
        const data = await rpc('getInfo');
        info.value = data;
        uptime.value = Date.now() - data.startTime;
        error.value = null;
      } catch (e) {
        error.value = e.message || 'Failed to connect';
      } finally {
        loading.value = false;
      }
    }

    function close() {
      window.parent.postMessage({ type: '__ubean_devtools_close' }, '*');
    }

    onMounted(() => {
      loadInfo();
      interval = setInterval(() => {
        if (info.value) uptime.value = Date.now() - info.value.startTime;
        loadInfo();
      }, 3000);
    });

    onUnmounted(() => clearInterval(interval));

    return { loading, error, info, activeTab, tabs, statCards, fmtUptime, fmtTime, fmtVal, fileName, methodCls, close };
  },
  template: \`
  <div class="devtools-root">
    <div class="devtools-header">
      <div class="devtools-header-left">
        <div class="devtools-logo">
          <LucideIcon name="logo" :size="16" />
        </div>
        <span class="devtools-title">Ubean DevTools</span>
        <span v-if="info" style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;background:rgba(99,102,241,0.1);color:#818cf8;">v{{ info.version }}</span>
        <span style="display:inline-flex;align-items:center;padding:2px 8px 2px 14px;border-radius:999px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.12);color:#22c55e;position:relative;">
          <span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite;"></span>
          Connected
        </span>
      </div>
      <button @click="close" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:6px;color:#6b6b78;cursor:pointer;" onmouseover="this.style.background='#1e1e24';this.style.color='#fafafa'" onmouseout="this.style.background='transparent';this.style.color='#6b6b78'">
        <LucideIcon name="x" :size="16" />
      </button>
    </div>

    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
      <div style="display:flex;gap:2px;padding:6px 10px;background:#141418;border-bottom:1px solid #1e1e24;flex-shrink:0;overflow-x:auto;">
        <button v-for="t in tabs" :key="t.id" @click="activeTab = t.id"
          :style="{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 13px',
            background: activeTab === t.id ? 'rgba(99,102,241,0.1)' : 'transparent',
            border: 'none', borderRadius: '6px', color: activeTab === t.id ? '#818cf8' : '#6b6b78',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.15s'
          }"
          onmouseover="if(!this.classList.contains('active')) this.style.color='#d4d4d8'"
          onmouseout="if(!this.classList.contains('active')) this.style.color='#6b6b78'"
          :class="{ active: activeTab === t.id }">
          <LucideIcon :name="t.icon" :size="13" />{{ t.label }}
        </button>
      </div>

      <div style="flex:1;overflow-y:auto;" id="scroll-area">
        <style>
          #scroll-area::-webkit-scrollbar { width: 5px; }
          #scroll-area::-webkit-scrollbar-track { background: transparent; }
          #scroll-area::-webkit-scrollbar-thumb { background: #222228; border-radius: 3px; }
        </style>

        <div v-if="loading" class="loading-wrap">
          <div class="spinner-el"></div>
          <span style="font-size:13px;">Loading DevTools...</span>
        </div>

        <div v-else-if="error" class="tab-content">
          <div class="alert-box">
            <LucideIcon name="alert-circle" :size="16" class="alert-icon" />
            <div><strong>Connection failed</strong><br>{{ error }}</div>
          </div>
        </div>

        <template v-else-if="info">
          <div v-show="activeTab === 'overview'" class="tab-content">
            <div class="stat-grid">
              <div v-for="(s, i) in statCards" :key="i" class="stat-card">
                <div :class="['stat-icon-wrap', s.cls]">
                  <LucideIcon :name="s.icon" :size="18" />
                </div>
                <div>
                  <div class="stat-value">{{ s.val }}</div>
                  <div class="stat-label">{{ s.label }}</div>
                </div>
              </div>
            </div>

            <div class="section-card">
              <div class="section-header">
                <LucideIcon name="activity" :size="13" />
                <span class="section-title">Server Status</span>
              </div>
              <div class="section-body">
                <div class="info-row"><span class="info-key">Status</span><span class="info-val">
                  <span style="display:inline-flex;align-items:center;padding:1px 8px 1px 13px;border-radius:999px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.12);color:#22c55e;position:relative;">
                    <span style="position:absolute;left:5px;top:50%;transform:translateY(-50%);width:5px;height:5px;border-radius:50%;background:#22c55e;"></span>
                    Running
                  </span>
                </span></div>
                <div class="info-row"><span class="info-key">Version</span><span class="info-val">{{ info.version }}</span></div>
                <div class="info-row"><span class="info-key">Start Time</span><span class="info-val">{{ fmtTime(info.startTime) }}</span></div>
              </div>
            </div>

            <div v-if="info.config && Object.keys(info.config).length > 0" class="section-card">
              <div class="section-header">
                <LucideIcon name="settings" :size="13" />
                <span class="section-title">Configuration</span>
              </div>
              <div class="section-body">
                <div v-for="(v, k) in info.config" :key="k" class="info-row">
                  <span class="info-key" style="font-family:monospace;">{{ k }}</span>
                  <span class="info-val">{{ fmtVal(v) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'routes'" class="tab-content">
            <div v-if="info.routes && info.routes.length > 0" class="list-wrap">
              <div v-for="(r, i) in info.routes" :key="i" class="list-item">
                <span class="method-badge" :class="methodCls(r.method)">{{ r.method }}</span>
                <span class="route-path">{{ r.path }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon">🛣️</div>
              <div class="empty-title">No routes registered</div>
              <div class="empty-desc">API routes will appear here as you add endpoints</div>
            </div>
          </div>

          <div v-show="activeTab === 'pages'" class="tab-content">
            <div v-if="info.pagesList && info.pagesList.length > 0" class="list-wrap">
              <div v-for="(p, i) in info.pagesList" :key="i" class="list-item">
                <LucideIcon name="file-text" :size="14" class="list-icon" />
                <span class="page-path">{{ p.path }}</span>
                <span v-if="p.filePath" class="file-name">{{ fileName(p.filePath) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon">📄</div>
              <div class="empty-title">No pages found</div>
              <div class="empty-desc">Add .vue files in your pages directory</div>
            </div>
          </div>

          <div v-show="activeTab === 'middleware'" class="tab-content">
            <div v-if="info.middlewaresList && info.middlewaresList.length > 0" class="list-wrap">
              <div v-for="(mw, i) in info.middlewaresList" :key="i" class="list-item">
                <LucideIcon name="layers" :size="14" class="list-icon warn" />
                <span class="route-path">{{ mw.path }}</span>
                <span v-if="mw.global" class="global-badge">GLOBAL</span>
                <span v-if="mw.filePath" class="file-name">{{ fileName(mw.filePath) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon">⚡</div>
              <div class="empty-title">No middleware registered</div>
              <div class="empty-desc">Add middleware files to intercept requests</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
  \`
};

createApp(App).mount('#app');
</script>
</body>
</html>`;
}
