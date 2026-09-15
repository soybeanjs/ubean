/**
 * Node ↔ Web 适配器测试（RM-V03，RM-V10 起归属 @ubean/build）。
 *
 * 真实 `node:http` 服务器 + 真实 `fetch` 往返：只断言契约（URL/方法/头/body 与状态/头/
 * 流式 body 的互转），不 mock —— 这份适配是 Phase 1 的 dev 请求路由与 preview 接管共同的
 * 底座，mock 掉就测不出真问题。
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendWebResponse, toWebRequest } from '@ubean/build/vite';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const webReq = await toWebRequest(req, 'localhost', 'http');
      const url = new URL(webReq.url);
      const payload = {
        path: url.pathname,
        origin: url.origin,
        method: webReq.method,
        hasBody: webReq.body !== null,
        custom: webReq.headers.get('x-custom'),
        body: webReq.method === 'GET' || webReq.method === 'HEAD' ? '' : await webReq.text()
      };
      await sendWebResponse(
        res,
        new Response(JSON.stringify(payload), {
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'application/json', 'x-adapter': 'ok' }
        })
      );
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('toWebRequest / sendWebResponse', () => {
  it('GET：拼出完整 URL、保留头、不带 body', async () => {
    const res = await fetch(`${baseUrl}/echo?a=1`, { headers: { 'x-custom': 'value' } });
    const payload = (await res.json()) as Record<string, unknown>;

    expect(payload.path).toBe('/echo');
    expect(payload.origin).toBe(baseUrl);
    expect(payload.method).toBe('GET');
    expect(payload.custom).toBe('value');
    // GET 不挂 body —— 否则 Request 构造会因流式 body 与 GET 冲突而失败
    expect(payload.hasBody).toBe(false);
  });

  it('POST：请求体经可读流原样传到 handler', async () => {
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'x-custom': 'post' },
      body: 'payload-from-client'
    });
    const payload = (await res.json()) as Record<string, unknown>;

    expect(payload.method).toBe('POST');
    expect(payload.hasBody).toBe(true);
    expect(payload.body).toBe('payload-from-client');
  });

  it('响应：状态、状态文本、头与 body 都落到 node 响应上', async () => {
    const res = await fetch(`${baseUrl}/echo`);

    expect(res.status).toBe(201);
    expect(res.statusText).toBe('Created');
    expect(res.headers.get('x-adapter')).toBe('ok');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()) as Record<string, unknown>).toHaveProperty('path', '/echo');
  });
});
