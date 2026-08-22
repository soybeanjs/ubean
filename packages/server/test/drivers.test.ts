import { describe, it, expect } from 'vitest';
import {
  createCloudflareD1Database,
  createCloudflareQueueDriver,
  dispatchCloudflareQueueBatch,
  createVercelPostgresDatabase,
  createVercelKvQueueDriver
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
});
