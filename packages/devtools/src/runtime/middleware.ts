import type { Context, Next } from 'hono';
import { isHtmlResponse, injectScript } from '../shared/html';
import { getDevtoolsIframeHtml, serveDevtoolsClientAsset } from '../shared/static-serve';
import { getDevtoolsClientScript } from '../server/client-script';
import { createRpcServer } from '../server/rpc';
import type { DevToolsRpcServer } from '../server/rpc';
import { DEVTOOLS_RPC_PATH, DEVTOOLS_CLIENT_PATH, DEVTOOLS_IFRAME_PATH, DEVTOOLS_MAGIC_KEY } from '../types';

export interface DevToolsMiddlewareOptions {
  enabled?: boolean;
  ai?: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
  };
}

export { getDevtoolsIframeHtml } from '../shared/static-serve';

export function createDevToolsMiddleware(options: DevToolsMiddlewareOptions = {}) {
  const enabled = options.enabled !== false;
  const rpc = createRpcServer({ ai: options.ai });
  const clientScript = getDevtoolsClientScript();

  return {
    rpc,
    async middleware(c: Context, next: Next) {
      if (!enabled) return next();

      const url = new URL(c.req.url);
      const pathname = url.pathname;

      // RPC endpoint
      if (pathname === DEVTOOLS_RPC_PATH && c.req.method === 'POST') {
        try {
          const body = await c.req.json();
          const response = Array.isArray(body) ? await rpc.handleBatch(body) : await rpc.handleRequest(body);
          return c.json(response);
        } catch {
          return c.json({ error: 'Invalid request' }, 400);
        }
      }

      // Client SPA root → serve index.html
      if (pathname === DEVTOOLS_CLIENT_PATH || pathname === `${DEVTOOLS_CLIENT_PATH}/`) {
        return c.html(getDevtoolsIframeHtml());
      }

      // Client static assets → serve files from dist/client/
      if (pathname.startsWith(`${DEVTOOLS_CLIENT_PATH}/`)) {
        const subPath = pathname.slice(DEVTOOLS_CLIENT_PATH.length + 1);
        const asset = serveDevtoolsClientAsset(subPath);
        if (asset) {
          // Cast needed: TS 6 + DOM lib's BodyInit doesn't accept Buffer<ArrayBufferLike>
          // directly, even though it's valid at runtime (Buffer extends Uint8Array).
          return new Response(asset.body as unknown as ArrayBuffer, {
            headers: {
              'Content-Type': asset.contentType,
              'Cache-Control': asset.cacheControl
            }
          });
        }
        // Asset not found → return 404 (not fallback HTML, which is only for missing build)
        return c.notFound();
      }

      // Backward compat: iframe path serves the same SPA
      if (pathname === DEVTOOLS_IFRAME_PATH) {
        return c.html(getDevtoolsIframeHtml());
      }

      await next();

      // Inject devtools bootstrap script into HTML responses
      if (isHtmlResponse(c) && !c.res.headers.get(DEVTOOLS_MAGIC_KEY)) {
        c.res.headers.set(DEVTOOLS_MAGIC_KEY, 'true');
        const originalBody = await c.res.text();
        const newBody = injectScript(originalBody, clientScript);
        c.res = new Response(newBody, {
          status: c.res.status,
          headers: c.res.headers
        });
      }
    }
  };
}

export type { DevToolsRpcServer };
