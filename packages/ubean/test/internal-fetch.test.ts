import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import {
  callInternal,
  setInternalFetcher,
  clearInternalFetcher,
  createRequestSender
} from '../src/runtime/internal-fetch';

describe('callInternal', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.get('/api/hello', (c) => c.json({ message: 'hello' }));
    app.post('/api/echo', async (c) => {
      const body = await c.req.json();
      return c.json({ received: body });
    });
    app.get('/api/user/:id', (c) => c.json({ id: c.req.param('id') }));
    app.get('/api/text', (c) => c.text('plain text'));
    app.get('/api/error', (c) => c.json({ error: 'bad' }, 400));
    app.get('/api/headers', (c) => {
      return c.json({
        'x-internal': c.req.header('x-internal-request'),
        'x-custom': c.req.header('x-custom')
      });
    });
    setInternalFetcher((req: Request) => app.fetch(req));
  });

  afterEach(() => {
    clearInternalFetcher();
  });

  it('makes GET request and parses JSON', async () => {
    const result = await callInternal<{ message: string }>('/api/hello');
    expect(result.status).toBe(200);
    expect(result.data.message).toBe('hello');
    expect(result.response).toBeInstanceOf(Response);
    expect(result.headers).toBeInstanceOf(Headers);
  });

  it('makes POST request with JSON body', async () => {
    const result = await callInternal<{ received: { name: string } }>('/api/echo', {
      method: 'POST',
      body: { name: 'test' }
    });
    expect(result.status).toBe(200);
    expect(result.data.received.name).toBe('test');
  });

  it('handles URL parameters', async () => {
    const result = await callInternal<{ id: string }>('/api/user/42');
    expect(result.data.id).toBe('42');
  });

  it('handles query parameters', async () => {
    app.get('/api/search', (c) => c.json({ q: c.req.query('q'), page: c.req.query('page') }));
    const result = await callInternal('/api/search', { query: { q: 'ubean', page: 2 } });
    expect(result.data).toEqual({ q: 'ubean', page: '2' });
  });

  it('parses text responses', async () => {
    const result = await callInternal<string>('/api/text');
    expect(result.data).toBe('plain text');
  });

  it('preserves error status codes', async () => {
    const result = await callInternal('/api/error');
    expect(result.status).toBe(400);
    expect(result.data).toEqual({ error: 'bad' });
  });

  it('sets x-internal-request header', async () => {
    const result = await callInternal('/api/headers', {
      headers: { 'x-custom': 'test' }
    });
    expect(result.data['x-internal']).toBe('1');
    expect(result.data['x-custom']).toBe('test');
  });

  it('skips parsing when parseResponse is false', async () => {
    const result = await callInternal('/api/hello', { parseResponse: false });
    expect(result.data).toBeUndefined();
    expect(result.status).toBe(200);
  });

  it('throws when fetcher not registered', async () => {
    clearInternalFetcher();
    await expect(callInternal('/api/hello')).rejects.toThrow('fetcher not registered');
  });

  it('createRequestSender creates context-aware fetcher', async () => {
    const mockC = {
      req: {
        header: (name: string) => {
          if (name === 'cookie') return 'session=abc123';
          if (name === 'authorization') return 'Bearer token123';
          return null;
        }
      },
      get: () => null
    } as any;
    const $request = createRequestSender(mockC);
    app.get('/api/cookies', (c) => {
      return c.json({
        cookie: c.req.header('cookie'),
        auth: c.req.header('authorization')
      });
    });
    const result = await $request<{ cookie: string; auth: string }>('/api/cookies');
    expect(result.data.cookie).toBe('session=abc123');
    expect(result.data.auth).toBe('Bearer token123');
  });
});
