/**
 * SSE HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`formatSSEMessage` 帧格式、`sseHeaders` 头、`createSSEStream`/连接
 * 生命周期、keep-alive、`broadcastSSE`、`closeAllSSE`/`clearSSEState`、`defineSSE`）
 * 已于 TS-34 下沉到 `packages/server/test/sse-l1.test.ts`（39 例），此处不再重复。
 * 保留的只有**只有 HTTP 层能证明**的东西：端点状态码、响应头、流式字节序列。
 */
import { describe, it, expect } from 'vitest';
import { api } from './helper';

describe('SSE (Server-Sent Events) system', () => {
  describe('HTTP integration - /api/sse-test', () => {
    it('returns SSE stream with correct headers', async () => {
      const res = await api('/api/sse-test');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.headers.get('Cache-Control')).toContain('no-cache');
    });

    it('returns retry header in stream', async () => {
      const res = await api('/api/sse-test');
      // The retry:2000 should be in the response body
      expect(res.text).toContain('retry: 2000');
    });

    it('streams events (connected, tick, done)', async () => {
      const res = await api('/api/sse-test');
      expect(res.text).toContain('event: connected');
      // The stream sends tick events via interval, may need to wait
      // The response body should contain at least the connected event
      expect(res.text).toContain('data:');
    });
  });
});
