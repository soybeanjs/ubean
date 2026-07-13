import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, normalize, relative } from 'pathe';
import { DEVTOOLS_RPC_PATH } from '../types';

// `vp pack` bundles all src/ into a single dist/index.mjs.
// At runtime, import.meta.url points to dist/index.mjs, so `client/` is a
// direct subdirectory — same pattern as the current middleware.ts.
const BUILT_CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'client');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};

export const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ubean DevTools</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #0f0f12; color: #fafafa; font-family: system-ui, -apple-system, sans-serif; }
  #app { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
  .loading-text { color: #6b6b78; font-size: 13px; max-width: 320px; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
<div id="app">
  <div class="loading-text">DevTools client not built. Run <code>pnpm --filter @ubean/devtools build</code> to enable the DevTools panel.</div>
</div>
<script>
  window.__UBEAN_DEVTOOLS_CONFIG__ = { rpcPath: ${JSON.stringify(DEVTOOLS_RPC_PATH)} };
</script>
</body>
</html>`;

let cachedIndexHtml: string | null = null;

function readIndexHtml(): string {
  if (cachedIndexHtml) return cachedIndexHtml;
  const htmlPath = resolve(BUILT_CLIENT_DIR, 'index.html');
  if (!existsSync(htmlPath)) return FALLBACK_HTML;
  cachedIndexHtml = readFileSync(htmlPath, 'utf-8');
  return cachedIndexHtml;
}

export function getDevtoolsIframeHtml(): string {
  const html = readIndexHtml();
  return html.replaceAll('__RPC_PATH_PLACEHOLDER__', DEVTOOLS_RPC_PATH);
}

export interface StaticAssetResponse {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

export function serveDevtoolsClientAsset(subPath: string): StaticAssetResponse | null {
  // Normalize and guard against path traversal
  const safePath = normalize(subPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(BUILT_CLIENT_DIR, safePath);
  const relativePath = relative(BUILT_CLIENT_DIR, filePath);
  if (relativePath.startsWith('..') || relativePath.includes('..')) {
    return null;
  }
  if (!existsSync(filePath)) return null;

  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const body = readFileSync(filePath);
  // Hashed assets are immutable; HTML should always revalidate
  const cacheControl = ext === '.html'
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  return { body, contentType, cacheControl };
}

/** Clear cached HTML — useful for tests or watch mode rebuilds. */
export function clearDevtoolsClientCache(): void {
  cachedIndexHtml = null;
}
