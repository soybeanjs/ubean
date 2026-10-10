/**
 * `resolvePresetByName` 的未命中回退行为。
 *
 * 回退到 `standard` 是刻意的（避免配置里一个 typo 直接炸构建），但它**曾经是静默的**：
 * `preset: 'vercle'` 表现为"一切正常" —— 构建按 Node 兼容的 standard 预设产出，
 * 直到部署到目标平台才失败。这条守住警告存在、含输入的名字、且给出可用名字清单。
 *
 * 别名不做额外断言（`presets.test.ts` 已覆盖），这里只锁回退路径本身。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPresetNames, resolvePresetByName } from '../src';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('resolvePresetByName 的未命中回退', () => {
  it('拼错的预设名回退到 standard，并打印含输入名与可用名的警告', () => {
    const preset = resolvePresetByName('vercle');

    expect(preset.name).toBe('standard');

    const warnings = warnSpy.mock.calls.map(args => String(args[0]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"vercle"');
    expect(warnings[0]).toContain('falling back to "standard"');
    // 警告必须列出可用名字，否则用户只知道写错了、不知道写什么
    for (const name of getPresetNames()) {
      expect(warnings[0]).toContain(name);
    }
  });

  it('命中规范名时不警告', () => {
    expect(resolvePresetByName('vercel').name).toBe('vercel');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('命中别名时不警告', () => {
    expect(resolvePresetByName('cf').name).toBe('cloudflare');
    expect(resolvePresetByName('node-server').name).toBe('node');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
