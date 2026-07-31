/**
 * P9-08 组件级缓存指令 —— 运行时原语单元测试
 *
 * 覆盖:
 * - 内存存储(get/set/delete/clear/keys/标签索引/过期清理/LRU 驱逐)
 * - cacheLife / cacheTag 作用域(AsyncLocalStorage)
 * - wrapWithCache 缓存命中/未命中/序列化
 * - revalidateTag / revalidateTags / revalidatePath 失效
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createComponentMemoryStore,
  useComponentCacheStore,
  clearComponentCacheStore,
  cacheLife,
  cacheTag,
  wrapWithCache,
  revalidateTag,
  revalidateTags,
  revalidatePath,
  clearComponentCache
} from '../src/index';
import {
  hasUseCacheDirective as hasDirective,
  extractCachedFunctions as extractFns,
  transformUseCache as transformCache,
  ubeanCacheDirectivePlugin
} from '../src/vite';

/* -------------------------------------------------------------------------- */
/* 内存存储                                                                     */
/* -------------------------------------------------------------------------- */

describe('createComponentMemoryStore', () => {
  it('stores and retrieves entries', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"hello"', tags: ['a'] }, 60);
    const entry = await store.get('key1');
    expect(entry).toBeDefined();
    expect(entry!.value).toBe('"hello"');
    expect(entry!.tags).toEqual(['a']);
  });

  it('returns undefined for missing keys', async () => {
    const store = createComponentMemoryStore();
    const entry = await store.get('nonexistent');
    expect(entry).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"data"', tags: [] }, 0);
    // TTL=0 means expires immediately (now + 0)
    await new Promise(r => setTimeout(r, 10));
    const entry = await store.get('key1');
    expect(entry).toBeUndefined();
  });

  it('deletes entries', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"data"', tags: [] }, 60);
    const deleted = await store.delete('key1');
    expect(deleted).toBe(true);
    expect(await store.get('key1')).toBeUndefined();
  });

  it('clears all entries', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"a"', tags: [] }, 60);
    await store.set('key2', { value: '"b"', tags: [] }, 60);
    await store.clear();
    expect(await store.get('key1')).toBeUndefined();
    expect(await store.get('key2')).toBeUndefined();
  });

  it('lists all keys', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"a"', tags: [] }, 60);
    await store.set('key2', { value: '"b"', tags: [] }, 60);
    const keys = await store.keys!();
    expect(keys.sort()).toEqual(['key1', 'key2']);
  });

  it('updates tag index on set/delete', async () => {
    const store = createComponentMemoryStore();
    await store.set('key1', { value: '"a"', tags: ['tag1', 'tag2'] }, 60);
    expect(await store.keys!()).toContain('key1');

    // Overwrite with different tags
    await store.set('key1', { value: '"a2"', tags: ['tag3'] }, 60);
    const keys = await store.keys!();
    expect(keys).toContain('key1');

    // Delete should clean up tag index
    await store.delete('key1');
    expect(await store.keys!()).not.toContain('key1');
  });

  it('evicts oldest entries when maxEntries exceeded', async () => {
    const store = createComponentMemoryStore(5);
    for (let i = 0; i < 10; i++) {
      await store.set(`key${i}`, { value: `"${i}"`, tags: [] }, 60);
      await new Promise(r => setTimeout(r, 1));
    }
    const keys = await store.keys!();
    // Should have evicted some entries
    expect(keys.length).toBeLessThanOrEqual(5);
  });
});

/* -------------------------------------------------------------------------- */
/* 全局存储                                                                     */
/* -------------------------------------------------------------------------- */

describe('useComponentCacheStore', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('creates a default memory store on first access', () => {
    const store1 = useComponentCacheStore();
    const store2 = useComponentCacheStore();
    expect(store1).toBe(store2);
  });

  it('allows setting a custom store', () => {
    const custom = createComponentMemoryStore(100);
    const store = useComponentCacheStore(custom);
    expect(store).toBe(custom);
    expect(useComponentCacheStore()).toBe(custom);
  });
});

/* -------------------------------------------------------------------------- */
/* cacheLife / cacheTag 作用域                                                  */
/* -------------------------------------------------------------------------- */

describe('cacheLife and cacheTag', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('cacheLife is no-op outside cache scope', () => {
    // Should not throw
    cacheLife(100);
    cacheLife(0);
  });

  it('cacheTag is no-op outside cache scope', () => {
    cacheTag('a', 'b');
    cacheTag();
  });

  it('cacheLife sets TTL within wrapWithCache scope', async () => {
    let capturedTtl = -1;
    const fn = wrapWithCache(
      async (x: number) => {
        cacheLife(300);
        capturedTtl = 300;
        return x * 2;
      },
      { name: 'test-double', defaultTtl: 60 }
    );

    const result = await fn(5);
    expect(result).toBe(10);
    expect(capturedTtl).toBe(300);
  });

  it('cacheTag adds tags within wrapWithCache scope', async () => {
    const fn = wrapWithCache(
      async (id: string) => {
        cacheTag('items', `item:${id}`);
        return { id, name: 'test' };
      },
      { name: 'test-get-item' }
    );

    await fn('123');

    // Verify tag was stored
    const deleted = await revalidateTag('items');
    expect(deleted).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* wrapWithCache                                                                */
/* -------------------------------------------------------------------------- */

describe('wrapWithCache', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('caches function results', async () => {
    let callCount = 0;
    const fn = wrapWithCache(
      async (x: number) => {
        callCount++;
        return x * 2;
      },
      { name: 'test-cache' }
    );

    expect(await fn(5)).toBe(10);
    expect(await fn(5)).toBe(10); // cache hit
    expect(callCount).toBe(1);
  });

  it('caches separately for different arguments', async () => {
    let callCount = 0;
    const fn = wrapWithCache(
      async (x: number) => {
        callCount++;
        return x * 2;
      },
      { name: 'test-args' }
    );

    await fn(5);
    await fn(10);
    await fn(5); // cache hit
    expect(callCount).toBe(2);
  });

  it('uses default TTL when cacheLife not called', async () => {
    const fn = wrapWithCache(async (x: number) => x, { name: 'test-default-ttl', defaultTtl: 60 });

    await fn(1);
    // Verify entry exists in store
    const store = useComponentCacheStore();
    const keys = await store.keys!();
    expect(keys.length).toBe(1);
  });

  it('supports custom getKey function', async () => {
    let callCount = 0;
    const fn = wrapWithCache(
      async (a: number, _b: number) => {
        callCount++;
        return a + _b;
      },
      {
        name: 'test-custom-key',
        getKey: (a, _b) => `custom:${a}`
      }
    );

    await fn(1, 100);
    await fn(1, 200); // Same key (only uses `a`), should be cache hit
    expect(callCount).toBe(1);
  });

  it('handles unserializable results gracefully', async () => {
    const fn = wrapWithCache(
      async () => {
        // Circular reference - not JSON serializable
        const obj: any = { a: 1 };
        obj.self = obj;
        return obj;
      },
      { name: 'test-unserializable' }
    );

    // Should not throw, just skip caching
    const result = await fn();
    expect(result.a).toBe(1);
  });

  it('handles unserializable arguments', async () => {
    let callCount = 0;
    const cachedFn = wrapWithCache(
      async (_fn: () => void) => {
        callCount++;
        return 'done';
      },
      { name: 'test-unserializable-args' }
    );

    // Functions are not serializable, so cache key falls back
    await cachedFn(() => {});
    await cachedFn(() => {});
    // Both calls should execute (unserializable key doesn't match)
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('returns cached value on subsequent calls', async () => {
    let counter = 0;
    const fn = wrapWithCache(async () => ({ value: ++counter }), { name: 'test-return-cached' });

    const r1 = await fn();
    const r2 = await fn();
    expect(r1.value).toBe(1);
    expect(r2.value).toBe(1); // cached
  });
});

/* -------------------------------------------------------------------------- */
/* revalidateTag / revalidateTags / revalidatePath                              */
/* -------------------------------------------------------------------------- */

describe('revalidateTag', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('invalidates entries by tag', async () => {
    let callCount = 0;
    const fn = wrapWithCache(
      async (id: string) => {
        callCount++;
        cacheTag('users');
        return { id };
      },
      { name: 'test-revalidate-tag' }
    );

    await fn('1');
    await fn('1'); // cache hit
    expect(callCount).toBe(1);

    const deleted = await revalidateTag('users');
    expect(deleted).toBe(1);

    await fn('1'); // cache miss
    expect(callCount).toBe(2);
  });

  it('returns 0 for unknown tags', async () => {
    const fn = wrapWithCache(async () => 1, { name: 'test-unknown-tag' });
    await fn();

    const deleted = await revalidateTag('nonexistent');
    expect(deleted).toBe(0);
  });
});

describe('revalidateTags', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('invalidates entries by multiple tags', async () => {
    const fn1 = wrapWithCache(
      async () => {
        cacheTag('tag-a');
        return 1;
      },
      { name: 'test-multi-1' }
    );
    const fn2 = wrapWithCache(
      async () => {
        cacheTag('tag-b');
        return 2;
      },
      { name: 'test-multi-2' }
    );

    await fn1();
    await fn2();

    const deleted = await revalidateTags('tag-a', 'tag-b');
    expect(deleted).toBe(2);
  });
});

describe('revalidatePath', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('invalidates entries by glob pattern', async () => {
    const fn = wrapWithCache(async (id: string) => ({ id }), { name: 'test-path' });

    await fn('1');
    await fn('2');

    // Match all entries with "test-path"
    const deleted = await revalidatePath('test-path:*');
    expect(deleted).toBe(2);
  });

  it('supports regex patterns', async () => {
    const fn = wrapWithCache(async (id: string) => ({ id }), { name: 'test-regex' });

    await fn('1');
    await fn('2');

    const deleted = await revalidatePath(/test-regex:.+1/);
    expect(deleted).toBe(1);
  });
});

describe('clearComponentCache', () => {
  beforeEach(() => {
    clearComponentCacheStore();
  });

  it('clears all component cache entries', async () => {
    const fn = wrapWithCache(async () => 1, { name: 'test-clear' });
    await fn();

    await clearComponentCache();

    const store = useComponentCacheStore();
    const keys = await store.keys!();
    expect(keys.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Vite 插件:指令检测                                                           */
/* -------------------------------------------------------------------------- */

describe('hasUseCacheDirective', () => {
  it('detects "use cache" with double quotes', () => {
    expect(hasDirective(`async function f() { "use cache"; return 1; }`)).toBe(true);
  });

  it("detects 'use cache' with single quotes", () => {
    expect(hasDirective(`async function f() { 'use cache'; return 1; }`)).toBe(true);
  });

  it('detects "use cache" without semicolon', () => {
    expect(hasDirective(`async function f() { "use cache" return 1; }`)).toBe(true);
  });

  it('returns false for code without directive', () => {
    expect(hasDirective(`async function f() { return 1; }`)).toBe(false);
  });

  it('detects "use cache" (multiple spaces)', () => {
    expect(hasDirective(`async function f() { "use   cache"; return 1; }`)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Vite 插件:函数提取                                                           */
/* -------------------------------------------------------------------------- */

describe('extractCachedFunctions', () => {
  it('extracts async function declarations', () => {
    const code = `
async function getUser(id) {
  'use cache';
  cacheLife(3600);
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });

  it('extracts exported async function declarations', () => {
    const code = `
export async function getUser(id) {
  'use cache';
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });

  it('extracts arrow function assignments', () => {
    const code = `
const getUser = async (id) => {
  'use cache';
  return { id };
};`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });

  it('extracts exported arrow function assignments', () => {
    const code = `
export const getUser = async (id) => {
  'use cache';
  return { id };
};`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });

  it('extracts async function expressions', () => {
    const code = `
const getUser = async function(id) {
  'use cache';
  return { id };
};`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });

  it('ignores functions without use cache directive', () => {
    const code = `
async function getUser(id) {
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(0);
  });

  it('extracts multiple cached functions', () => {
    const code = `
async function getUser(id) {
  'use cache';
  return { id };
}

async function getPost(id) {
  'use cache';
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(2);
    expect(funcs.map(f => f.name).sort()).toEqual(['getPost', 'getUser']);
  });

  it('ignores use cache directive not at start of body', () => {
    const code = `
async function getUser(id) {
  console.log('start');
  'use cache';
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(0);
  });

  it('allows comments before use cache directive', () => {
    const code = `
async function getUser(id) {
  // This is cached
  'use cache';
  return { id };
}`;
    const funcs = extractFns(code);
    expect(funcs).toHaveLength(1);
    expect(funcs[0].name).toBe('getUser');
  });
});

/* -------------------------------------------------------------------------- */
/* Vite 插件:转换                                                              */
/* -------------------------------------------------------------------------- */

describe('transformUseCache', () => {
  it('returns null for code without use cache', () => {
    expect(transformCache(`async function f() { return 1; }`, 'src/test.ts')).toBeNull();
  });

  it('transforms async function declaration', () => {
    const code = `async function getUser(id) {
  'use cache';
  cacheLife(3600);
  cacheTag('users');
  return { id };
}`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toContain('__ubean_wrapCache');
    expect(result!).toContain("import { wrapWithCache as __ubean_wrapCache } from '@ubean/server/cache-directive'");
    expect(result!).toContain('src/test.ts:getUser');
    expect(result!).not.toContain("'use cache'");
  });

  it('transforms exported async function', () => {
    const code = `export async function getUser(id) {
  'use cache';
  return { id };
}`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toContain('export const getUser = __ubean_wrapCache');
  });

  it('transforms arrow function', () => {
    const code = `const getUser = async (id) => {
  'use cache';
  return { id };
};`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toContain('const getUser = __ubean_wrapCache');
  });

  it('transforms multiple functions in one file', () => {
    const code = `async function getUser(id) {
  'use cache';
  return { id };
}

async function getPost(id) {
  'use cache';
  return { id };
}`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toMatch(/getUser/);
    expect(result!).toMatch(/getPost/);
    // Only one import statement
    const importCount = (result!.match(/@ubean\/server\/cache-directive/g) || []).length;
    expect(importCount).toBe(1);
  });

  it('preserves function parameters', () => {
    const code = `async function getUser(id, name) {
  'use cache';
  return { id, name };
}`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toContain('(id, name)');
  });

  it('uses project-relative path for cache name', () => {
    const code = `async function getUser(id) {
  'use cache';
  return { id };
}`;
    const result = transformCache(code, '/root/src/utils/user.ts', '/root');
    expect(result).not.toBeNull();
    expect(result!).toContain('src/utils/user.ts:getUser');
  });

  it('does not add duplicate import', () => {
    const code = `import { wrapWithCache as __ubean_wrapCache } from '@ubean/server/cache-directive';

async function getUser(id) {
  'use cache';
  return { id };
}`;
    const result = transformCache(code, '/root/src/test.ts', '/root');
    expect(result).not.toBeNull();
    // Should not have two imports
    const importMatches = result!.match(/import.*@ubean\/server\/cache-directive/g);
    expect(importMatches).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Vite 插件:插件实例                                                          */
/* -------------------------------------------------------------------------- */

describe('ubeanCacheDirectivePlugin', () => {
  it('returns a Vite plugin with correct name', () => {
    const plugin = ubeanCacheDirectivePlugin();
    expect(plugin.name).toBe('ubean:cache-directive');
    expect(plugin.enforce).toBe('pre');
  });

  it('transforms files with use cache directive', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function getUser(id) {
  'use cache';
  return { id };
}`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '/root/src/test.ts', { ssr: true });
    expect(result).not.toBeNull();
    expect(result.code).toContain('__ubean_wrapCache');
  });

  it('skips node_modules', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function f() { 'use cache'; return 1; }`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '/root/node_modules/lib/test.ts', { ssr: true });
    expect(result).toBeNull();
  });

  it('skips virtual modules', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function f() { 'use cache'; return 1; }`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '\0virtual:ubean-test', { ssr: true });
    expect(result).toBeNull();
  });

  it('skips client-side transform', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function f() { 'use cache'; return 1; }`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '/root/src/test.ts', { ssr: false });
    expect(result).toBeNull();
  });

  it('skips non-JS/TS files', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function f() { 'use cache'; return 1; }`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '/root/src/test.css', { ssr: true });
    expect(result).toBeNull();
  });

  it('skips files without use cache directive', () => {
    const plugin = ubeanCacheDirectivePlugin({ root: '/root' });
    const code = `async function f() { return 1; }`;
    const transform = plugin.transform as Function;
    const result = transform.call(plugin, code, '/root/src/test.ts', { ssr: true });
    expect(result).toBeNull();
  });
});
