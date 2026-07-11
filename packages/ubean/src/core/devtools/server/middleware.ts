import type { Context, Next } from 'hono';
import { createRpcServer, type DevToolsRpcServer } from './rpc';
import { getDevtoolsClientScript, getDevtoolsIframeHtml } from '../client';
import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH, DEVTOOLS_MAGIC_KEY } from '../types';

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
    return html + `<script>${script}</script>`;
  }

  return html.slice(0, insertIndex) + `<script>${script}</script>` + html.slice(insertIndex);
}

export function createDevToolsMiddleware(options: DevToolsMiddlewareOptions = {}) {
  const enabled = options.enabled !== false;
  const rpc = createRpcServer();
  const clientScript = getDevtoolsClientScript();
  const iframeHtml = getDevtoolsIframeHtml();

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
        } catch (err) {
          return c.json({ error: 'Invalid request' }, 400);
        }
      }

      if (pathname === DEVTOOLS_IFRAME_PATH) {
        return c.html(iframeHtml);
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
