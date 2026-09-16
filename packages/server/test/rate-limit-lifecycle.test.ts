/**
 * 内存限流存储的生命周期（RM-V21 的收尾债之一）。
 *
 * 内存限流存储持有 60s 清理定时器，而定时器**阻止进程退出**。实测症状：把预渲染接到
 * `vite build` 后产物完整（181 个文件），但进程不退出 —— `process.getActiveResourcesInfo()`
 * 报出多个 `Timeout`；cron 调度器的 `stop()` 是干净的，因此嫌疑落在限流这类「内部自建、
 * 外部拿不到」的定时器上。
 *
 * 这里钉住三件事：定时器被登记、`disposeMemoryRateLimitStores()` 能清掉它、且清完不再残留。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRateLimitStore, createRateLimitMiddleware, disposeMemoryRateLimitStores } from '../src/rate-limit';

/** 统计当前存活的定时器数量（Node 的 getActiveResourcesInfo 会把 Timeout 列出来）。 */
function activeTimeouts(): number {
  const info = (process as unknown as { getActiveResourcesInfo?: () => string[] }).getActiveResourcesInfo?.() ?? [];
  return info.filter(resource => resource === 'Timeout').length;
}

afterEach(() => {
  disposeMemoryRateLimitStores();
});

describe('内存限流存储的销毁', () => {
  it('自建实例被销毁后释放清理定时器', () => {
    const before = activeTimeouts();
    createMemoryRateLimitStore();
    expect(activeTimeouts()).toBeGreaterThan(before);

    disposeMemoryRateLimitStores();
    expect(activeTimeouts()).toBe(before);
  });

  it('中间件内部自建的存储也在登记范围内（调用方拿不到实例）', () => {
    const before = activeTimeouts();
    // 不传 store ⇒ 中间件内部 new 一个 —— 这正是「外部无法销毁」的形态
    createRateLimitMiddleware({ maxRequests: 1 });
    expect(activeTimeouts()).toBeGreaterThan(before);

    disposeMemoryRateLimitStores();
    expect(activeTimeouts()).toBe(before);
  });

  it('幂等：重复销毁不报错，也不影响新实例', () => {
    createMemoryRateLimitStore();
    disposeMemoryRateLimitStores();
    disposeMemoryRateLimitStores();

    const before = activeTimeouts();
    createMemoryRateLimitStore();
    expect(activeTimeouts()).toBeGreaterThan(before);
  });
});
