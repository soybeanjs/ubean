import { describe, it, expect, afterEach } from 'vitest';
import { useFetch, setDefaultFetch, clearPageData, __clearDataPayload } from '../src/index';

describe('useFetch', () => {
  afterEach(() => {
    setDefaultFetch(undefined);
    clearPageData();
    __clearDataPayload();
  });

  it('uses a duck-typed request client and inherits useAsyncData cache', async () => {
    let hits = 0;
    setDefaultFetch({
      async get<T>(url: string) {
        hits += 1;
        return { url } as T;
      }
    });
    const first = await useFetch<{ url: string }>('posts', '/api/posts');
    const second = await useFetch<{ url: string }>('posts', '/api/posts');
    expect(first.data).toEqual({ url: '/api/posts' });
    expect(second.data).toEqual({ url: '/api/posts' });
    expect(hits).toBe(1);
    expect(first.loading).toBe(false);
  });

  it('passes method/body to request()', async () => {
    const seen: unknown[] = [];
    const { data } = await useFetch('create-post', '/api/posts', {
      method: 'POST',
      body: { title: 'hi' },
      request: {
        request: async opts => {
          seen.push(opts);
          return { id: 1 };
        }
      }
    });
    expect(data).toEqual({ id: 1 });
    expect(seen[0]).toMatchObject({ url: '/api/posts', method: 'POST', data: { title: 'hi' } });
  });
});
