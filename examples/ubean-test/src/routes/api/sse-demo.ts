import { defineHandler, defineSSE } from 'ubean/server';

/**
 * SSE（实时通信）：`defineSSE()` 返回一个 Hono 中间件，响应 `text/event-stream`。
 *
 * 连接建立时推一条 `ready`；`keepAlive: 300` 让它每 300ms 发一次心跳（便于在走查里观察到流）。
 */
export const GET = defineHandler(
  defineSSE(
    {
      onConnect(connection) {
        connection.send({ event: 'ready', data: { at: 'connected' } });
      }
    },
    { keepAlive: 300 }
  )
);
