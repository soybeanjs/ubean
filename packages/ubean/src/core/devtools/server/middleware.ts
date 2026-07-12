import type { Context, Next } from 'hono';
import { getDevtoolsClientScript, getDevtoolsIframeHtml } from '../client';
import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH, DEVTOOLS_MAGIC_KEY } from '../types';
import { createRpcServer } from './rpc';
import type { DevToolsRpcServer } from './rpc';

export interface DevToolsMiddlewareOptions {
  enabled?: boolean;
}

function isHtmlResponse(c: Context): boolean {
  const contentType = c.res.headers.get('content-type') || '';
  return contentType.includes('text/html');
}

function injectClientScript(html: string, script: string): string {
  const bodyCloseIndex = html.lastIndexOf('</body>');
  const bodyCloseIndexLower = html.lastIndexOf('</BODY>');
  const insertIndex = Math.max(bodyCloseIndex, bodyCloseIndexLower);

  if (insertIndex === -1) {
    return `${html}<script>${script}</script>`;
  }

  return `${html.slice(0, insertIndex)}<script>${script}</script>${html.slice(insertIndex)}`;
}

export function createDevToolsMiddleware(options: DevToolsMiddlewareOptions = {}) {
  const enabled = options.enabled !== false;
  const rpc = createRpcServer();
  const clientScript = getDevtoolsClientScript();
  let iframeHtmlPromise: Promise<string> | null = null;

  function getIframeHtml(): Promise<string> {
    if (!iframeHtmlPromise) {
      iframeHtmlPromise = getDevtoolsIframeHtml().catch(err => {
        console.error('[ubean] DevTools client build failed:', err);
        return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DevTools Error</title>
<style>body{margin:0;padding:40px;background:#0f0f12;color:#ef4444;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;}
.error-box{text-align:center;}.error-title{font-size:18px;font-weight:600;margin-bottom:8px;}.error-desc{font-size:13px;color:#6b6b78;}</style>
</head><body><div class="error-box"><div class="error-title">DevTools Failed to Load</div><div class="error-desc">${err instanceof Error ? err.message : 'Unknown error'}</div></div></body></html>`;
      });
    }
    return iframeHtmlPromise;
  }

  return {
    rpc,
    async middleware(c: Context, next: Next) {
      if (!enabled) return next();

      const url = new URL(c.req.url);
      const pathname = url.pathname;

      if (pathname === DEVTOOLS_RPC_PATH && c.req.method === 'POST') {
        try {
          const body = await c.req.json();
          let response;
          if (Array.isArray(body)) {
            response = await rpc.handleBatch(body);
          } else {
            response = await rpc.handleRequest(body);
          }
          return c.json(response);
        } catch {
          return c.json({ error: 'Invalid request' }, 400);
        }
      }

      if (pathname === DEVTOOLS_IFRAME_PATH) {
        const html = await getIframeHtml();
        return c.html(html);
      }

      await next();

      if (isHtmlResponse(c) && !c.res.headers.get(DEVTOOLS_MAGIC_KEY)) {
        c.res.headers.set(DEVTOOLS_MAGIC_KEY, 'true');
        const originalBody = await c.res.text();
        const newBody = injectClientScript(originalBody, clientScript);
        c.res = new Response(newBody, {
          status: c.res.status,
          headers: c.res.headers
        });
      }
    }
  };
}

export type { DevToolsRpcServer };
