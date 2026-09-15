import { createServer } from 'node:http';
import type { UbeanApp } from '@ubean/app';
import { sendWebResponse, toWebRequest } from '@ubean/build/vite';

export interface DevServerOptions {
  port: number;
  host?: string;
  app: UbeanApp;
  onListen?: (info: { port: number; host: string }) => void;
}

export interface DevServer {
  port: number;
  close(): Promise<void>;
}

export function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const { port, app, onListen } = options;
  const host = options.host || 'localhost';

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        await app.init();
        // @ts-expect-error Socket 类型没有 encrypted 属性
        const protocol = req.socket?.encrypted ? 'https' : 'http';
        const webReq = await toWebRequest(req, host, protocol);
        const webRes = await app.fetch(webReq);
        await sendWebResponse(res, webRes);
      } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : 'Internal Server Error');
      }
    });

    server.on('error', reject);

    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      onListen?.({ port: actualPort, host });
      resolve({
        port: actualPort,
        close() {
          return new Promise<void>((res, rej) => {
            server.close(err => (err ? rej(err) : res()));
          });
        }
      });
    });
  });
}
