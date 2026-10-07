import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * TS-17：rate-limit 的**假时钟**用例。
 *
 * 此前 rate-limit 没有任何窗口边界测试 —— 而窗口判定全部基于 `Date.now()`
 * （`rate-limit.ts:89-99`），真实 sleep 只能把「窗口已重置」测成「碰巧过了那么久」，
 * 既慢又对时钟抖动敏感。`vi.setSystemTime()` 让边界值可以**精确**落在 `resetAt - 1ms`
 * 与 `resetAt` 上，这才是窗口语义的真实判据。
 *
 * 只用 `vi.setSystemTime()`（不用 `advanceTimersByTime`）：这里没有定时器，只有时钟读数。
 */
import { Hono } from 'hono';
import { createRateLimitMiddleware } from '../src/rate-limit';

const ORIGIN = 'http://localhost';

function makeApp(maxRequests: number, windowMs: number): Hono {
  const app = new Hono();
  app.use('/limited/*', createRateLimitMiddleware({ maxRequests, windowMs }));
  app.get('/limited/ok', c => c.json({ ok: true }));
  return app;
}

async function hit(app: Hono, key: string): Promise<Response> {
  return app.fetch(new Request(`${ORIGIN}/limited/ok`, { headers: { 'x-forwarded-for': key } }));
}

describe('TS-17 · rate-limit 假时钟窗口', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('窗口内计数到上限，随后请求被 429 且 Retry-After = 剩余毫秒', async () => {
    const app = makeApp(2, 10_000);

    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(200);

    const third = await hit(app, 'a');
    expect(third.status).toBe(429);
    // 第一次请求发生在 t=0，windowMs=10s ⇒ resetAt = t+10s。Retry-After 单位是**秒**
    // （defaultHandler 里 ceil(ms/1000)），此刻剩余 10_000ms → 10s
    expect(third.headers.get('retry-after')).toBe('10');
    expect(third.headers.get('ratelimit-remaining')).toBe('0');
  });

  it('时间推进到 resetAt 前一刻仍是 429，跨过 resetAt 才重置', async () => {
    const app = makeApp(1, 10_000);

    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(429);

    // resetAt = t + 10_000ms ⇒ 边界前 1ms 仍然受限
    vi.setSystemTime(new Date('2026-01-01T00:00:09.999Z'));
    expect((await hit(app, 'a')).status).toBe(429);

    // 跨过边界 → 固定窗口开新窗，计数从 1 重新开始
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
    const renewed = await hit(app, 'a');
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get('ratelimit-remaining')).toBe('0');
  });

  it('Retry-After 随时间收紧（不是常量）', async () => {
    const app = makeApp(1, 10_000);

    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).headers.get('retry-after')).toBe('10');

    vi.setSystemTime(new Date('2026-01-01T00:00:04.000Z'));
    expect((await hit(app, 'a')).headers.get('retry-after')).toBe('6');
  });

  it('不同键的窗口互不影响', async () => {
    const app = makeApp(1, 10_000);

    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'b')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(429);
    expect((await hit(app, 'b')).status).toBe(429);
  });
});
