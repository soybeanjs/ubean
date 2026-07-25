import type { Plugin } from 'vite';
import { defu } from 'defu';
import { configureImageRuntime } from './runtime';
import type { CreateImageOptions, ImageProvider } from './types';

export interface UbeanImageOptions extends CreateImageOptions {
  injectScript?: boolean;
  staticDir?: string;
  ipxMiddleware?: boolean;
  devtools?: boolean;
}

const defaultOptions: UbeanImageOptions = {
  injectScript: true,
  staticDir: 'public',
  ipxMiddleware: true,
  devtools: true
};

const VIRTUAL_IMAGE = 'virtual:ubean-image-config';
const RESOLVED_VIRTUAL_IMAGE = `\0${VIRTUAL_IMAGE}`;

export function ubeanImagePlugin(userOptions: UbeanImageOptions = {}): Plugin {
  const options = defu(userOptions, defaultOptions) as Required<UbeanImageOptions> & {
    providers: Record<string, Partial<ImageProvider>>;
    presets: Record<string, any>;
  };

  let isDev = false;

  return {
    name: 'ubean:image',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      isDev = resolvedConfig.command === 'serve';
    },

    resolveId(id) {
      if (id === VIRTUAL_IMAGE) {
        return RESOLVED_VIRTUAL_IMAGE;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_IMAGE) {
        return `
export const imageConfig = ${JSON.stringify({
          provider: options.provider || 'ipx',
          presets: options.presets || {},
          screens: options.screens || {},
          densities: options.densities || [1, 2],
          format: options.format || ['webp', 'avif'],
          quality: options.quality || 80,
          domains: options.domains || [],
          alias: options.alias || {},
          ipx: options.ipx || { baseURL: '/_ipx' },
          static: options.static || { baseURL: '/_image' }
        })};
export default imageConfig;
`;
      }
      return null;
    },

    configureServer(server) {
      if (options.ipxMiddleware) {
        const ipxHandler = async (req: any, res: any, next: any) => {
          if (!req.url) return next();

          const url = new URL(req.url, 'http://localhost');
          const pathname = decodeURIComponent(url.pathname);
          const parts = pathname.split('/').filter(Boolean);

          if (parts.length < 2) {
            res.statusCode = 400;
            res.end('Invalid IPX request');
            return;
          }

          const modifiers = parts[0] === '_' ? {} : parseModifiers(parts[0]);
          const src = parts.slice(1).join('/');

          try {
            res.setHeader('Content-Type', getContentType(src, modifiers.format));
            res.setHeader('Cache-Control', isDev ? 'no-cache' : 'public, max-age=31536000, immutable');
            res.statusCode = 302;
            res.setHeader('Location', src.startsWith('http') ? src : `/${src}`);
            res.end();
          } catch (err) {
            next(err);
          }
        };
        server.middlewares.use('/_ipx', (req: any, res: any, next: any) => {
          ipxHandler(req, res, next).catch(next);
        });
      }
    },

    buildStart() {
      configureImageRuntime({
        provider: options.provider,
        providers: options.providers,
        presets: options.presets,
        screens: options.screens,
        densities: options.densities,
        format: options.format,
        quality: options.quality,
        domains: options.domains,
        alias: options.alias,
        ipx: options.ipx,
        static: options.static
      });
    }
  };
}

function parseModifiers(str: string): Record<string, any> {
  const mods: Record<string, any> = {};
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

function getContentType(src: string, format?: string): string {
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

export default ubeanImagePlugin;
