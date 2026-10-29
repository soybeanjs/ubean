/**
 * 运行环境判据单元测试。
 *
 * 这两个函数是全仓 `typeof window` 的唯一实现，写反（`!==` / `===`）不会有任何报错，
 * 只会让某条分支永远不执行 —— 所以两个方向都要断言。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isClient, isServer } from '../src/platform';

describe('platform', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('无 window（SSR / Node）', () => {
    expect(isClient()).toBe(false);
    expect(isServer()).toBe(true);
  });

  it('有 window（浏览器）', () => {
    Reflect.set(globalThis, 'window', {});
    expect(isClient()).toBe(true);
    expect(isServer()).toBe(false);
  });
});
