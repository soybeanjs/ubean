import { describe, it, expect } from 'vitest';
import { createInternalFetch, setInternalFetcher, callInternal, getInternalFetcher, clearInternalFetcher } from 'ubean';
import { getJson } from './helper';

describe('Internal fetch system', () => {
  describe('createInternalFetch()', () => {
    it('creates an internal fetch function', () => {
      const fetcher = createInternalFetch({ req: { header: () => undefined } });
      expect(typeof fetcher).toBe('function');
    });

    it('createInternalFetch with base URL', () => {
      const fetcher = createInternalFetch({ req: { header: () => undefined } }, { baseURL: 'http://localhost:9527' });
      expect(typeof fetcher).toBe('function');
    });
  });

  describe('setInternalFetcher() / getInternalFetcher()', () => {
    it('setInternalFetcher sets a custom fetcher', () => {
      setInternalFetcher((_req: Request) => {
        return Promise.resolve(new Response('ok'));
      });
      expect(getInternalFetcher()).toBeDefined();
      expect(typeof getInternalFetcher()).toBe('function');
    });

    it('clearInternalFetcher removes the fetcher', () => {
      setInternalFetcher((_req: Request) => Promise.resolve(new Response('ok')));
      clearInternalFetcher();
      expect(getInternalFetcher()).toBeNull();
    });
  });

  describe('callInternal()', () => {
    it('calls the internal fetcher and returns result', async () => {
      setInternalFetcher((_req: Request) => {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });

      const result = await callInternal('/api/test-internal');
      expect(result.status).toBe(200);
      expect(result.response).toBeInstanceOf(Response);
      expect(result.data).toEqual({ ok: true });
    });

    it('throws when no fetcher is registered', async () => {
      clearInternalFetcher();
      await expect(callInternal('/api/test')).rejects.toThrow();
    });

    it('supports POST method', async () => {
      setInternalFetcher((req: Request) => {
        expect(req.method).toBe('POST');
        return Promise.resolve(
          new Response(JSON.stringify({ created: true }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });

      const result = await callInternal('/api/create', { method: 'POST', body: { name: 'test' } });
      expect(result.status).toBe(201);
      expect(result.data).toEqual({ created: true });
    });

    it('supports query parameters', async () => {
      setInternalFetcher((req: Request) => {
        const url = new URL(req.url);
        expect(url.searchParams.get('q')).toBe('test');
        return Promise.resolve(
          new Response(JSON.stringify({ results: [] }), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });

      const result = await callInternal('/api/search', { query: { q: 'test' } });
      expect(result.data).toEqual({ results: [] });
    });
  });

  describe('HTTP integration - /api/internal-fetch-test', () => {
    it('internal fetch can call other API routes', async () => {
      const res = await getJson('/api/internal-fetch-test');
      expect(res.status).toBe(200);
    });

    it('internal fetch returns data from other routes', async () => {
      const res = await getJson('/api/internal-fetch-test');
      expect(res.status).toBe(200);
      // The endpoint should have fetched data from another API route
      expect(res.data).toBeDefined();
    });
  });
});
