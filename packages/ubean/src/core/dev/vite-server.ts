import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import type { ResolvedConfig as UbeanResolvedConfig } from '../config/types';
import type { UbeanApp } from '../../runtime/app';
import { ubeanPlugin } from '../build/vite/plugin';
import { ubeanVuePlugin } from '../vue/plugin';
import { ubeanIslandsPlugin } from '../islands/transform';

export interface ViteDevServerOptions {
  cwd: string;
  port: number;
  host?: string;
  config: UbeanResolvedConfig;
  app: UbeanApp;
  onListen?: (info: { port: number; host: string; url: string }) => void;
}

export interface ViteDevServerInstance {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly viteServer: ViteDevServer;
  start(): Promise<void>;
  stop(): Promise<void>;
  updateApp(app: UbeanApp): void;
}

async function toWebRequest(
  req: IncomingMessage,
  host: string,
  protocol: string
): Promise<Request> {
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
  const { cwd, config, app: initialApp } = options;
  const host = options.host || 'localhost';
  let currentApp = initialApp;
  let httpServer: ReturnType<typeof createHttpServer> | null = null;
  let viteServer: ViteDevServer | null = null;
  let actualPort = options.port;

  const plugins: any[] = [
    vue(),
    ubeanPlugin({ config }),
    ...ubeanVuePlugin({ config }),
    ubeanIslandsPlugin()
  ];

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
      exclude: ['ubean', '#ubean-pages', '#ubean-app', '#ubean-client-entry']
    },
    ssr: {
      noExternal: ['ubean']
    }
  } as any)) as ViteDevServer;

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
          await sendWebResponse(res, webRes);
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

      await new Promise<void>((resolve, reject) => {
        httpServer!.on('error', reject);
        httpServer!.listen(actualPort, host, () => {
          const addr = httpServer!.address();
          actualPort = typeof addr === 'object' && addr ? addr.port : actualPort;
          resolve();
        });
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

    updateApp(app: UbeanApp) {
      currentApp = app;
    }
  };

  return instance;
}
