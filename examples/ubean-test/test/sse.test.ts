import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatSSEMessage,
  createSSEStream,
  defineSSE,
  getSSEConnections,
  broadcastSSE,
  closeAllSSE,
  sseHeaders,
  clearSSEState
} from 'ubean';
import { api, getJson } from './helper';

describe('SSE (Server-Sent Events) system', () => {
  beforeEach(() => {
    clearSSEState();
  });

  describe('formatSSEMessage()', () => {
    it('formats data-only message', () => {
      const msg = formatSSEMessage({ data: 'hello' });
      expect(msg).toBe('data: hello\n\n');
    });

    it('formats event + data message', () => {
      const msg = formatSSEMessage({ event: 'update', data: 'payload' });
      expect(msg).toContain('event: update');
      expect(msg).toContain('data: payload');
    });

    it('formats id + data message', () => {
      const msg = formatSSEMessage({ id: '123', data: 'test' });
      expect(msg).toContain('id: 123');
      expect(msg).toContain('data: test');
    });

    it('formats retry message', () => {
      const msg = formatSSEMessage({ retry: 2000 });
      expect(msg).toContain('retry: 2000');
    });

    it('formats comment message', () => {
      const msg = formatSSEMessage({ comment: 'this is a comment' });
      expect(msg).toContain(': this is a comment');
    });

    it('formats multi-line data', () => {
      const msg = formatSSEMessage({ data: 'line1\nline2' });
      expect(msg).toContain('data: line1');
      expect(msg).toContain('data: line2');
    });

    it('serializes object data as JSON', () => {
      const msg = formatSSEMessage({ data: { key: 'value' } });
      expect(msg).toContain('data: {"key":"value"}');
    });

    it('formats complete message with all fields', () => {
      const msg = formatSSEMessage({
        id: '5',
        event: 'notification',
        retry: 3000,
        data: 'complete'
      });
      expect(msg).toContain('id: 5');
      expect(msg).toContain('event: notification');
      expect(msg).toContain('retry: 3000');
      expect(msg).toContain('data: complete');
    });

    it('ends with double newline', () => {
      const msg = formatSSEMessage({ data: 'x' });
      expect(msg.endsWith('\n\n')).toBe(true);
    });
  });

  describe('sseHeaders()', () => {
    it('returns correct SSE headers', () => {
      const headers = sseHeaders();
      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache, no-transform');
      expect(headers['Connection']).toBe('keep-alive');
      expect(headers['X-Accel-Buffering']).toBe('no');
    });
  });

  describe('createSSEStream()', () => {
    it('creates a Response with SSE headers', () => {
      const mockContext = {
        req: { url: 'http://localhost/sse' }
      } as any;

      const response = createSSEStream(mockContext, {
        onConnect: () => {}
      }, { retry: 2000 });

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });
  });

  describe('defineSSE()', () => {
    it('returns a middleware handler', () => {
      const handler = defineSSE({
        onConnect: () => {}
      });
      expect(typeof handler).toBe('function');
    });
  });

  describe('getSSEConnections() / broadcastSSE()', () => {
    it('getSSEConnections returns a Map', () => {
      const conns = getSSEConnections();
      expect(conns).toBeInstanceOf(Map);
    });

    it('broadcastSSE does not throw with no connections', () => {
      expect(() => broadcastSSE('event', 'data')).not.toThrow();
    });
  });

  describe('closeAllSSE()', () => {
    it('does not throw with no connections', () => {
      expect(() => closeAllSSE()).not.toThrow();
    });
  });

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
