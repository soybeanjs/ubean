import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStore, createStorageCacheStore } from '../src/cache';
// fs 存储在 2026-09 拆到独立模块（`cache.ts` 在服务端图主链路上，静态 import node:fs 会让 worker
// 产物带上它；拆分 + 懒加载见 `cache.ts` 的 `loadFsCacheStore`）
import { createFsCacheStore } from '../src/cache-fs';
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

  // TS-17：并发写与损坏恢复。此前只有 3 个顺序用例，「并发 set 会不会互相踩坏」与
  // 「磁盘上的 JSON 被写坏后会发生什么」都没有断言 —— 而后者正是生产 ISR 落盘最常见的脏状态。
  it('并发写多个键互不踩踏；同一键并发写收敛为单一可读值', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-cache-'));
    dirs.push(dir);
    const store = createFsCacheStore(dir);
    const entryOf = n => ({
      body: new TextEncoder().encode(`v${n}`).buffer,
      headers: { 'content-type': 'text/plain' },
      status: 200,
      statusText: 'OK'
    });

    // 20 个不同键同时写：彼此是不同文件，必须全部落盘且全部可读
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set(`k${i}`, entryOf(i), 60)));
    for (let i = 0; i < 20; i += 1) {
      const hit = await store.get(`k${i}`);
      expect(new TextDecoder().decode(hit?.body), `k${i}`).toBe(`v${i}`);
    }

    // 同一键并发写：不抛错，收敛为「其中一次写入」的可读值（fs 的 writeFile 无原子性，
    // 但 readEntry 吞掉解析失败 ⇒ 观察到的要么是完整旧值要么是完整新值，绝不会是半截 JSON）
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.set('same', entryOf(100 + i), 60)));
    const same = await store.get('same');
    expect(same?.status).toBe(200);
    // 写入值域是 v100..v111，无论最后落在哪一个都必须是**完整**的一个
    expect(new TextDecoder().decode(same?.body)).toMatch(/^v1\d\d$/);
  });

  it('损坏的缓存文件按 miss 处理，且可被下一次 set 修复', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ubean-cache-'));
    dirs.push(dir);
    const store = createFsCacheStore(dir);
    const { encodeCacheKey } = await import('../src/cache');
    const fileFor = key => join(dir, `${encodeCacheKey(key)}.json`);
    const body = new TextEncoder().encode('ok').buffer;
    await store.set('k', { body, headers: {}, status: 200, statusText: 'OK' }, 60);

    // 模拟进程在 writeFile 中途被打断留下的半截 JSON
    await import('node:fs/promises').then(m => m.writeFile(fileFor('k'), '{"body":', 'utf8'));

    // get/peek 都必须按 miss 处理（吞掉解析失败），而不是把异常抛给调用方 —— 调用方是
    // 缓存中间件，一抛就把整条请求打 500 了。
    await expect(store.get('k')).resolves.toBeUndefined();
    await expect(store.peek?.('k')).resolves.toBeUndefined();

    // 下一次 set 直接覆盖坏文件，恢复读写
    await store.set('k', { body, headers: {}, status: 201, statusText: 'Created' }, 60);
    const healed = await store.get('k');
    expect(healed?.status).toBe(201);

    // clear 不受坏文件影响（仍然只清 .json，清完目录为空）
    await store.clear();
    expect(await store.peek?.('k')).toBeUndefined();
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
