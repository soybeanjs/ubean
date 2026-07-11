import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryDriver, createStorage, createKV, useKV, clearGlobalStorage } from '../src/runtime/storage';

describe('memory storage driver', () => {
  it('stores and retrieves raw values', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('key1', { value: 'hello', createdAt: 123 });
    const raw = await driver.getItemRaw('key1');
    expect(raw).toEqual({ value: 'hello', createdAt: 123 });
  });

  it('returns undefined for missing keys', async () => {
    const driver = createMemoryDriver();
    expect(await driver.getItemRaw('missing')).toBeUndefined();
  });

  it('removes keys', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('key1', 'value');
    await driver.removeItem('key1');
    expect(await driver.getItemRaw('key1')).toBeUndefined();
  });

  it('lists keys with prefix', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('a:1', 'v1');
    await driver.setItemRaw('a:2', 'v2');
    await driver.setItemRaw('b:1', 'v3');
    const keys = await driver.getKeys('a:');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('a:1');
    expect(keys).toContain('a:2');
  });

  it('clears all keys', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('x', 'v');
    await driver.setItemRaw('y', 'v');
    await driver.clear();
    expect(await driver.getKeys()).toHaveLength(0);
  });

  it('clears keys with prefix', async () => {
    const driver = createMemoryDriver();
    await driver.setItemRaw('a:1', 'v');
    await driver.setItemRaw('b:1', 'v');
    await driver.clear('a:');
    expect(await driver.hasItem('a:1')).toBe(false);
    expect(await driver.hasItem('b:1')).toBe(true);
  });

  it('checks key existence', async () => {
    const driver = createMemoryDriver();
    expect(await driver.hasItem('missing')).toBe(false);
    await driver.setItemRaw('exists', 'v');
    expect(await driver.hasItem('exists')).toBe(true);
  });
});

describe('ubean storage', () => {
  beforeEach(() => {
    clearGlobalStorage();
  });

  it('stores and retrieves values', async () => {
    const storage = createStorage();
    await storage.set('user:1', { name: 'Alice', age: 30 });
    const user = await storage.get<{ name: string; age: number }>('user:1');
    expect(user).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns null for missing keys', async () => {
    const storage = createStorage();
    expect(await storage.get('missing')).toBeNull();
  });

  it('supports TTL expiration', async () => {
    const storage = createStorage();
    await storage.set('temp', 'value', 0.001);
    expect(await storage.get('temp')).toBe('value');
    await new Promise(r => setTimeout(r, 5));
    expect(await storage.get('temp')).toBeNull();
  });

  it('removes keys', async () => {
    const storage = createStorage();
    await storage.set('key', 'value');
    await storage.remove('key');
    expect(await storage.get('key')).toBeNull();
  });

  it('lists keys', async () => {
    const storage = createStorage();
    await storage.set('a/1', 'v1');
    await storage.set('a/2', 'v2');
    await storage.set('b/1', 'v3');
    const keys = await storage.keys('a/');
    expect(keys).toHaveLength(2);
  });

  it('clears keys with base prefix', async () => {
    const storage = createStorage();
    await storage.set('cache:x', 'v');
    await storage.set('data:y', 'v');
    await storage.clear('cache:');
    expect(await storage.has('cache:x')).toBe(false);
    expect(await storage.has('data:y')).toBe(true);
  });

  it('checks key existence', async () => {
    const storage = createStorage();
    expect(await storage.has('k')).toBe(false);
    await storage.set('k', 'v');
    expect(await storage.has('k')).toBe(true);
  });

  it('returns metadata including TTL', async () => {
    const storage = createStorage();
    await storage.set('meta-key', 'v', 60);
    const meta = await storage.getMeta('meta-key');
    expect(meta).toBeDefined();
    expect(meta!.createdAt).toBeGreaterThan(0);
    expect(meta!.ttl).toBeGreaterThan(0);
    expect(meta!.ttl).toBeLessThanOrEqual(60);
  });

  it('returns null meta for missing keys', async () => {
    const storage = createStorage();
    expect(await storage.getMeta('missing')).toBeNull();
  });
});

describe('KV namespace', () => {
  beforeEach(() => {
    clearGlobalStorage();
  });

  it('creates isolated namespaces', async () => {
    const users = createKV<{ name: string }>({ prefix: 'ns:users' });
    const posts = createKV<{ title: string }>({ prefix: 'ns:posts' });

    await users.set('1', { name: 'Alice' });
    await posts.set('1', { title: 'Hello' });

    const user = await users.get('1');
    const post = await posts.get('1');
    expect(user).toEqual({ name: 'Alice' });
    expect(post).toEqual({ title: 'Hello' });
  });

  it('serializes/deserializes values with JSON by default', async () => {
    const kv = createKV<{ count: number }>({ prefix: 'test' });
    await kv.set('counter', { count: 42 });
    const val = await kv.get('counter');
    expect(val).toEqual({ count: 42 });
  });

  it('supports custom serializer', async () => {
    const kv = createKV<string>({
      prefix: 'str',
      serialize: v => v.toUpperCase(),
      deserialize: v => v.toLowerCase()
    });
    await kv.set('greet', 'hello');
    expect(await kv.get('greet')).toBe('hello');
  });

  it('lists keys in namespace', async () => {
    const kv = createKV({ prefix: 'list' });
    await kv.set('a', '1');
    await kv.set('b', '2');
    await kv.set('c', '3');
    const keys = await kv.keys();
    expect(keys.sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes keys', async () => {
    const kv = createKV({ prefix: 'rm' });
    await kv.set('x', 'y');
    await kv.remove('x');
    expect(await kv.get('x')).toBeNull();
    expect(await kv.has('x')).toBe(false);
  });

  it('clears namespace', async () => {
    const kv = createKV({ prefix: 'clr' });
    await kv.set('a', '1');
    await kv.set('b', '2');
    await kv.clear();
    expect(await kv.keys()).toHaveLength(0);
  });

  it('useKV returns singleton per name', () => {
    clearGlobalStorage();
    const kv1 = useKV('sessions');
    const kv2 = useKV('sessions');
    expect(kv1).toBe(kv2);
  });
});
