/**
 * Node ↔ Web 适配（RM-V03，docs/vite-plugin-migration.md Phase 0）。
 *
 * dev 与 preview 都要把 `node:http` 的请求/响应与 Web `Request`/`Response` 互转。此前
 * `vite-server.ts` 与 `server.ts` 各有一份**逐字节相同**的实现 —— 两份一起改才不会分叉，
 * 因此收拢到这里，由两侧共同引用。行为与原来逐字一致（纯搬移）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * `node:http` 请求 → Web `Request`。
 *
 * 非 GET/HEAD 时直接把 `IncomingMessage`（可读流）作为 body；undici 要求流式 body 显式
 * 声明 `duplex: 'half'`，否则构造 `Request` 会抛错。
 */
export async function toWebRequest(req: IncomingMessage, host: string, protocol: string): Promise<Request> {
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

/** Web `Response` → `node:http` 响应：写入状态与头，再流式转发 body（不整体缓冲）。 */
export async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
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
