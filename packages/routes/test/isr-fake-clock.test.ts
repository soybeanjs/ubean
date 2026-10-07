/**
 * TS-17：ISR TTL 的**假时钟**用例。
 *
 * 既有 `isr.test.ts` 对 TTL 边界用的是真实 sleep（「Tiny sleep to ensure Date.now() advances」），
 * 有两个问题：慢，且**边界不可精确** —— 想测「还差 1ms 过期」根本做不到。这里用
 * `vi.setSystemTime()` 把时钟精确放在 `expiresAt - 1` 与 `expiresAt` 上，把 HIT / STALE / 同步重生
 * 三条路径的判据收紧到毫秒级。
 *
 * 只用 `vi.setSystemTime()`；SWR 的后台重生成用一次真实的 `await` 微任务排空即可观察到
 * （不依赖定时器）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setIsrCache, serveIsr } from '../src/isr';
import type { IsrCacheStore } from '../src/isr';

function createTestStore(): IsrCacheStore & { store: Map<string, any> } {
  const store = new Map<string, any>();
  return {
    store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) return undefined;
      return entry;
    },
    async peek(key) {
      return store.get(key);
    },
    async set(key, entry, ttl) {
      const now = Date.now();
      store.set(key, { ...entry, createdAt: now, expiresAt: now + ttl * 1000 });
    },
    async delete(key) {
      return store.delete(key);
    },
    async clear() {
      store.clear();
    }
  };
}

const ctx: any = { req: { url: 'http://localhost/' } };

const FRESH_HTML = '<html>fresh</html>';
const REGENERATED_HTML = '<html>regenerated</html>';

function makeRule(ttl: number, swr?: boolean) {
  return { ttl, swr };
}

function makeRender(tag: string) {
  return async () => ({ html: REGENERATED_HTML + tag, status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('TS-17 · ISR TTL 假时钟边界', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    store = createTestStore();
    // 通过真实写入入口  落盘（它负责加 `isr:` 键前缀）；直接 `store.set('/p')`
    // 会把键写成字面量 '/p'，serveIsr 读的是 'isr:/p'，于是恒 MISS（首跑踩到）。
    // 通过真实写入入口 `setIsrCache()` 落盘：它负责加 `isr:` 键前缀。直接 `store.set('/p', …)`
    // 会把键写成字面量 '/p'，而 serveIsr 读的是 'isr:/p'，于是恒 MISS（首跑踩到）。
    await setIsrCache(store, '/p', { html: FRESH_HTML, status: 200, headers: { 'Content-Type': 'text/html' } }, 10);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expiresAt - 1ms 仍命中 HIT', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:09.999Z'));

    const res = await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, true), render: makeRender('x') });
    expect(res?.headers.get('X-ISR')).toBe('HIT');
    expect(await res?.text()).toBe(FRESH_HTML);
  });

  it('到达 expiresAt 即过期：swr=true → STALE（旧内容立即返回）', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));

    const render = makeRender('#1');
    const res = await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, true), render });
    expect(res?.headers.get('X-ISR')).toBe('STALE');
    expect(await res?.text()).toBe(FRESH_HTML);

    // 后台重生成是 fire-and-forget：排空微任务后必须真的把新内容写进缓存
    await Promise.resolve();
    await Promise.resolve();
    const refreshed = await store.peek('isr:/p');
    expect(new TextDecoder().decode(refreshed?.body)).toBe(`${REGENERATED_HTML}#1`);
  });

  it('到达 expiresAt 且 swr=false → 同步重新生成，返回 X-ISR: MISS 并回写缓存', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));

    let calls = 0;
    const render = async () => {
      calls += 1;
      return { html: REGENERATED_HTML, status: 200, headers: { 'Content-Type': 'text/html' } };
    };
    const res = await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, false), render });

    // 实测契约：同步重生成由 serveIsr **自己**完成并直接返回 MISS 响应
    // （`isr.ts:218-226`：await render() → 仅缓存 2xx → X-ISR: MISS），不是返回 undefined
    // 让调用方继续渲染 —— 文件里那条「非 SWR：继续到同步重新生成(不返回)」的注释说的是
    // 「不再走 STALE 分支」，而不是「把渲染责任交回调用方」。
    expect(res?.headers.get('X-ISR')).toBe('MISS');
    expect(await res?.text()).toBe(REGENERATED_HTML);
    expect(calls).toBe(1);

    // 回写缓存：TTL 重新计时，下一次请求立即 HIT 到**新**内容
    const again = await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, false), render });
    expect(again?.headers.get('X-ISR')).toBe('HIT');
    expect(await again?.text()).toBe(REGENERATED_HTML);
    expect(calls).toBe(1);
  });

  it('SWR 的并发去重：过期后连发多次只触发一次后台重生成', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));

    let calls = 0;
    const render = async () => {
      calls += 1;
      return { html: REGENERATED_HTML, status: 200, headers: { 'Content-Type': 'text/html' } };
    };

    await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, true), render });
    await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, true), render });
    await serveIsr(ctx, { store, pathname: '/p', rule: makeRule(10, true), render });

    expect(calls, 'REVALIDATING 集合应把并发重生成合并成一次').toBe(1);
  });
});
