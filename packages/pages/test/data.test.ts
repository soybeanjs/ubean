import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  useData,
  useAsyncData,
  clearDataCache,
  invalidateData,
  __clearDataPayload,
  __resolveDataPayload,
  __serializeDataPayload,
  __resetDataPayloadCache,
  DATA_PAYLOAD_ID
} = await import('../src/data');

// ============== Backward compatibility ==============

describe('useData() — backward compatibility', () => {
  beforeEach(() => {
    clearDataCache();
    __clearDataPayload();
  });

  it('returns fetched data with loading=false', async () => {
    const result = await useData({
      key: 'basic-test',
      fetcher: async () => ({ value: 'hello' })
    });
    expect(result.data).toEqual({ value: 'hello' });
    expect(result.loading).toBe(false);
    expect(result.error).toBeNull();
    expect(result.timestamp).toBeDefined();
  });

  it('caches data — subsequent calls do not invoke fetcher', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { count: fetchCount };
    };
    const r1 = await useData({ key: 'cache-test', fetcher });
    const r2 = await useData({ key: 'cache-test', fetcher });
    expect(fetchCount).toBe(1);
    expect(r1.data).toEqual(r2.data);
  });

  it('returns error when fetcher throws', async () => {
    const result = await useData({
      key: 'error-test',
      fetcher: async () => {
        throw new Error('fetch failed');
      }
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('fetch failed');
    expect(result.data).toBeUndefined();
    expect(result.loading).toBe(false);
  });

  it('result has invalidate() function', async () => {
    const result = await useData({
      key: 'invalidate-fn-test',
      fetcher: async () => 'data'
    });
    expect(typeof result.invalidate).toBe('function');
  });

  it('cache hit returns same data reference', async () => {
    const r1 = await useData({
      key: 'ref-test',
      fetcher: async () => ({ value: 'same' })
    });
    const r2 = await useData({
      key: 'ref-test',
      fetcher: async () => ({ value: 'different' })
    });
    expect(r2.data).toBe(r1.data); // same reference (cached)
  });
});

// ============== New fields: pending / status / refresh ==============

describe('useData() — new fields (pending/status/refresh)', () => {
  beforeEach(() => {
    clearDataCache();
    __clearDataPayload();
  });

  it('returns pending=false after await', async () => {
    const result = await useData({
      key: 'pending-test',
      fetcher: async () => 'data'
    });
    expect(result.pending).toBe(false);
  });

  it('returns status="success" on success', async () => {
    const result = await useData({
      key: 'status-success',
      fetcher: async () => 'ok'
    });
    expect(result.status).toBe('success');
  });

  it('returns status="error" on failure', async () => {
    const result = await useData({
      key: 'status-error',
      fetcher: async () => {
        throw new Error('boom');
      }
    });
    expect(result.status).toBe('error');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('refresh() forces re-fetch, bypassing cache', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { count: fetchCount };
    };
    const result = await useData({ key: 'refresh-test', fetcher });
    expect(fetchCount).toBe(1);
    expect(result.data).toEqual({ count: 1 });

    await result.refresh();

    expect(fetchCount).toBe(2);
    expect(result.data).toEqual({ count: 2 });
    expect(result.status).toBe('success');
    expect(result.pending).toBe(false);
  });

  it('refresh() updates the same result object in place', async () => {
    const fetcher = async () => ({ value: Math.random() });
    const result = await useData({ key: 'refresh-inplace', fetcher });
    const originalData = result.data;

    await result.refresh();

    expect(result.data).not.toBe(originalData);
    // result is the same object reference
    expect(typeof result.refresh).toBe('function');
  });

  it('refresh() sets status=error on fetcher failure', async () => {
    let shouldFail = false;
    const fetcher = async () => {
      if (shouldFail) throw new Error('refresh failed');
      return 'ok';
    };
    const result = await useData({ key: 'refresh-error', fetcher });
    shouldFail = true;

    await result.refresh();

    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('refresh failed');
    expect(result.data).toBeUndefined();
  });
});

// ============== Dedupe ==============

describe('useData() — dedupe', () => {
  beforeEach(() => {
    clearDataCache();
    __clearDataPayload();
  });

  it('concurrent calls with same key share one fetcher invocation', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      // simulate async work so the second call arrives while first is in-flight
      await new Promise(r => setTimeout(r, 10));
      return { count: fetchCount };
    };

    const [r1, r2] = await Promise.all([
      useData({ key: 'dedupe-concurrent', fetcher }),
      useData({ key: 'dedupe-concurrent', fetcher })
    ]);

    expect(fetchCount).toBe(1);
    expect(r1.data).toEqual({ count: 1 });
    expect(r2.data).toEqual({ count: 1 });
  });

  it('dedupe disabled — concurrent calls each invoke fetcher', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      await new Promise(r => setTimeout(r, 10));
      return { count: fetchCount };
    };

    const [r1, r2] = await Promise.all([
      useData({ key: 'dedupe-disabled', fetcher, dedupe: false }),
      useData({ key: 'dedupe-disabled', fetcher, dedupe: false })
    ]);

    expect(fetchCount).toBe(2);
    // Both resolved; last writer wins the cache entry
    expect(r1.data).toBeDefined();
    expect(r2.data).toBeDefined();
  });

  it('sequential calls (after first resolves) use cache, not dedupe', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { count: fetchCount };
    };

    const r1 = await useData({ key: 'dedupe-sequential', fetcher });
    const r2 = await useData({ key: 'dedupe-sequential', fetcher });

    expect(fetchCount).toBe(1);
    expect(r2.data).toBe(r1.data); // same cached reference
  });

  it('dedupe default is true (no explicit option)', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      await new Promise(r => setTimeout(r, 10));
      return fetchCount;
    };

    await Promise.all([useData({ key: 'dedupe-default', fetcher }), useData({ key: 'dedupe-default', fetcher })]);

    expect(fetchCount).toBe(1);
  });
});

// ============== useAsyncData ==============

describe('useAsyncData()', () => {
  beforeEach(() => {
    clearDataCache();
    __clearDataPayload();
  });

  it('accepts (key, fn, options) signature and returns DataResult', async () => {
    const result = await useAsyncData('posts', async () => [{ id: 1, title: 'Hello' }], { ttl: 60_000 });

    expect(result.data).toEqual([{ id: 1, title: 'Hello' }]);
    expect(result.status).toBe('success');
    expect(result.pending).toBe(false);
    expect(typeof result.refresh).toBe('function');
  });

  it('dedupes by key (same as useData)', async () => {
    let fetchCount = 0;
    const fn = async () => {
      fetchCount++;
      await new Promise(r => setTimeout(r, 10));
      return fetchCount;
    };

    const [r1, r2] = await Promise.all([useAsyncData('dedupe-async', fn), useAsyncData('dedupe-async', fn)]);

    expect(fetchCount).toBe(1);
    expect(r1.data).toBe(1);
    expect(r2.data).toBe(1);
  });

  it('refresh() works on useAsyncData result', async () => {
    let count = 0;
    const fn = async () => ++count;

    const result = await useAsyncData('refresh-async', fn);
    expect(result.data).toBe(1);

    await result.refresh();
    expect(result.data).toBe(2);
  });

  it('options are optional', async () => {
    const result = await useAsyncData('no-opts', async () => 42);
    expect(result.data).toBe(42);
  });

  it('supports tags option', async () => {
    await useAsyncData('tagged', async () => 'data', { tags: ['my-tag'] });
    const invalidated = invalidateData('my-tag');
    expect(invalidated).toBeGreaterThanOrEqual(1);
  });
});

// ============== SSR payload registry ==============

describe('SSR payload registry', () => {
  beforeEach(() => {
    clearDataCache();
    __clearDataPayload();
  });

  it('useData registers payload on SSR (string key)', async () => {
    // Default test env has no window → SSR path
    await useData({
      key: 'ssr-payload-test',
      fetcher: async () => ({ value: 'ssr-data' })
    });

    const payload = __resolveDataPayload();
    expect(payload['ssr-payload-test']).toBeDefined();
    expect(payload['ssr-payload-test'].data).toEqual({ value: 'ssr-data' });
    expect(payload['ssr-payload-test'].error).toBeNull();
    expect(payload['ssr-payload-test'].timestamp).toBeDefined();
  });

  it('useData registers error payload on SSR failure', async () => {
    await useData({
      key: 'ssr-error-payload',
      fetcher: async () => {
        throw new Error('ssr fail');
      }
    });

    const payload = __resolveDataPayload();
    expect(payload['ssr-error-payload']).toBeDefined();
    expect(payload['ssr-error-payload'].error).toBe('ssr fail');
    expect(payload['ssr-error-payload'].data).toBeUndefined();
  });

  it('useData does NOT register payload for symbol keys (not serializable)', async () => {
    const symKey = Symbol('test-symbol');
    await useData({
      key: symKey,
      fetcher: async () => 'symbol-data'
    });

    const payload = __resolveDataPayload();
    // Symbol keys can't be payload keys (not serializable to string)
    expect(Object.keys(payload).length).toBe(0);
  });

  it('__clearDataPayload clears the registry', async () => {
    await useData({
      key: 'clear-test',
      fetcher: async () => 'data'
    });
    expect(Object.keys(__resolveDataPayload()).length).toBe(1);

    __clearDataPayload();
    expect(Object.keys(__resolveDataPayload()).length).toBe(0);
  });

  it('refresh() registers new payload on SSR', async () => {
    let count = 0;
    const result = await useData({
      key: 'refresh-payload',
      fetcher: async () => ++count
    });

    __clearDataPayload();
    await result.refresh();

    const payload = __resolveDataPayload();
    expect(payload['refresh-payload']).toBeDefined();
    expect(payload['refresh-payload'].data).toBe(2);
  });
});

describe('__serializeDataPayload()', () => {
  beforeEach(() => {
    __clearDataPayload();
  });

  it('empty payload returns empty string', () => {
    expect(__serializeDataPayload(__resolveDataPayload())).toBe('');
  });

  it('non-empty payload generates script tag', async () => {
    await useData({
      key: 'serialize-test',
      fetcher: async () => ({ hello: 'world' })
    });

    const html = __serializeDataPayload(__resolveDataPayload());
    expect(html).toContain(`id="${DATA_PAYLOAD_ID}"`);
    expect(html).toContain('type="application/json"');
    expect(html).toContain('"serialize-test"');
    expect(html).toContain('"hello":"world"');
  });

  it('escapes HTML special characters in data', async () => {
    await useData({
      key: 'escape-test',
      fetcher: async () => ({ html: '<script>alert(1)</script>' })
    });

    const html = __serializeDataPayload(__resolveDataPayload());
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('\\u003c');
  });
});

// ============== Client hydration ==============

describe('useData() — client hydration from payload', () => {
  let originalWindow: typeof globalThis | undefined;
  let originalDocument: Document | undefined;

  beforeEach(() => {
    __clearDataPayload();
    __resetDataPayloadCache();
    clearDataCache();
    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;
    // Simulate client environment
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
    // 清理 SSG 注入的全局 payload(Task 3)
    delete (globalThis as any).__UBEAN_DATA_PAYLOAD__;
    __resetDataPayloadCache();
  });

  function mockDocument(payloadJson: string | null) {
    const scriptEl = { textContent: payloadJson };
    (globalThis as any).document = {
      getElementById: vi.fn((id: string) => (id === DATA_PAYLOAD_ID && payloadJson ? scriptEl : null))
    };
  }

  it('client hydrates from __UBEAN_DATA__ without calling fetcher', async () => {
    mockDocument(
      JSON.stringify({
        'hydrate-key': {
          data: { value: 'hydrated' },
          error: null,
          timestamp: Date.now()
        }
      })
    );

    let fetchCount = 0;
    const result = await useData({
      key: 'hydrate-key',
      fetcher: async () => {
        fetchCount++;
        return { value: 'should-not-fetch' };
      }
    });

    expect(fetchCount).toBe(0); // no fetcher call, used payload
    expect(result.data).toEqual({ value: 'hydrated' });
    expect(result.status).toBe('success');
    expect(result.pending).toBe(false);
  });

  it('client fetches normally when payload is missing for key', async () => {
    mockDocument(
      JSON.stringify({
        'other-key': { data: 'other', error: null, timestamp: Date.now() }
      })
    );

    let fetchCount = 0;
    const result = await useData({
      key: 'missing-key',
      fetcher: async () => {
        fetchCount++;
        return 'fetched';
      }
    });

    expect(fetchCount).toBe(1);
    expect(result.data).toBe('fetched');
  });

  it('client fetches normally when no payload script exists', async () => {
    mockDocument(null);

    let fetchCount = 0;
    const result = await useData({
      key: 'no-payload',
      fetcher: async () => {
        fetchCount++;
        return 'fetched';
      }
    });

    expect(fetchCount).toBe(1);
    expect(result.data).toBe('fetched');
  });

  it('client does NOT hydrate from error payload (re-fetches instead)', async () => {
    mockDocument(
      JSON.stringify({
        'error-payload': {
          data: undefined,
          error: 'ssr error',
          timestamp: Date.now()
        }
      })
    );

    let fetchCount = 0;
    const result = await useData({
      key: 'error-payload',
      fetcher: async () => {
        fetchCount++;
        return 'recovered';
      }
    });

    expect(fetchCount).toBe(1); // re-fetched because payload had error
    expect(result.data).toBe('recovered');
  });

  it('payload cache is read once (subsequent calls use data cache)', async () => {
    const getElementById = vi.fn(() => ({
      textContent: JSON.stringify({
        'cache-once': { data: 'cached', error: null, timestamp: Date.now() }
      })
    }));
    (globalThis as any).document = { getElementById };

    await useData({ key: 'cache-once', fetcher: async () => 'x' });
    await useData({ key: 'cache-once', fetcher: async () => 'x' });

    // DOM read only once; second call hit data cache
    expect(getElementById).toHaveBeenCalledTimes(1);
  });

  it('symbol keys are not hydrated from payload (fetch normally on client)', async () => {
    mockDocument(
      JSON.stringify({
        'some-string': { data: 'x', error: null, timestamp: Date.now() }
      })
    );

    let fetchCount = 0;
    const symKey = Symbol('client-sym');
    const result = await useData({
      key: symKey,
      fetcher: async () => {
        fetchCount++;
        return 'sym-fetched';
      }
    });

    expect(fetchCount).toBe(1);
    expect(result.data).toBe('sym-fetched');
  });

  it('useAsyncData also hydrates from payload on client', async () => {
    mockDocument(
      JSON.stringify({
        'async-hydrate': {
          data: { posts: [1, 2, 3] },
          error: null,
          timestamp: Date.now()
        }
      })
    );

    let fetchCount = 0;
    const result = await useAsyncData('async-hydrate', async () => {
      fetchCount++;
      return { posts: [] };
    });

    expect(fetchCount).toBe(0);
    expect(result.data).toEqual({ posts: [1, 2, 3] });
  });

  // ============== Task 3: __UBEAN_DATA_PAYLOAD__ 全局变量路径 ==============

  it('client hydrates from globalThis.__UBEAN_DATA_PAYLOAD__ as a Promise (SSG mode)', async () => {
    // SSG 场景:引导脚本设置全局为 fetch(...).then(r => r.json()),
    // 因此是一个 Promise<payload>
    (globalThis as any).__UBEAN_DATA_PAYLOAD__ = Promise.resolve({
      'ssg-promise-key': {
        data: { value: 'from-promise' },
        error: null,
        timestamp: Date.now()
      }
    });

    let fetchCount = 0;
    const result = await useData({
      key: 'ssg-promise-key',
      fetcher: async () => {
        fetchCount++;
        return { value: 'should-not-fetch' };
      }
    });

    expect(fetchCount).toBe(0); // 没调 fetcher,使用了全局 Promise
    expect(result.data).toEqual({ value: 'from-promise' });
    expect(result.status).toBe('success');
  });

  it('client hydrates from globalThis.__UBEAN_DATA_PAYLOAD__ as a plain object', async () => {
    // SSG 场景:全局也可能是已解析的对象(例如同步注入或测试场景)
    (globalThis as any).__UBEAN_DATA_PAYLOAD__ = {
      'ssg-object-key': {
        data: { count: 42 },
        error: null,
        timestamp: Date.now()
      }
    };

    let fetchCount = 0;
    const result = await useData({
      key: 'ssg-object-key',
      fetcher: async () => {
        fetchCount++;
        return { count: 0 };
      }
    });

    expect(fetchCount).toBe(0);
    expect(result.data).toEqual({ count: 42 });
    expect(result.status).toBe('success');
  });

  it('client falls back to fetcher when __UBEAN_DATA_PAYLOAD__ Promise rejects', async () => {
    // SSG 场景:fetch __data.json 失败时 Promise rejects,客户端应降级到 fetcher
    (globalThis as any).__UBEAN_DATA_PAYLOAD__ = Promise.reject(new Error('network'));

    let fetchCount = 0;
    const result = await useData({
      key: 'ssg-rejected-key',
      fetcher: async () => {
        fetchCount++;
        return 'fallback';
      }
    });

    expect(fetchCount).toBe(1); // Promise reject → 降级到 fetcher
    expect(result.data).toBe('fallback');
    expect(result.status).toBe('success');
  });
});
