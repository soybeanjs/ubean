import { describe, it, expect } from 'vitest';
import { resolveLoggingConfig } from '../src/loader';
import type { LoggingConfig } from '../src/types';

describe('resolveLoggingConfig()', () => {
  it('未配置时全部分类默认关闭(健康时安静)', () => {
    expect(resolveLoggingConfig(undefined, 'fullstack')).toEqual({
      level: undefined,
      diagnostics: false,
      request: false,
      requestSuppressed: false,
      scan: false,
      lifecycle: false
    });
  });

  it("'auto' 与未设置等价:request 恒为 false(所有模式)", () => {
    for (const mode of ['fullstack', 'backend', 'ssg', 'spa'] as const) {
      expect(resolveLoggingConfig({ request: 'auto' }, mode).request).toBe(false);
      expect(resolveLoggingConfig({ request: 'auto' }, mode).requestSuppressed).toBe(false);
    }
  });

  it('request: true 在 fullstack/backend 开启', () => {
    expect(resolveLoggingConfig({ request: true }, 'fullstack').request).toBe(true);
    expect(resolveLoggingConfig({ request: true }, 'backend').request).toBe(true);
    expect(resolveLoggingConfig({ request: true }, 'fullstack').requestSuppressed).toBe(false);
  });

  it('request: true 在 ssg/spa 强制关闭并置位 requestSuppressed', () => {
    for (const mode of ['ssg', 'spa'] as const) {
      const resolved = resolveLoggingConfig({ request: true }, mode);
      expect(resolved.request).toBe(false);
      expect(resolved.requestSuppressed).toBe(true);
    }
  });

  it('mode 未提供时按默认 fullstack 处理 request', () => {
    expect(resolveLoggingConfig({ request: true }).request).toBe(true);
  });

  it("diagnostics 仅在显式 true 时总是输出('auto'/false/未设置 → 仅失败时)", () => {
    expect(resolveLoggingConfig({ diagnostics: true }, 'fullstack').diagnostics).toBe(true);
    expect(resolveLoggingConfig({ diagnostics: 'auto' }, 'fullstack').diagnostics).toBe(false);
    expect(resolveLoggingConfig({ diagnostics: false }, 'fullstack').diagnostics).toBe(false);
    expect(resolveLoggingConfig(undefined, 'fullstack').diagnostics).toBe(false);
  });

  it('scan / lifecycle 显式开启', () => {
    const config: LoggingConfig = { scan: true, lifecycle: true };
    const resolved = resolveLoggingConfig(config, 'fullstack');
    expect(resolved.scan).toBe(true);
    expect(resolved.lifecycle).toBe(true);
  });

  it('level 原样透传', () => {
    expect(resolveLoggingConfig({ level: 'debug' }, 'fullstack').level).toBe('debug');
    expect(resolveLoggingConfig({ level: 'warn' }, 'fullstack').level).toBe('warn');
  });
});
