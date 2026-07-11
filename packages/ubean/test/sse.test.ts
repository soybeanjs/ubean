import { describe, it, expect, beforeEach } from 'vitest';
import { formatSSEMessage, clearSSEState, getSSEConnections } from '../src/runtime/sse';

describe('SSE message formatting', () => {
  it('formats simple string data', () => {
    const raw = formatSSEMessage({ data: 'hello' });
    expect(raw).toBe('data: hello\n\n');
  });

  it('formats object data as JSON', () => {
    const raw = formatSSEMessage({ data: { msg: 'hi', count: 42 } });
    expect(raw).toContain('data: {"msg":"hi","count":42}');
    expect(raw.endsWith('\n\n')).toBe(true);
  });

  it('formats multiline data into multiple data fields', () => {
    const raw = formatSSEMessage({ data: 'line1\nline2' });
    expect(raw).toBe('data: line1\ndata: line2\n\n');
  });

  it('includes event name', () => {
    const raw = formatSSEMessage({ data: 'update', event: 'message' });
    expect(raw).toContain('event: message');
    expect(raw).toContain('data: update');
  });

  it('includes event id', () => {
    const raw = formatSSEMessage({ data: 'msg', id: '123' });
    expect(raw).toContain('id: 123');
  });

  it('includes retry field', () => {
    const raw = formatSSEMessage({ data: 'msg', retry: 5000 });
    expect(raw).toContain('retry: 5000');
  });

  it('includes comment', () => {
    const raw = formatSSEMessage({ comment: 'ping' });
    expect(raw).toBe(': ping\n\n');
  });

  it('formats complete message with all fields', () => {
    const raw = formatSSEMessage({
      data: 'hello',
      event: 'greeting',
      id: '1',
      retry: 3000
    });
    expect(raw).toContain('id: 1');
    expect(raw).toContain('event: greeting');
    expect(raw).toContain('retry: 3000');
    expect(raw).toContain('data: hello');
    expect(raw.endsWith('\n\n')).toBe(true);
  });
});

describe('SSE connection management', () => {
  beforeEach(() => {
    clearSSEState();
  });

  it('initially has no connections', () => {
    expect(getSSEConnections().size).toBe(0);
  });

  it('provides sseHeaders helper', async () => {
    const { sseHeaders } = await import('../src/runtime/sse');
    const headers = sseHeaders();
    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('clearSSEState resets all state', () => {
    clearSSEState();
    expect(getSSEConnections().size).toBe(0);
  });
});

describe('defineSSE handler factory', () => {
  it('creates a handler function', async () => {
    const { defineSSE } = await import('../src/runtime/sse');
    const handler = defineSSE({
      onConnect() {}
    });
    expect(typeof handler).toBe('function');
  });
});
