import { describe, it, expect } from 'vitest';
import {
  createCloudflareD1Database,
  createCloudflareQueueDriver,
  dispatchCloudflareQueueBatch,
  createVercelPostgresDatabase,
  createVercelKvQueueDriver,
  createBunSqliteDatabase,
  createDenoKvStorage,
  createNetlifyBlobsStorage
} from '../src/drivers';

describe('platform drivers', () => {
  it('Cloudflare D1 adapter interpolates sql and returns rows', async () => {
    const seen: string[] = [];
    const db = createCloudflareD1Database({
      prepare(query) {
        seen.push(query);
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: [{ n: 1 }] };
          },
          async run() {
            return { success: true };
          }
        };
      }
    });
    const rows = await db.sql`select ${1}`;
    expect(rows).toEqual([{ n: 1 }]);
    expect(seen[0]).toContain('select');
  });

  it('Cloudflare queue driver sends via binding', async () => {
    const sent: unknown[] = [];
    const handlers = new Map();
    const driver = createCloudflareQueueDriver(
      {
        jobs: {
          async send(body) {
            sent.push(body);
          }
        }
      },
      handlers
    );
    driver.registerHandler?.('jobs', async msg => {
      sent.push(['handled', msg.body]);
    });
    await driver.send('jobs', { id: 'a' });
    await dispatchCloudflareQueueBatch(handlers, 'jobs', [{ id: 'a' }]);
    expect(sent[0]).toEqual({ id: 'a' });
    expect(sent[1]).toEqual(['handled', { id: 'a' }]);
  });

  it('Vercel postgres adapter uses numbered params', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const db = createVercelPostgresDatabase({
      async query(text, params) {
        calls.push({ text, params });
        return { rows: [{ ok: true }] };
      }
    });
    const rows = await db.sql`select ${7}`;
    expect(rows).toEqual([{ ok: true }]);
    expect(calls[0].text).toContain('$1');
    expect(calls[0].params).toEqual([7]);
  });

  it('Vercel KV queue driver persists with lpush', async () => {
    const list: string[] = [];
    const driver = createVercelKvQueueDriver({
      async lpush(_key, value) {
        list.push(value);
      },
      async set() {},
      async get() {
        return null;
      }
    });
    const id = await driver.send('mail', { to: 'a@b.c' });
    expect(id.startsWith('kv_')).toBe(true);
    expect(list).toHaveLength(1);
    expect(JSON.parse(list[0]).body).toEqual({ to: 'a@b.c' });
  });

  it('Bun sqlite adapter uses positional placeholders', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const db = createBunSqliteDatabase({
      query(sql) {
        return {
          all(...params) {
            seen.push({ sql, params });
            return [{ n: 2 }];
          }
        };
      }
    });
    const rows = await db.sql`select ${2}`;
    expect(rows).toEqual([{ n: 2 }]);
    expect(seen[0].sql).toContain('?');
    expect(seen[0].params).toEqual([2]);
  });

  it('Deno KV storage driver round-trips keys and values', async () => {
    const store = new Map<string, unknown>();
    const kv = {
      async get(key: Array<string | number | bigint | boolean>) {
        return { value: store.get(String(key[0])) };
      },
      async set(key: Array<string | number | bigint | boolean>, value: unknown) {
        store.set(String(key[0]), value);
      },
      async delete(key: Array<string | number | bigint | boolean>) {
        store.delete(String(key[0]));
      },
      async *list(selector: { prefix: Array<string | number | bigint | boolean> }) {
        const prefix = selector.prefix[0] != null ? String(selector.prefix[0]) : '';
        for (const [key, value] of store) {
          if (!prefix || key.startsWith(prefix)) yield { key: [key], value };
        }
      }
    };
    const driver = createDenoKvStorage(kv);
    await driver.setItemRaw('user:1', { id: 1 });
    expect(await driver.getItemRaw('user:1')).toEqual({ id: 1 });
    expect(await driver.hasItem('user:1')).toBe(true);
    expect(await driver.getKeys('user:')).toEqual(['user:1']);
    await driver.clear('user:');
    expect(await driver.hasItem('user:1')).toBe(false);
  });

  it('Netlify Blobs storage driver JSON-encodes values', async () => {
    const blobs = new Map<string, string>();
    const driver = createNetlifyBlobsStorage({
      async get(key) {
        return blobs.get(key) ?? null;
      },
      async set(key, value) {
        blobs.set(key, value);
      },
      async delete(key) {
        blobs.delete(key);
      },
      async list(options) {
        const prefix = options?.prefix ?? '';
        return {
          blobs: [...blobs.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
        };
      }
    });
    await driver.setItemRaw('page:home', { html: '<p/>' });
    expect(await driver.getItemRaw('page:home')).toEqual({ html: '<p/>' });
    expect(await driver.getKeys('page:')).toEqual(['page:home']);
    await driver.removeItem('page:home');
    expect(await driver.hasItem('page:home')).toBe(false);
  });
});
