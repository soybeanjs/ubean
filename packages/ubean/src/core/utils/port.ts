import { createServer as createNetServer, createConnection as createNetConnection } from 'node:net';

export interface FindPortOptions {
  host?: string;
  strictPort?: boolean;
}

/**
 * Tries to listen on `port` at `host`. If the port is already in use and
 * `strictPort` is false, recursively tries `port + 1` until an available
 * port is found (mirrors Vite's behaviour).
 *
 * Resolves with the available port (which may differ from the requested one
 * when not in strict mode). Rejects with the original error when the port is
 * in use and `strictPort` is true, or for any non-EADDRINUSE error.
 */
export async function findAvailablePort(port: number, options: FindPortOptions = {}): Promise<number> {
  const host = options.host ?? 'localhost';
  const strictPort = options.strictPort ?? false;

  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !strictPort) {
        server.close();
        resolve(findAvailablePort(port + 1, options));
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

export interface WaitForPortOptions {
  host?: string;
  retries?: number;
  delay?: number;
}

/**
 * Polls `port` until a TCP connection can be established, indicating the
 * spawned preview server is ready to accept requests.
 *
 * Rejects when the port does not become available within `retries` attempts.
 */
export async function waitForPort(port: number, options: WaitForPortOptions = {}): Promise<void> {
  const host = options.host ?? 'localhost';
  const retries = options.retries ?? 30;
  const delay = options.delay ?? 200;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (await isPortReachable(port, host)) {
      return;
    }
    await sleep(delay);
  }
  throw new Error(`Port ${port} did not become ready after ${retries} attempts (${host}).`);
}

/**
 * Returns true when something is actively listening on `port` at `host`.
 */
export function isPortReachable(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createNetConnection({ port, host });
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    // Guard against hanging connections
    setTimeout(() => done(false), 1000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
