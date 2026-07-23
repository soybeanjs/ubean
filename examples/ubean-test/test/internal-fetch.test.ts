import { describe, it, expect } from 'vitest';
import { createInternalFetch, setInternalFetcher, getInternalFetcher, clearInternalFetcher } from 'ubean';
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
