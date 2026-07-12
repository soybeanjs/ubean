import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { dirname, resolve } from 'pathe';
import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH } from '../types';
import { createDevtoolsViteConfig } from './vite.config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_APP_DIR = resolve(__dirname, 'app');
const PROJECT_ROOT = resolve(__dirname, '../../../../../../');
const BUILT_HTML_PATH = resolve(PROJECT_ROOT, 'dist/devtools-client/index.html');

let cachedHtml: string | null = null;
let buildPromise: Promise<string> | null = null;

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

function getFallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ubean DevTools</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #0f0f12; color: #fafafa; font-family: system-ui, -apple-system, sans-serif; }
  #app { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
  .loading-spinner { width: 32px; height: 32px; border: 3px solid #222228; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { color: #6b6b78; font-size: 13px; }
</style>
</head>
<body>
<div id="app">
  <div class="loading-spinner"></div>
  <div class="loading-text">Building DevTools...</div>
</div>
<script>
  window.__UBEAN_DEVTOOLS_CONFIG__ = { rpcPath: ${JSON.stringify(DEVTOOLS_RPC_PATH)} };
</script>
</body>
</html>`;
}

async function buildDevtoolsClient(): Promise<string> {
  const outDir = resolve(PROJECT_ROOT, 'dist/devtools-client');
  mkdirSync(outDir, { recursive: true });

  try {
    await build({
      ...createDevtoolsViteConfig(CLIENT_APP_DIR),
      logLevel: 'warn'
    });

    if (existsSync(BUILT_HTML_PATH)) {
      return readFileSync(BUILT_HTML_PATH, 'utf-8');
    }
  } catch (err) {
    console.error('[ubean] DevTools client build failed:', err);
  }

  return getFallbackHtml();
}

export async function getDevtoolsIframeHtml(): Promise<string> {
  if (cachedHtml) {
    return cachedHtml.replace('__RPC_PATH_PLACEHOLDER__', DEVTOOLS_RPC_PATH);
  }

  if (existsSync(BUILT_HTML_PATH)) {
    try {
      cachedHtml = readFileSync(BUILT_HTML_PATH, 'utf-8');
      return cachedHtml.replace('__RPC_PATH_PLACEHOLDER__', DEVTOOLS_RPC_PATH);
    } catch {}
  }

  if (!buildPromise) {
    buildPromise = buildDevtoolsClient().then(html => {
      cachedHtml = html;
      buildPromise = null;
      return html;
    });
  }

  const html = await buildPromise;
  return html.replace('__RPC_PATH_PLACEHOLDER__', DEVTOOLS_RPC_PATH);
}
