/**
 * `ui` 接管首帧主题脚本 —— 归属判据与 `colorMode` 互斥。
 *
 * 背景：`ui: true` 时 vean 主题引擎往 `<head>` 首位插 `createThemeInitScript`
 * （切 `.dark`），ubean 内置 colorMode 也往同一位插脚本（切 `.dark-mode`）。
 * 两份同存时后一份静默失效 —— UnoCSS 只认 `.dark`。所以归属必须唯一，
 * 且判据只能有一处实现（`@ubean/shared` 的 `integrationOwnsFirstPaintScript`），
 * 配置层与插件层都读它。
 */
import { describe, it, expect } from 'vitest';
import { integrationOwnsFirstPaintScript } from '@ubean/shared';
import { resolveColorModeOwnership } from '../src/loader';
import type { ResolvedConfig, UbeanConfig } from '../src/types';

describe('integrationOwnsFirstPaintScript()', () => {
  it('ui 未启用时不接管', () => {
    expect(integrationOwnsFirstPaintScript({})).toBe(false);
    expect(integrationOwnsFirstPaintScript({ ui: undefined })).toBe(false);
    expect(integrationOwnsFirstPaintScript({ ui: false })).toBe(false);
  });

  it('ui: true 接管', () => {
    expect(integrationOwnsFirstPaintScript({ ui: true })).toBe(true);
  });

  it('只改其它选项仍然接管（默认注入）', () => {
    expect(integrationOwnsFirstPaintScript({ ui: { css: false } })).toBe(true);
    expect(integrationOwnsFirstPaintScript({ ui: { theme: {} } })).toBe(true);
  });

  it('ui.disabled: true 时不接管', () => {
    expect(integrationOwnsFirstPaintScript({ ui: { disabled: true } })).toBe(false);
  });

  it('显式退出时不接管（两条逃生口）', () => {
    expect(integrationOwnsFirstPaintScript({ ui: { theme: false } })).toBe(false);
    expect(integrationOwnsFirstPaintScript({ ui: { theme: { initScript: false } } })).toBe(false);
  });
});

function makeResolved(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ui: true, colorMode: {} as ResolvedConfig['colorMode'], ...overrides } as ResolvedConfig;
}

describe('resolveColorModeOwnership()', () => {
  it('ui 接管 + 未配置 colorMode → 关闭且不告警', () => {
    const resolved = makeResolved();
    resolveColorModeOwnership(resolved, {} as UbeanConfig);
    expect(resolved.colorMode).toBe(false);
  });

  it('ui 接管 + 显式 colorMode → ui 胜出，colorMode 置 false', () => {
    const resolved = makeResolved({ colorMode: {} as ResolvedConfig['colorMode'] });
    resolveColorModeOwnership(resolved, { colorMode: true } as UbeanConfig);
    expect(resolved.colorMode).toBe(false);
  });

  it('ui 未启用 → colorMode 原样保留', () => {
    const original = {} as ResolvedConfig['colorMode'];
    const resolved = makeResolved({ ui: false, colorMode: original });
    resolveColorModeOwnership(resolved, { colorMode: true } as UbeanConfig);
    expect(resolved.colorMode).toBe(original);
  });

  it('ui.theme.initScript: false → colorMode 保留（用户自己插脚本）', () => {
    const original = {} as ResolvedConfig['colorMode'];
    const resolved = makeResolved({
      ui: { theme: { initScript: false } },
      colorMode: original
    });
    resolveColorModeOwnership(resolved, { colorMode: true } as UbeanConfig);
    expect(resolved.colorMode).toBe(original);
  });
});
