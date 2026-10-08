/**
 * WebSocket HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`defineWebSocket`/`defineRoom`/`createRoom`/`getRoom`/`getRooms`、
 * peer 能力、`broadcast`、`handleUpgrade`/`handleMessage`/`handleClose`/`handleError`、
 * `createWebSocketMiddleware`、`clearWebSocketState`）已于 TS-34 下沉到
 * `packages/server/test/websocket-l1.test.ts`（40 例），此处不再重复。
 * 保留的只有**只有 HTTP 层能证明**的东西：端点可路由、状态码、响应形状。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe('WebSocket system', () => {
  describe('HTTP integration - /api/ws-test', () => {
    it('GET returns WebSocket endpoint info', async () => {
      const res = await getJson('/api/ws-test');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('upgradeUrl');
      expect(res.data).toHaveProperty('roomName', 'chat');
      expect(res.data).toHaveProperty('rooms');
    });
  });
});
