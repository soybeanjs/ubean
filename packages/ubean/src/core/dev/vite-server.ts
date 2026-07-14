import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createServer as createViteServer } from 'vite';
import type { ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import type { ResolvedConfig as UbeanResolvedConfig } from '../config/types';
import { ubeanPlugin } from '../build/vite/plugin';
import { ubeanVuePlugin, VUE_PLUGIN_INCLUDE } from '../vue/plugin';
import { resolveModules } from '../modules';
import type { UbeanApp } from '../../runtime/app';
import { ubeanIslandsPlugin } from '../islands/transform';
import { logger } from '../log';
import type { ScannedLayout } from '../routing/types';
import { createVueRenderer } from '../vue/renderer';

export interface ViteDevServerOptions {
  cwd: string;
  port: number;
  host?: string;
  strictPort?: boolean;
  config: UbeanResolvedConfig;
  app: UbeanApp;
  layouts?: ScannedLayout[];
  onListen?: (info: { port: number; host: string; url: string }) => void;
}

/**
 * Tries to listen on `port` at `host`. If the port is already in use and
 * `strictPort` is false, recursively tries `port + 1` until an available
 * port is found (mirrors Vite's behaviour).
 */
async function findAvailablePort(port: number, host: string, strictPort: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !strictPort) {
        server.close();
        resolve(findAvailablePort(port + 1, host, false));
      } else {
        reject(err);
      }
    });
    server.listen(port, host, () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      server.close(() => resolve(actual));
    });
  });
}

export interface ViteDevServerInstance {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly viteServer: ViteDevServer;
  start(): Promise<void>;
  stop(): Promise<void>;
  updateApp(app: UbeanApp, layouts?: ScannedLayout[]): void;
}

async function toWebRequest(req: IncomingMessage, host: string, protocol: string): Promise<Request> {
  const url = `${protocol}://${req.headers.host || host}${req.url || '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (req as unknown as any);

  return new Request(url, {
    method,
    headers,
    body,
    duplex: 'half'
  } as RequestInit);
}

async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  res.statusMessage = webRes.statusText;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

export async function createViteDevServer(options: ViteDevServerOptions): Promise<ViteDevServerInstance> {
  const { cwd, config, app: initialApp, layouts: initialLayouts = [] } = options;
  const host = options.host || 'localhost';
  const strictPort = options.strictPort ?? false;
  let currentApp = initialApp;
  let currentLayouts = initialLayouts;
  let httpServer: ReturnType<typeof createHttpServer> | null = null;
  let viteServer: ViteDevServer | null = null;

  // Resolve the actual port before creating the Vite server so that the HMR
  // config and the HTTP server use the same port.
  const requestedPort = options.port;
  let actualPort: number;
  try {
    actualPort = await findAvailablePort(requestedPort, host, strictPort);
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${requestedPort} is already in use${host ? ` on ${host}` : ''}. ` +
          `Try a different port or remove the --strictPort flag.`,
        { cause: err }
      );
    }
    throw err;
  }
  if (actualPort !== requestedPort) {
    logger.warn(`Port ${requestedPort} is in use, trying ${actualPort} instead.`);
  }

  const builtinPlugins: any[] = [
    vue({ include: VUE_PLUGIN_INCLUDE }),
    ubeanPlugin({ config }),
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  ];

  const { plugins } = await resolveModules({
    cwd,
    config,
    builtinPlugins
  });

  viteServer = (await createViteServer({
    root: cwd,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: {
        port: actualPort + 1000
      }
    },
    appType: 'custom',
    plugins,
    optimizeDeps: {
      exclude: [
        'ubean',
        'virtual:ubean-pages.ts',
        'virtual:ubean-app.ts',
        'virtual:ubean-client-entry.ts',
        '#ubean-pages',
        '#ubean-app',
        '#ubean-client-entry'
      ]
    },
    ssr: {
      noExternal: ['ubean']
    }
  } as any)) as ViteDevServer;

  function enhanceAppWithVite(app: UbeanApp, layouts: ScannedLayout[] = []) {
    app.options.layouts = layouts;

    const routeLoaders: Record<string, () => Promise<any>> = {};
    for (const route of app.options.routes || []) {
      const fullPath = route.fullPath;
      routeLoaders[route.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.routeLoaders = routeLoaders;

    const pageLoaders: Record<string, () => Promise<any>> = {};
    for (const page of app.options.pages || []) {
      const fullPath = page.fullPath;
      pageLoaders[page.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.pageLoaders = pageLoaders;

    const middlewareLoaders: Record<string, () => Promise<any>> = {};
    for (const mw of app.options.middleware || []) {
      const fullPath = mw.fullPath;
      middlewareLoaders[mw.relativePath] = () => viteServer!.ssrLoadModule(fullPath);
    }
    app.options.middlewareLoaders = middlewareLoaders;

    const layoutMap = new Map<string, string>();
    for (const layout of layouts) {
      layoutMap.set(layout.name, layout.fullPath);
    }

    const defaultLayout = layouts.find(l => l.isDefault)?.name || null;

    // Build vue-router routes for SSR
    const scannedPages = app.options.pages || [];
    const routes = scannedPages.map((p: any) => ({
      path: p.route.replace(/\*\*:(\w[\w-]*)/g, ':$1(.*)*'),
      name: p.name,
      component: async () => {
        const mod = await viteServer!.ssrLoadModule(p.fullPath);
        return mod.default || mod;
      },
      meta: {
        layout: p.layout === false ? false : p.layout || defaultLayout,
        pageName: p.name
      }
    }));

    app.options.pageRenderer = createVueRenderer({
      routes,
      async resolveLayoutComponent(name: string | false | null | undefined) {
        if (name === false || name == null) return null;
        const fullPath = layoutMap.get(name);
        if (!fullPath) return null;
        const mod = await viteServer!.ssrLoadModule(fullPath);
        return mod.default || mod;
      },
      defaultLayout
    });

    app.resetInit();
  }

  enhanceAppWithVite(currentApp, currentLayouts);

  const getUrl = () => `http://${host}:${actualPort}`;

  const instance: ViteDevServerInstance = {
    get port() {
      return actualPort;
    },
    get host() {
      return host;
    },
    get url() {
      return getUrl();
    },
    get viteServer() {
      return viteServer!;
    },

    async start() {
      httpServer = createHttpServer(async (req, res) => {
        try {
          await new Promise<void>((resolve, reject) => {
            viteServer!.middlewares(req, res, (err?: unknown) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          if (res.writableEnded) {
            return;
          }

          await currentApp.init();
          const protocol = (req.socket as any)?.encrypted ? 'https' : 'http';
          const webReq = await toWebRequest(req, host, protocol);
          const webRes = await currentApp.fetch(webReq);

          const contentType = webRes.headers.get('content-type') || '';
          // The DevTools client serves a pre-built SPA with separate static
          // assets. Vite's transformIndexHtml would break the pre-built module
          // references and import-analysis. Skip transform for all devtools
          // paths (client SPA root, assets, and legacy iframe alias).
          const skipTransform = (req.url || '').startsWith('/__ubean_devtools__');
          if (contentType.includes('text/html') && webRes.body && !skipTransform) {
            const html = await webRes.text();
            const transformedHtml = await viteServer!.transformIndexHtml(req.url || '/', html);
            res.statusCode = webRes.status;
            res.statusMessage = webRes.statusText;
            webRes.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            res.end(transformedHtml);
          } else {
            await sendWebResponse(res, webRes);
          }
        } catch (err) {
          if (viteServer) {
            viteServer.ssrFixStacktrace(err as Error);
          }
          if (!res.headersSent) {
            res.statusCode = 500;
            const errorHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Server Error</title>
    <style>
      body { font-family: monospace; padding: 2rem; background: #1a1a1a; color: #ff6b6b; }
      pre { background: #2d2d2d; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>Internal Server Error</h1>
    <pre>${(err as Error).stack || (err as Error).message}</pre>
  </body>
</html>`;
            res.setHeader('Content-Type', 'text/html');
            res.end(errorHtml);
          } else if (!res.writableEnded) {
            res.end(err instanceof Error ? err.message : 'Internal Server Error');
          }
        }
      });

      viteServer!.httpServer = httpServer as any;

      // Listen with auto-increment as a safety net. The probe above already
      // resolved the port in the common case; this retry only fires if someone
      // grabbed the port between the probe and this listen call, mirroring
      // Vite's "never throw on port conflict" behaviour (unless strictPort).
      await new Promise<void>((resolve, reject) => {
        const tryListen = (port: number) => {
          httpServer!.removeAllListeners('error');
          httpServer!.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE' && !strictPort) {
              logger.warn(`Port ${port} is in use, trying ${port + 1} instead.`);
              tryListen(port + 1);
            } else {
              reject(err);
            }
          });
          httpServer!.listen(port, host, () => {
            const addr = httpServer!.address();
            actualPort = typeof addr === 'object' && addr ? addr.port : port;
            resolve();
          });
        };
        tryListen(actualPort);
      });

      options.onListen?.({
        port: actualPort,
        host,
        url: getUrl()
      });
    },

    async stop() {
      if (viteServer) {
        await viteServer.close();
        viteServer = null;
      }
      if (httpServer) {
        await new Promise<void>((res, rej) => {
          httpServer!.close(err => (err ? rej(err) : res()));
        });
        httpServer = null;
      }
    },

    updateApp(app: UbeanApp, layouts?: ScannedLayout[]) {
      currentApp = app;
      if (layouts) currentLayouts = layouts;
      enhanceAppWithVite(app, currentLayouts);
    }
  };

  return instance;
}
