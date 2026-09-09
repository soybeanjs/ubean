/**
 * dev 环境 SecurityHeaders 解析测试（ADR-0011）。
 *
 * 覆盖 `resolveDevSecurityHeaders(config)`：
 * - ssg 模式未显式配置 → 默认关闭（对齐生产：静态产物无框架安全头）
 * - 其余模式未显式配置 → 默认开启（行为不变）
 * - 显式配置（true / 对象）在任何模式下被尊重（CSP 调试入口）
 * - 显式关闭（security: false / headers: false）在任何模式下关闭
 */
import { describe, it, expect } from 'vitest';
import { resolveDevSecurityHeaders } from '../src/dev';

const CSP = { 'script-src': ["'self'"] };

describe('resolveDevSecurityHeaders()', () => {
  it('returns false by default in ssg mode (aligns with static output reality)', () => {
    expect(resolveDevSecurityHeaders({ mode: 'ssg' })).toBe(false);
    expect(resolveDevSecurityHeaders({ mode: 'ssg', security: {} })).toBe(false);
  });

  it('returns true by default in non-ssg modes (unchanged behavior)', () => {
    expect(resolveDevSecurityHeaders({ mode: 'fullstack' })).toBe(true);
    expect(resolveDevSecurityHeaders({ mode: 'spa' })).toBe(true);
    expect(resolveDevSecurityHeaders({ mode: 'backend' })).toBe(true);
    expect(resolveDevSecurityHeaders({})).toBe(true);
  });

  it('honors explicit headers: true in ssg mode (CSP debugging opt-in)', () => {
    expect(resolveDevSecurityHeaders({ mode: 'ssg', security: { headers: true } })).toBe(true);
  });

  it('honors explicit headers object in ssg mode', () => {
    expect(resolveDevSecurityHeaders({ mode: 'ssg', security: { headers: CSP } })).toBe(CSP);
  });

  it('honors explicit headers object in fullstack mode', () => {
    expect(resolveDevSecurityHeaders({ mode: 'fullstack', security: { headers: CSP } })).toBe(CSP);
  });

  it('returns false when explicitly disabled via security: false (any mode)', () => {
    expect(resolveDevSecurityHeaders({ mode: 'ssg', security: false })).toBe(false);
    expect(resolveDevSecurityHeaders({ mode: 'fullstack', security: false })).toBe(false);
  });

  it('returns false when explicitly disabled via headers: false (any mode)', () => {
    expect(resolveDevSecurityHeaders({ mode: 'ssg', security: { headers: false } })).toBe(false);
    expect(resolveDevSecurityHeaders({ mode: 'fullstack', security: { headers: false } })).toBe(false);
  });
});
