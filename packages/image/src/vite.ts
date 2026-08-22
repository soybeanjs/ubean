import type { Plugin } from 'vite';
import { defu } from 'defu';
import { serveIpxRequest } from './ipx';
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
  let projectRoot = process.cwd();

  return {
    name: 'ubean:image',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      isDev = resolvedConfig.command === 'serve';
      projectRoot = resolvedConfig.root;
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
          try {
            const result = await serveIpxRequest(url.pathname, {
              rootDir: projectRoot,
              staticDir: options.staticDir || 'public',
              isDev
            });
            for (const [key, value] of Object.entries(result.headers)) {
              res.setHeader(key, value);
            }
            if (result.redirect) {
              res.statusCode = result.status;
              res.end();
              return;
            }
            res.statusCode = result.status;
            if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
              res.end(result.body);
              return;
            }
            res.end(result.body ?? '');
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

export default ubeanImagePlugin;
