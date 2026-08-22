import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UbeanApp } from '@ubean/app';

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
  const body = method === 'GET' || method === 'HEAD' ? undefined : req;

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
