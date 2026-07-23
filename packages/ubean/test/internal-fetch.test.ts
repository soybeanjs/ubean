import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createRequest } from '@soybeanjs/fetch';
import {
  createInternalAdapter,
  setInternalFetcher,
  clearInternalFetcher
} from '../src/runtime/internal-fetch';
import type { UbeanEnv } from '../src/types/handler';

describe('createInternalAdapter', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.get('/api/hello', c => c.json({ message: 'hello' }));
    app.post('/api/echo', async c => {
      const body = await c.req.json();
      return c.json({ received: body });
    });
    app.get('/api/user/:id', c => c.json({ id: c.req.param('id') }));
    app.get('/api/text', c => c.text('plain text'));
    app.get('/api/error', c => c.json({ error: 'bad' }, 400));
    app.get('/api/headers', c => {
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

  it('makes GET request and parses JSON via createRequest', async () => {
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.get<{ message: string }>('/api/hello');
    expect(data.message).toBe('hello');
  });

  it('makes POST request with JSON body', async () => {
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.post<{ received: { name: string } }>('/api/echo', { name: 'test' });
    expect(data.received.name).toBe('test');
  });

  it('handles URL parameters', async () => {
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.get<{ id: string }>('/api/user/42');
    expect(data.id).toBe('42');
  });

  it('handles query parameters', async () => {
    app.get('/api/search', c => c.json({ q: c.req.query('q'), page: c.req.query('page') }));
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.get<{ q: string; page: string }>('/api/search', { query: { q: 'ubean', page: 2 } });
    expect(data).toEqual({ q: 'ubean', page: '2' });
  });

  it('sets x-internal-request header', async () => {
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.get<{ 'x-internal': string; 'x-custom': string }>('/api/headers', {
      headers: { 'x-custom': 'test' }
    });
    expect(data['x-internal']).toBe('1');
    expect(data['x-custom']).toBe('test');
  });

  it('throws when fetcher not registered', async () => {
    clearInternalFetcher();
    const adapter = createInternalAdapter();
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    await expect(request.get('/api/hello')).rejects.toThrow('fetcher not registered');
  });

  it('forwards context headers (cookie, authorization)', async () => {
    const mockC = {
      req: {
        header: (name: string) => {
          if (name === 'cookie') return 'session=abc123';
          if (name === 'authorization') return 'Bearer token123';
          return null;
        }
      },
      get: () => null
    } as unknown as Context<UbeanEnv>;

    app.get('/api/cookies', c => {
      return c.json({
        cookie: c.req.header('cookie'),
        auth: c.req.header('authorization')
      });
    });

    const adapter = createInternalAdapter(mockC);
    const request = createRequest({ adapter, retry: { retries: 0 } }, { isBackendSuccess: () => true });
    const data = await request.get<{ cookie: string; auth: string }>('/api/cookies');
    expect(data.cookie).toBe('session=abc123');
    expect(data.auth).toBe('Bearer token123');
  });
});
