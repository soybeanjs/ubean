import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Context, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';
import { join, extname } from 'pathe';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export interface ServeStaticOptions {
  publicDir: string;
  indexFiles?: string[];
  maxAge?: number;
}

export function serveStatic(options: ServeStaticOptions): MiddlewareHandler<UbeanEnv> {
  const { publicDir, indexFiles = ['index.html'], maxAge = 3600 } = options;

  return async (c: Context<UbeanEnv>, next: () => Promise<void>) => {
    const path = decodeURIComponent(c.req.path);
    if (path.startsWith('/_') || path.startsWith('/api/')) {
      return next();
    }

    let filePath = join(publicDir, path);

    try {
      if (!existsSync(filePath)) {
        if (path.endsWith('/')) {
          for (const indexFile of indexFiles) {
            const indexPath = join(filePath, indexFile);
            if (existsSync(indexPath) && statSync(indexPath).isFile()) {
              filePath = indexPath;
              break;
            }
          }
        }

        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          return next();
        }
      }

      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        for (const indexFile of indexFiles) {
          const indexPath = join(filePath, indexFile);
          if (existsSync(indexPath) && statSync(indexPath).isFile()) {
            filePath = indexPath;
            break;
          }
        }
      }

      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        return next();
      }

      const finalStat = statSync(filePath);
      const mimeType = getMimeType(filePath);
      const body = readFileSync(filePath);
      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': String(body.length),
        'Cache-Control': `public, max-age=${maxAge}`,
        'X-Content-Type-Options': 'nosniff'
      };

      const ifNoneMatch = c.req.header('If-None-Match');
      const etag = `"${finalStat.size.toString(16)}-${finalStat.mtimeMs.toString(16)}"`;
      if (ifNoneMatch === etag) {
        return new Response(null, { status: 304, headers });
      }
      headers.ETag = etag;

      return new Response(body, { status: 200, headers });
    } catch {
      return next();
    }
  };
}
