import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServeIpxOptions {
  rootDir: string;
  staticDir?: string;
  isDev?: boolean;
}

export interface ServeIpxResult {
  status: number;
  headers: Record<string, string>;
  body?: Buffer | Uint8Array | string;
  redirect?: string;
}

export function parseIpxModifiers(str: string): Record<string, unknown> {
  const mods: Record<string, unknown> = {};
  const parts = str.split(',');

  for (const part of parts) {
    if (part === '_') continue;

    if (part === 'fh') {
      mods.flip = mods.flip === 'v' ? 'hv' : 'h';
      continue;
    }
    if (part === 'fv') {
      mods.flip = mods.flip === 'h' ? 'hv' : 'v';
      continue;
    }
    if (part === 'grayscale') {
      mods.grayscale = true;
      continue;
    }
    if (part === 'negate') {
      mods.negate = true;
      continue;
    }
    if (part === 'trim') {
      mods.trim = true;
      continue;
    }
    if (part === 'enlarge') {
      mods.enlarge = true;
      continue;
    }

    const [key, ...valueParts] = part.split('_');
    const value = valueParts.join('_');

    switch (key) {
      case 'w':
        mods.width = parseInt(value, 10);
        break;
      case 'h':
        mods.height = parseInt(value, 10);
        break;
      case 'f':
        mods.fit = value;
        break;
      case 'p':
        mods.position = decodeURIComponent(value);
        break;
      case 'fm':
        mods.format = value;
        break;
      case 'q':
        mods.quality = parseInt(value, 10);
        break;
      case 'blur':
        mods.blur = parseFloat(value);
        break;
      case 'sharpen':
        mods.sharpen = parseFloat(value);
        break;
      case 'rot':
        mods.rotate = parseInt(value, 10);
        break;
      case 'bg':
        mods.background = decodeURIComponent(value);
        break;
      case 'br':
        mods.brightness = parseFloat(value);
        break;
      case 'con':
        mods.contrast = parseFloat(value);
        break;
      case 'sat':
        mods.saturation = parseFloat(value);
        break;
    }
  }

  return mods;
}

export function resolveLocalImage(root: string, staticDir: string, src: string): string | undefined {
  const relative = src.replace(/^\/+/, '');
  if (relative.includes('..')) return undefined;
  const candidates = [join(root, staticDir, relative), join(root, relative)];
  return candidates.find(path => existsSync(path));
}

export function ipxContentType(src: string, format?: string): string {
  const ext = format || src.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    webp: 'image/webp',
    avif: 'image/avif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml'
  };
  return types[ext || ''] || 'image/jpeg';
}

async function tryIpxTransform(filePath: string, modifiers: Record<string, unknown>): Promise<Buffer | undefined> {
  if (Object.keys(modifiers).length === 0) return undefined;
  try {
    // ipx is optional — not a package dependency; missing module is a runtime no-op.
    // @ts-expect-error optional peer, resolved only when installed
    const ipx = (await import('ipx')) as {
      createIPX?: (opts: unknown) => {
        (id: string): Promise<{ data: Buffer | Uint8Array; format?: string }>;
      };
      ipxFSStorage?: (opts: { dir: string }) => unknown;
    };
    if (typeof ipx.createIPX !== 'function') return undefined;
    const dir = join(filePath, '..');
    const storage = ipx.ipxFSStorage ? ipx.ipxFSStorage({ dir }) : { dir };
    const instance = ipx.createIPX({ storage, httpStorage: false });
    const parts: string[] = [];
    if (typeof modifiers.width === 'number') {
      parts.push(`s_${modifiers.width}x${typeof modifiers.height === 'number' ? modifiers.height : '_'}`);
    }
    if (typeof modifiers.format === 'string') parts.push(`f_${modifiers.format}`);
    if (typeof modifiers.quality === 'number') parts.push(`q_${modifiers.quality}`);
    const id = `${parts.join(',') || '_'}/${filePath.split('/').pop()}`;
    const result = await instance(id);
    return Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
  } catch {
    return undefined;
  }
}

/**
 * Serve `/_ipx/<modifiers>/<src>` the same way in Vite dev and production Hono.
 * `pathname` is the part after `/_ipx` (e.g. `/_/photo.jpg` or `/w_800/photo.jpg`).
 */
export async function serveIpxRequest(pathname: string, options: ServeIpxOptions): Promise<ServeIpxResult> {
  const cacheControl = options.isDev ? 'no-cache' : 'public, max-age=31536000, immutable';
  const decoded = decodeURIComponent(pathname);
  const parts = decoded.split('/').filter(Boolean);

  if (parts.length < 2) {
    return { status: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Invalid IPX request' };
  }

  const modifiers = parts[0] === '_' ? {} : parseIpxModifiers(parts[0]);
  let src = parts.slice(1).join('/');
  if (src.startsWith('https:/') && !src.startsWith('https://')) {
    src = src.replace(/^https:\//, 'https://');
  } else if (src.startsWith('http:/') && !src.startsWith('http://')) {
    src = src.replace(/^http:\//, 'http://');
  }
  const headers: Record<string, string> = {
    'Content-Type': ipxContentType(src, typeof modifiers.format === 'string' ? modifiers.format : undefined),
    'Cache-Control': cacheControl
  };

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { status: 302, headers: { ...headers, 'X-IPX-Mode': 'redirect', Location: src }, redirect: src };
  }

  const local = resolveLocalImage(options.rootDir, options.staticDir || 'public', src);
  if (!local) {
    return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Image not found' };
  }

  const transformed = await tryIpxTransform(local, modifiers);
  if (transformed) {
    return { status: 200, headers: { ...headers, 'X-IPX-Mode': 'transform' }, body: transformed };
  }

  const mode = Object.keys(modifiers).length > 0 ? 'passthrough' : 'file';
  const body = readFileSync(local);
  return {
    status: 200,
    headers: { ...headers, 'X-IPX-Mode': mode, 'Content-Length': String(body.length) },
    body
  };
}

export function createIpxHonoHandler(options: ServeIpxOptions) {
  return async (c: {
    req: { path: string };
    redirect: (location: string, status?: 301 | 302) => Response;
  }): Promise<Response> => {
    const prefix = '/_ipx';
    const path = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) || '/' : c.req.path;
    const result = await serveIpxRequest(path.startsWith('/') ? path : `/${path}`, options);
    if (result.redirect) {
      return c.redirect(result.redirect, 302);
    }
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
}
