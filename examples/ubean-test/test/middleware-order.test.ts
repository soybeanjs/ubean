/**
 * TS-07（黑盒面）：真实 dev server 上的基础中间件链顺序断言
 *
 * 与 `packages/app/test/middleware-order.test.ts`（单元面，13 步全序）互补：
 * 单元面证明「构造期把 13 个打点按序装上」，这一面证明「真实 `ubean dev` 进程里
 * 这些打点确实按同一顺序在**请求期**执行」——即装配顺序没有在 dev 装配层被重排/丢失。
 *
 * 观测方式完全是黑盒：`GET /_health` 的 `mwOrder` 字段。
 *
 * 为什么期望是 11 步而不是 13 步（且其中一项**随运行形态变化**）：
 * - ⑦ `cacheStore`：**dev 轨缺席、build 轨在场**。dev 轨未初始化 store
 *   （`ubean.config.ts` 未设 `cache.store` ⇒ 开发态按内存默认，构造期不落地），故不打点；
 *   build 轨走 `resolveProductionCacheStore()`，node 预设得到
 *   `{ store: 'fs', dir: '.ubean/cache' }` ⇒ store 真的被初始化 ⇒ 打点。
 *   这是双轨**实测发现的第一处 dev/build 行为差异**。
 * - ⑩ `routeCache`：两轨都缺席。`resolveRouteCacheRules()` 只在 `rule.cache.ttl != null` 时
 *   产出规则（`packages/server/src/cache.ts`），而本示例的 `routeRules` 只有 `isr` / `ppr`
 *   ⇒ 产出 0 条缓存规则 ⇒ 中间件整段不挂载。
 *
 * 这些缺席/在场本身就是断言的一部分：如果哪天示例配置或运行时形态变了，这个测试会红，
 * 提醒同步期望值。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { requireDevServer, getJson } from './helper';
import { isBuildMode, perMode, TEST_MODE } from './mode';

/** 本示例配置下请求期应观测到的完整序列 */
const LIVE_ORDER = [
  'handle',
  'requestId',
  'actionContext',
  'securityHeaders',
  'csrf',
  'dataCache',
  // build 轨：node 预设的生产缓存后端是 fs，于是 ⑦ 真的被初始化并打点（见文件头注释）
  ...(isBuildMode ? ['cacheStore'] : []),
  'i18n',
  'routeRules',
  'websocket',
  'lifecycle',
  'healthEndpoint'
];

/** 13 步表中被本示例配置关掉的步骤（`cacheStore` 只在 dev 轨关掉） */
const GATED_OFF = perMode(['cacheStore', 'routeCache'], ['routeCache']);

describe(`TS-07 中间件链顺序（真实 ${TEST_MODE} 轨服务）`, () => {
  beforeAll(requireDevServer);

  it('/_health 回显完整且有序的中间件序列', async () => {
    const res = await getJson('/_health');

    expect(res.status).toBe(200);
    const body = res.data as { status: string; mwOrder?: string[] };
    expect(body.status).toBe('ok');
    expect(body.mwOrder).toEqual(LIVE_ORDER);
  });

  it('被关掉的门控步骤确实不在序列里（缺席要可见，不是静默）', async () => {
    const res = await getJson('/_health');
    const mwOrder = (res.data as { mwOrder?: string[] }).mwOrder ?? [];

    for (const step of GATED_OFF) {
      expect(mwOrder).not.toContain(step);
    }
  });

  it('handle 在最外层：示例 globalHooks.handle 生效于所有响应', async () => {
    // `globalHooks.handle` 给每个响应加 `x-ubean-server-config: applied`。
    // 它生效 ⇒ 第 ① 步（最外层）确实包裹了整条链；若 handle 被排到内层，
    // 404 响应就会漏掉这个 header。
    const ok = await getJson('/_health');
    expect(ok.headers.get('x-ubean-server-config')).toBe('applied');

    const notFound = await getJson('/definitely-not-a-real-path-ts07');
    expect(notFound.headers.get('x-ubean-server-config')).toBe('applied');
  });

  it('securityHeaders 早于业务逻辑：安全头出现在响应上', async () => {
    const res = await getJson('/_health');

    // 具体值由配置决定，这里只断言「第 ④ 步真的执行过」——即头存在。
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('序列在多次请求间稳定', async () => {
    const first = await getJson('/_health');
    const second = await getJson('/_health');
    const third = await getJson('/_health');

    const orders = [first, second, third].map(r => (r.data as { mwOrder?: string[] }).mwOrder);
    expect(orders[1]).toEqual(orders[0]);
    expect(orders[2]).toEqual(orders[0]);
  });

  it('打点挂在通配路径上：页面路由同样经过第 ① ④ 步', async () => {
    // 只有 `/_health` 会回显 `mwOrder`，但「链是全局的」可以用**效果**证明：
    // 页面路由同样带上 handle（①）与 securityHeaders（④）写下的头。
    const page = await getJson('/about');

    expect(page.status).toBe(200);
    expect(page.headers.get('x-ubean-server-config')).toBe('applied');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
