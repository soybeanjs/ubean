import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH } from '../types';

export function getDevtoolsClientScript(): string {
  return `(function() {
  if (window.__ubeanDevtoolsInstalled) return;
  window.__ubeanDevtoolsInstalled = true;

  const RPC_PATH = ${JSON.stringify(DEVTOOLS_RPC_PATH)};
  const IFRAME_PATH = ${JSON.stringify(DEVTOOLS_IFRAME_PATH)};

  let isOpen = false;
  let reqId = 0;

  function rpc(method, params) {
    const id = String(++reqId);
    return fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, method, params })
    }).then(r => r.json()).then(res => {
      if (res.error) throw new Error(res.error);
      return res.result;
    });
  }

  function createButton() {
    const btn = document.createElement('div');
    btn.id = '__ubean_devtools_btn';
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m4.22-13.22l4.24 4.24M1.54 18.36l4.24-4.24M20.46 18.36l-4.24-4.24M1.54 5.64l4.24 4.24"/></svg>';
    btn.title = 'Ubean DevTools';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
      zIndex: '99998',
      transition: 'transform 0.2s, box-shadow 0.2s',
      userSelect: 'none'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });
    return btn;
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = '__ubean_devtools_panel';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '500px',
      height: '100vh',
      background: '#1a1a2e',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
      zIndex: '99999',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease',
      display: 'flex',
      flexDirection: 'column'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '12px 16px',
      background: '#16213e',
      borderBottom: '1px solid #0f3460',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      fontWeight: '600'
    });
    header.innerHTML = '<span>🚀 Ubean DevTools</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: '#888',
      fontSize: '18px',
      cursor: 'pointer',
      padding: '4px 8px'
    });
    closeBtn.addEventListener('click', togglePanel);
    header.appendChild(closeBtn);

    const iframe = document.createElement('iframe');
    iframe.src = IFRAME_PATH;
    Object.assign(iframe.style, {
      flex: '1',
      border: 'none',
      width: '100%'
    });

    panel.appendChild(header);
    panel.appendChild(iframe);
    return panel;
  }

  let panel = null;

  function togglePanel() {
    isOpen = !isOpen;
    if (!panel) {
      panel = createPanel();
      document.body.appendChild(panel);
    }
    panel.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
  }

  function init() {
    const btn = createButton();
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    rpc('ping').then(res => {
      console.log('%c🚀 Ubean DevTools', 'color: #667eea; font-weight: bold; font-size: 12px;', 'connected');
    }).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__ubeanDevtools = { rpc, toggle: togglePanel };
})();`;
}

export function getDevtoolsIframeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ubean DevTools</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    font-size: 13px;
  }
  .container { padding: 16px; }
  .header-section {
    margin-bottom: 20px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .version {
    font-size: 11px;
    background: #0f3460;
    padding: 2px 8px;
    border-radius: 10px;
    color: #667eea;
  }
  .card {
    background: #16213e;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .card-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    margin-bottom: 8px;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .stat {
    background: #0f3460;
    padding: 10px;
    border-radius: 6px;
    text-align: center;
  }
  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: #667eea;
  }
  .stat-label {
    font-size: 10px;
    color: #888;
    margin-top: 2px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #0f3460;
  }
  .info-row:last-child { border-bottom: none; }
  .info-key { color: #888; }
  .info-value { color: #e0e0e0; }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ade80;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .loading {
    text-align: center;
    padding: 40px;
    color: #666;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header-section">
    <div class="title">
      <span class="status-dot"></span>
      Ubean DevTools <span class="version" id="version">v0.0.1</span>
    </div>
  </div>
  <div id="content">
    <div class="loading">Loading...</div>
  </div>
</div>
<script>
const RPC_PATH = ${JSON.stringify(DEVTOOLS_RPC_PATH)};
function rpc(method, params) {
  return fetch(RPC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: String(Date.now()), method, params })
  }).then(r => r.json()).then(res => {
    if (res.error) throw new Error(res.error);
    return res.result;
  });
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

async function loadInfo() {
  try {
    const info = await rpc('getInfo');
    const uptime = Date.now() - info.startTime;
    document.getElementById('version').textContent = 'v' + info.version;
    document.getElementById('content').innerHTML = \`
      <div class="card">
        <div class="card-title">Server Stats</div>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-value">\${info.pages || 0}</div>
            <div class="stat-label">Pages</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${info.apiRoutes || 0}</div>
            <div class="stat-label">API Routes</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${info.middleware || 0}</div>
            <div class="stat-label">Middleware</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${formatUptime(uptime)}</div>
            <div class="stat-label">Uptime</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Overview</div>
        <div class="info-row">
          <span class="info-key">Status</span>
          <span class="info-value"><span class="status-dot"></span>Running</span>
        </div>
        <div class="info-row">
          <span class="info-key">Version</span>
          <span class="info-value">\${info.version}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Coming Soon</div>
        <div style="color: #666; font-size: 12px; line-height: 1.8;">
          • Pages/API Routes explorer<br>
          • Configuration editor<br>
          • Environment variables<br>
          • Layouts & Middleware<br>
          • Cron jobs & Hooks<br>
          • API Playground<br>
          • CRUD operations
        </div>
      </div>
    \`;
  } catch (e) {
    document.getElementById('content').innerHTML = '<div class="card"><div style="color: #f87171;">Failed to connect: ' + e.message + '</div></div>';
  }
}
loadInfo();
setInterval(loadInfo, 5000);
</script>
</body>
</html>`;
}
