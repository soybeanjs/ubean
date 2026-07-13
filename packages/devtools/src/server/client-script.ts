import { DEVTOOLS_RPC_PATH, DEVTOOLS_CLIENT_PATH } from '../types';

export function getDevtoolsClientScript(): string {
  return `(function() {
  if (window.__ubeanDevtoolsInstalled) return;
  window.__ubeanDevtoolsInstalled = true;

  const RPC_PATH = ${JSON.stringify(DEVTOOLS_RPC_PATH)};
  const IFRAME_PATH = ${JSON.stringify(DEVTOOLS_CLIENT_PATH)};

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
