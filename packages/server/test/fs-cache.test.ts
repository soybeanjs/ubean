import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFsCacheStore, createMemoryStore, createStorageCacheStore } from '../src/cache';
import { createStorage, createMemoryDriver } from '../src/storage';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('createFsCacheStore', () => {
  it('round-trips an entry across get/set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-cache-'));
    dirs.push(dir);
    const store = createFsCacheStore(dir);
    const body = new TextEncoder().encode('hello').buffer;
    await store.set('k', { body, headers: { 'content-type': 'text/plain' }, status: 200, statusText: 'OK' }, 60);
    const hit = await store.get('k');
    expect(hit?.status).toBe(200);
    expect(new TextDecoder().decode(hit?.body)).toBe('hello');
  });

  it('get hides expired entries while peek keeps them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-cache-'));
    dirs.push(dir);
    const store = createFsCacheStore(dir);
    const body = new ArrayBuffer(0);
    await store.set('stale', { body, headers: {}, status: 200, statusText: 'OK' }, 0);
    expect(await store.get('stale')).toBeUndefined();
    expect(await store.peek?.('stale')).toBeDefined();
  });
});

describe('createStorageCacheStore', () => {
  it('wraps UbeanStorage', async () => {
    const storage = createStorage({ driver: createMemoryDriver() });
    const store = createStorageCacheStore(storage);
    const memory = createMemoryStore();
    expect(typeof store.set).toBe(typeof memory.set);
    const body = new ArrayBuffer(0);
    await store.set('a', { body, headers: {}, status: 200, statusText: 'OK' }, 30);
    expect((await store.get('a'))?.status).toBe(200);
  });
});
