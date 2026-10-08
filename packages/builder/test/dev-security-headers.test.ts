/**
 * dev 环境 SecurityHeaders 解析测试（ADR-0011）。
 *
 * 覆盖 `resolveDevSecurityHeaders(config)`（`src/dev/dev-app.ts`）：
 * - ssg 模式未显式配置 → 默认关闭（对齐生产：静态产物无框架安全头）
 * - 其余模式未显式配置 → 默认开启（行为不变）
 * - 显式配置（true / 对象）在任何模式下被尊重（CSP 调试入口）
 * - 显式关闭（security: false / headers: false）在任何模式下关闭
 *
 * 该函数是**唯一实现**：`packages/cli/src/dev.ts` 曾有一份同名副本（`config: any`），
 * 但构建期从不调用它 —— 只有测试在消费。RM-V11 把 dev app 装配移进 builder 后，
 * 副本成了死代码，已删除并把断言迁到这里（原 `packages/cli/test/dev-security-headers.test.ts`）。
 */
import { describe, it, expect } from 'vitest';
import type { ResolvedConfig } from '@ubean/config';
import { resolveDevSecurityHeaders } from '../src/dev/dev-app';

const CSP = { 'script-src': ["'self'"] };

/** 只提供该函数读到的两个字段（`mode` / `security`），其余无关。 */
function config(overrides: { mode?: string; security?: unknown } = {}): ResolvedConfig {
  return { mode: 'fullstack', security: undefined, ...overrides } as unknown as ResolvedConfig;
}

describe('resolveDevSecurityHeaders()', () => {
  it('returns false by default in ssg mode (aligns with static output reality)', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg' }))).toBe(false);
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg', security: {} }))).toBe(false);
  });

  it('returns true by default in non-ssg modes (unchanged behavior)', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'fullstack' }))).toBe(true);
    expect(resolveDevSecurityHeaders(config({ mode: 'spa' }))).toBe(true);
    expect(resolveDevSecurityHeaders(config({ mode: 'backend' }))).toBe(true);
  });

  it('honors explicit headers: true in ssg mode (CSP debugging opt-in)', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg', security: { headers: true } }))).toBe(true);
  });

  it('honors explicit headers object in ssg mode', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg', security: { headers: CSP } }))).toBe(CSP);
  });

  it('honors explicit headers object in fullstack mode', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'fullstack', security: { headers: CSP } }))).toBe(CSP);
  });

  it('returns false when explicitly disabled via security: false (any mode)', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg', security: false }))).toBe(false);
    expect(resolveDevSecurityHeaders(config({ mode: 'fullstack', security: false }))).toBe(false);
  });

  it('returns false when explicitly disabled via headers: false (any mode)', () => {
    expect(resolveDevSecurityHeaders(config({ mode: 'ssg', security: { headers: false } }))).toBe(false);
    expect(resolveDevSecurityHeaders(config({ mode: 'fullstack', security: { headers: false } }))).toBe(false);
  });
});
