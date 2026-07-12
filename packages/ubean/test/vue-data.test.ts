import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDataCacheStore,
  createUseAsyncData,
  invalidateCache,
  clearCache,
  defineDataKey,
  getInvalidatedKeysForAction
} from '../src/runtime/vue/composables';

describe('createDataCacheStore', () => {
  let store: ReturnType<typeof createDataCacheStore>;

  beforeEach(() => {
    store = createDataCacheStore();
  });

  it('stores and retrieves values', () => {
    store.set('key1', { id: 1 });
    expect(store.get('key1')).toEqual({ id: 1 });
  });

  it('returns undefined for missing keys', () => {
    expect(store.get('missing')).toBeUndefined();
  });

  it('checks key existence', () => {
    expect(store.has('key1')).toBe(false);
    store.set('key1', 'value');
    expect(store.has('key1')).toBe(true);
  });

  it('invalidates by key', () => {
    store.set('a', 1);
    store.set('b', 2);
    const count = store.invalidate('a');
    expect(count).toBe(1);
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
  });

  it('invalidates by tag', () => {
    store.set('users-list', [1, 2], ['users']);
    store.set('user-detail', { id: 1 }, ['users', 'detail']);
    store.set('posts', [3, 4], ['posts']);

    const count = store.invalidate('users');
    expect(count).toBe(2);
    expect(store.has('users-list')).toBe(false);
    expect(store.has('user-detail')).toBe(false);
    expect(store.has('posts')).toBe(true);
  });

  it('clear removes all entries', () => {
    store.set('a', 1);
    store.set('b', 2);
    store.clear();
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(false);
  });

  it('subscribe notifies on changes', () => {
    let notified = 0;
    store.subscribe(() => notified++);

    store.set('a', 1);
    expect(notified).toBe(1);

    store.invalidate('a');
    expect(notified).toBe(2);

    store.clear();
    expect(notified).toBe(3);
  });

  it('unsubscribe stops notifications', () => {
    let notified = 0;
    const unsub = store.subscribe(() => notified++);

    store.set('a', 1);
    expect(notified).toBe(1);

    unsub();
    store.set('b', 2);
    expect(notified).toBe(1);
  });

  it('getTimestamp returns set time', () => {
    const before = Date.now();
    store.set('a', 1);
    const after = Date.now();
    const ts = store.getTimestamp('a');
    expect(ts).toBeDefined();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });
});

describe('createUseAsyncData', () => {
  let store: ReturnType<typeof createDataCacheStore>;
  let useAsyncData: ReturnType<typeof createUseAsyncData>;

  beforeEach(() => {
    store = createDataCacheStore();
    useAsyncData = createUseAsyncData(store);
  });

  it('fetches data when cache is empty', async () => {
    let callCount = 0;
    const result = useAsyncData('test', async () => {
      callCount++;
      return { message: 'hello' };
    });

    expect(result.loading.value).toBe(true);
    await new Promise(r => setTimeout(r, 10));
    expect(result.loading.value).toBe(false);
    expect(result.data.value).toEqual({ message: 'hello' });
    expect(callCount).toBe(1);
  });

  it('uses cached data on subsequent calls', async () => {
    let callCount = 0;
    const _result1 = useAsyncData('cached', async () => {
      callCount++;
      return { n: callCount };
    });

    await new Promise(r => setTimeout(r, 10));
    expect(callCount).toBe(1);

    const result2 = useAsyncData('cached', async () => {
      callCount++;
      return { n: callCount };
    });

    expect(result2.data.value).toEqual({ n: 1 });
    expect(callCount).toBe(1);
  });

  it('refresh re-fetches data', async () => {
    let callCount = 0;
    const result = useAsyncData('refresh-test', async () => {
      callCount++;
      return { n: callCount };
    });

    await new Promise(r => setTimeout(r, 10));
    expect(callCount).toBe(1);

    await result.refresh();
    expect(callCount).toBe(2);
    expect(result.data.value).toEqual({ n: 2 });
  });

  it('invalidate clears cache and notifies', async () => {
    let callCount = 0;
    const result = useAsyncData('invalidate-test', async () => {
      callCount++;
      return { n: callCount };
    });

    await new Promise(r => setTimeout(r, 10));
    expect(callCount).toBe(1);

    result.invalidate();
    expect(store.has('invalidate-test')).toBe(false);
  });

  it('captures errors', async () => {
    const result = useAsyncData('error-test', async () => {
      throw new Error('Fetch failed');
    });

    expect(result.loading.value).toBe(true);
    await new Promise(r => setTimeout(r, 10));
    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeInstanceOf(Error);
    expect(result.error.value?.message).toBe('Fetch failed');
    expect(result.data.value).toBeUndefined();
  });

  it('lazy mode does not fetch immediately', () => {
    let fetched = false;
    const result = useAsyncData(
      'lazy',
      async () => {
        fetched = true;
        return 1;
      },
      { lazy: true }
    );

    expect(fetched).toBe(false);
    expect(result.loading.value).toBe(false);
  });

  it('default provides initial value', async () => {
    const result = useAsyncData(
      'with-default',
      async () => {
        await new Promise(r => setTimeout(r, 20));
        return 'loaded';
      },
      { default: () => 'initial' }
    );

    expect(result.data.value).toBe('initial');
    await new Promise(r => setTimeout(r, 30));
    expect(result.data.value).toBe('loaded');
  });

  it('transform processes fetched data', async () => {
    const result = useAsyncData(
      'transform',
      async () => {
        return { items: [1, 2, 3] };
      },
      {
        transform: (raw: unknown) => {
          const data = raw as { items: number[] };
          return data.items.length;
        }
      }
    );

    await new Promise(r => setTimeout(r, 10));
    expect(result.data.value).toBe(3);
  });

  it('supports key as symbol', async () => {
    const key = defineDataKey('symbol-key');
    const result = useAsyncData(async () => 'symbol-value', { key: key.description });

    await new Promise(r => setTimeout(r, 10));
    expect(result.data.value).toBe('symbol-value');
  });
});

describe('invalidation helpers', () => {
  let store: ReturnType<typeof createDataCacheStore>;

  beforeEach(() => {
    store = createDataCacheStore();
  });

  it('invalidateCache invalidates a key/tag', () => {
    store.set('a', 1);
    const count = invalidateCache(store, 'a');
    expect(count).toBe(1);
    expect(store.has('a')).toBe(false);
  });

  it('clearCache clears everything', () => {
    store.set('a', 1);
    store.set('b', 2);
    clearCache(store);
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(false);
  });

  it('getInvalidatedKeysForAction invalidates mapped keys', () => {
    store.set('users-list', [], ['users']);
    store.set('posts-list', [], ['posts']);

    const count = getInvalidatedKeysForAction(
      'createUser',
      {
        createUser: ['users'],
        createPost: ['posts']
      },
      store
    );

    expect(count).toBe(1);
    expect(store.has('users-list')).toBe(false);
    expect(store.has('posts-list')).toBe(true);
  });

  it('defineDataKey returns consistent symbols', () => {
    const k1 = defineDataKey('test');
    const k2 = defineDataKey('test');
    expect(k1).toBe(k2);
  });
});
