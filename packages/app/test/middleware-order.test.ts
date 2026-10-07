/**
 * TS-07：基础中间件链「13 步全序」断言
 *
 * `docs/test.md` §5 TS-07 把 `_setupBaseMiddleware()` 的注册顺序固定为一张 13 步表：
 *
 *   ① handle ② requestId ③ actionContext ④ securityHeaders ⑤ csrf ⑥ dataCache
 *   ⑦ cacheStore ⑧ i18n ⑨ routeRules ⑩ routeCache ⑪ websocket ⑫ lifecycle ⑬ healthEndpoint
 *
 * 这个顺序是**结构事实**：它决定谁包裹谁（例如 `handle` 必须最外层，才能覆盖 404 与错误响应），
 * 也决定安全头是否在业务逻辑之前写入。仅断言「某中间件存在」证明不了顺序，因此这里断言**完整序列**。
 *
 * 观测方式：每个中间件在进入时把步骤名 push 进请求级变量 `__ubean_mw_order__`，
 * `GET /_health` 把它回显为 `mwOrder` 字段。断言与实现解耦——不 import 任何内部 API 的名字。
 *
 * 配套：
 * - `examples/ubean-test/test/middleware-order.test.ts`：真实 dev server 上的黑盒同款断言
 * - `packages/app/test/app-registration.test.ts`：注册顺序（TS-08）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearInternalFetcher } from '@ubean/routes';
import { createMemoryStore } from '@ubean/server';
import { clearGlobalHooks } from '../src/hooks';
import { UbeanApp } from '../src/app';
import type { UbeanAppOptions } from '../src/app';

/** 13 步全序（`docs/test.md` §5 TS-07 表） */
const FULL_ORDER = [
  'handle',
  'requestId',
  'actionContext',
  'securityHeaders',
  'csrf',
  'dataCache',
  'cacheStore',
  'i18n',
  'routeRules',
  'routeCache',
  'websocket',
  'lifecycle',
  'healthEndpoint'
] as const;

/**
 * 打开全部 13 个门控所需的最小配置。
 *
 * 门控来源（`packages/app/src/app.ts`）：
 * - ⑦ cacheStore：`options.cacheStore` 存在 或 `options.cache.store === 'fs'`
 * - ⑧ i18n：`i18nConfig.enabled !== false` 且 `locales.length > 0`
 * - ⑨ routeRules：`routeRules` 非空
 * - ⑩ routeCache：`resolveRouteCacheRules()` 产出非空（要求 `rule.cache.ttl != null`）
 * - ⑬ healthEndpoint：`healthEndpoint !== false`（默认开）
 */
const ALL_GATES_ON: UbeanAppOptions = {
  cacheStore: createMemoryStore(),
  i18nConfig: { defaultLocale: 'en', locales: ['en', 'zh'] },
  routeRules: {
    '/cached/*': { cache: { ttl: 60 } },
    '/isr/*': { isr: { ttl: 60 } }
  }
};

async function fetchHealth(app: UbeanApp): Promise<{ status: number; mwOrder: string[] }> {
  const res = await app.hono.fetch(new Request('http://localhost/_health'));
  const body = (await res.json()) as { status: string; mwOrder?: string[] };
  return { status: res.status, mwOrder: body.mwOrder ?? [] };
}

describe('TS-07 基础中间件链顺序', () => {
  beforeEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });

  afterEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });

  it('全部门控打开时，/_health 观测到 13 步完整序列', async () => {
    const app = new UbeanApp(ALL_GATES_ON);
    const { status, mwOrder } = await fetchHealth(app);

    expect(status).toBe(200);
    // 完整序列断言：多一步、少一步、顺序错位都会红
    expect(mwOrder).toEqual([...FULL_ORDER]);
  });

  it('缺省配置下（无 cacheStore / 无 i18n / 无 routeRules）只保留常驻 6 步', async () => {
    const app = new UbeanApp({});
    const { mwOrder } = await fetchHealth(app);

    expect(mwOrder).toEqual([
      'handle',
      'requestId',
      'actionContext',
      'securityHeaders',
      'csrf',
      'dataCache',
      'websocket',
      'lifecycle',
      'healthEndpoint'
    ]);
  });

  it('securityHeaders: false → 第 ④ 步缺席，且其余步骤相对顺序不变', async () => {
    const app = new UbeanApp({ ...ALL_GATES_ON, securityHeaders: false });
    const { mwOrder } = await fetchHealth(app);

    expect(mwOrder).not.toContain('securityHeaders');
    expect(mwOrder).toEqual(FULL_ORDER.filter(s => s !== 'securityHeaders'));
  });

  it('csrf: false → 第 ⑤ 步缺席，且其余步骤相对顺序不变', async () => {
    const app = new UbeanApp({ ...ALL_GATES_ON, csrf: false });
    const { mwOrder } = await fetchHealth(app);

    expect(mwOrder).not.toContain('csrf');
    expect(mwOrder).toEqual(FULL_ORDER.filter(s => s !== 'csrf'));
  });

  it('dataCache: false → 第 ⑥ 步缺席，且其余步骤相对顺序不变', async () => {
    const app = new UbeanApp({ ...ALL_GATES_ON, dataCache: false });
    const { mwOrder } = await fetchHealth(app);

    expect(mwOrder).not.toContain('dataCache');
    expect(mwOrder).toEqual(FULL_ORDER.filter(s => s !== 'dataCache'));
  });

  it('healthEndpoint: false → 第 ⑬ 步整段缺席（路由与打点一起关）', async () => {
    const app = new UbeanApp({ ...ALL_GATES_ON, healthEndpoint: false });
    const res = await app.hono.fetch(new Request('http://localhost/_health'));

    expect(res.status).toBe(404);
  });

  it('cache.store === "fs"（无显式 cacheStore）同样登记第 ⑦ 步', async () => {
    const app = new UbeanApp({
      i18nConfig: ALL_GATES_ON.i18nConfig,
      routeRules: ALL_GATES_ON.routeRules,
      cache: { store: 'fs', dir: '.ubean/cache-ts07' }
    });
    const { mwOrder } = await fetchHealth(app);

    expect(mwOrder).toContain('cacheStore');
    expect(mwOrder).toEqual([...FULL_ORDER]);
  });

  it('每个步骤名在单次请求中只出现一次（不重复打点）', async () => {
    const app = new UbeanApp(ALL_GATES_ON);
    const { mwOrder } = await fetchHealth(app);

    expect(new Set(mwOrder).size).toBe(mwOrder.length);
  });

  it('顺序在两次请求间稳定（非首请求特例）', async () => {
    const app = new UbeanApp(ALL_GATES_ON);
    const first = await fetchHealth(app);
    const second = await fetchHealth(app);

    expect(second.mwOrder).toEqual(first.mwOrder);
  });
});
