import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 在导入被测模块前设置环境
// SSR 模式: typeof window === 'undefined'
// Client 模式: 需要模拟 window + document

const {
  defer,
  isDeferredValue,
  useDeferredData,
  __registerDeferred,
  __resolveDeferred,
  __clearDeferred,
  __serializeDeferred,
  __resetDeferredCache,
  DEFERRED_DATA_ID
} = await import('../src/defer');

describe('defer()', () => {
  it('从 factory 函数创建 DeferredValue', () => {
    const factory = () => Promise.resolve(42);
    const deferred = defer(factory);
    expect(deferred.__isDeferred).toBe(true);
    expect(typeof deferred.factory).toBe('function');
  });

  it('从 Promise 创建 DeferredValue', () => {
    const promise = Promise.resolve('hello');
    const deferred = defer(promise);
    expect(deferred.__isDeferred).toBe(true);
    expect(typeof deferred.factory).toBe('function');
  });

  it('factory 返回原始 Promise', async () => {
    const deferred = defer(() => Promise.resolve(42));
    const result = await deferred.factory();
    expect(result).toBe(42);
  });

  it('factory 从已有 Promise 返回值', async () => {
    const promise = Promise.resolve('value');
    const deferred = defer(promise);
    const result = await deferred.factory();
    expect(result).toBe('value');
  });
});

describe('isDeferredValue()', () => {
  it('识别 DeferredValue', () => {
    expect(isDeferredValue(defer(() => Promise.resolve()))).toBe(true);
  });

  it('拒绝普通对象', () => {
    expect(isDeferredValue({})).toBe(false);
    expect(isDeferredValue(null)).toBe(false);
    expect(isDeferredValue(undefined)).toBe(false);
    expect(isDeferredValue(42)).toBe(false);
    expect(isDeferredValue('string')).toBe(false);
  });

  it('拒绝缺少 __isDeferred 的对象', () => {
    expect(isDeferredValue({ factory: () => Promise.resolve() })).toBe(false);
  });
});

describe('SSR 内部:注册表', () => {
  beforeEach(() => {
    __clearDeferred();
  });

  it('__registerDeferred + __resolveDeferred:解析已注册的 promise', async () => {
    __registerDeferred('key1', Promise.resolve('value1'));
    __registerDeferred('key2', Promise.resolve(42));

    const results = await __resolveDeferred();
    expect(results.key1).toBe('value1');
    expect(results.key2).toBe(42);
  });

  it('__resolveDeferred:空注册表返回空对象', async () => {
    const results = await __resolveDeferred();
    expect(results).toEqual({});
  });

  it('__resolveDeferred:失败的 promise 以 __deferredError 形式返回', async () => {
    __registerDeferred('fail', Promise.reject(new Error('boom')));
    __registerDeferred('ok', Promise.resolve('ok'));

    const results = await __resolveDeferred();
    expect(results.ok).toBe('ok');
    expect(results.fail).toEqual({ __deferredError: 'boom' });
  });

  it('__resolveDeferred:非 Error 的 reject 值转为字符串', async () => {
    __registerDeferred('fail', Promise.reject('string error'));

    const results = await __resolveDeferred();
    expect(results.fail).toEqual({ __deferredError: 'string error' });
  });

  it('__clearDeferred:清空注册表', async () => {
    __registerDeferred('key1', Promise.resolve('value1'));
    __clearDeferred();
    const results = await __resolveDeferred();
    expect(results).toEqual({});
  });

  it('__resolveDeferred:对象和数组数据正确序列化', async () => {
    __registerDeferred('users', Promise.resolve([{ id: 1, name: 'Alice' }]));
    __registerDeferred('meta', Promise.resolve({ total: 1, page: 1 }));

    const results = await __resolveDeferred();
    expect(results.users).toEqual([{ id: 1, name: 'Alice' }]);
    expect(results.meta).toEqual({ total: 1, page: 1 });
  });
});

describe('__serializeDeferred()', () => {
  it('空对象返回空字符串', () => {
    expect(__serializeDeferred({})).toBe('');
  });

  it('有数据时生成 script 标签', () => {
    const html = __serializeDeferred({ key: 'value' });
    expect(html).toContain(`id="${DEFERRED_DATA_ID}"`);
    expect(html).toContain('type="application/json"');
    expect(html).toContain('"key":"value"');
  });

  it('转义 HTML 特殊字符', () => {
    const html = __serializeDeferred({ html: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('\\u003c');
  });
});

describe('useDeferredData() — SSR 路径', () => {
  beforeEach(() => {
    __clearDeferred();
  });

  it('SSR: 注册 promise,返回 pending=true, data=undefined', () => {
    // window 未定义 → SSR 路径
    const { data, pending, error } = useDeferredData(
      'test',
      defer(() => Promise.resolve(42))
    );

    expect(pending.value).toBe(true);
    expect(data.value).toBe(undefined);
    expect(error.value).toBe(null);
  });

  it('SSR: 注册后 __resolveDeferred 能解析到数据', async () => {
    useDeferredData(
      'ssr-key',
      defer(() => Promise.resolve('ssr-value'))
    );

    const results = await __resolveDeferred();
    expect(results['ssr-key']).toBe('ssr-value');
  });
});

describe('useDeferredData() — 客户端路径', () => {
  let originalWindow: typeof globalThis | undefined;
  let originalDocument: Document | undefined;

  beforeEach(() => {
    __clearDeferred();
    __resetDeferredCache();
    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;

    // 模拟客户端环境
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    // 恢复原始环境
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
    __resetDeferredCache();
  });

  function mockDocument(deferredJson: string | null) {
    const scriptEl = {
      textContent: deferredJson,
      getElementById: vi.fn(),
      querySelector: vi.fn()
    };
    (globalThis as any).document = {
      getElementById: vi.fn((id: string) => (id === DEFERRED_DATA_ID && deferredJson ? scriptEl : null))
    };
  }

  it('客户端水合: 从 DOM 读取已解析数据,立即显示', () => {
    mockDocument(JSON.stringify({ comments: [{ id: 1, text: 'hello' }] }));

    const { data, pending, error } = useDeferredData(
      'comments',
      defer(() => Promise.resolve())
    );

    expect(pending.value).toBe(false);
    expect(data.value).toEqual([{ id: 1, text: 'hello' }]);
    expect(error.value).toBe(null);
  });

  it('客户端水合: 错误数据设置 error', () => {
    mockDocument(JSON.stringify({ fail: { __deferredError: 'fetch failed' } }));

    const { data, pending, error } = useDeferredData(
      'fail',
      defer(() => Promise.resolve())
    );

    expect(pending.value).toBe(false);
    expect(data.value).toBe(undefined);
    expect(error.value).toBeInstanceOf(Error);
    expect(error.value?.message).toBe('fetch failed');
  });

  it('客户端水合: 缓存数据后后续调用不重新读取 DOM', () => {
    const getElementById = vi.fn(() => ({
      textContent: JSON.stringify({ cached: 'data' })
    }));
    (globalThis as any).document = { getElementById };

    useDeferredData(
      'cached',
      defer(() => Promise.resolve())
    );
    useDeferredData(
      'other',
      defer(() => Promise.resolve())
    );

    // 第二次调用应该使用缓存,不再次访问 DOM
    expect(getElementById).toHaveBeenCalledTimes(1);
  });

  it('客户端导航: 无缓存数据时调用 factory 获取', async () => {
    mockDocument(null);

    const factory = vi.fn(() => Promise.resolve('fresh-data'));
    const { data, pending, error } = useDeferredData('nav-key', defer(factory));

    expect(pending.value).toBe(true);
    expect(data.value).toBe(undefined);

    // 等待 promise 解析
    await vi.waitFor(() => {
      expect(pending.value).toBe(false);
    });

    expect(data.value).toBe('fresh-data');
    expect(error.value).toBe(null);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('客户端导航: factory 失败时设置 error', async () => {
    mockDocument(null);

    const { data, pending, error } = useDeferredData(
      'fail-nav',
      defer(() => Promise.reject(new Error('network error')))
    );

    await vi.waitFor(() => {
      expect(pending.value).toBe(false);
    });

    expect(data.value).toBe(undefined);
    expect(error.value).toBeInstanceOf(Error);
    expect(error.value?.message).toBe('network error');
  });
});
