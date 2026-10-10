/**
 * `resolveUbeanConfig` 的未知顶层 key 警告。
 *
 * c12 不做未知字段校验，`defineConfig` 只是 identity 函数，于是两类事故都是静默的：
 * 写错层级（顶层 `preset: 'vercel'` 从来不被读取）与拼错字段名（`autoImport` 少了 s）。
 * 这条守住警告存在、措辞含正确写法、且**不误报**合法配置。
 *
 * 用 `vi.resetModules()` + 动态 import：`loadUbeanConfigSync` 把结果写进模块级单例
 * `cachedConfig`，同进程第二次加载直接命中缓存，第二条用例会读到第一条的配置
 * （`derived-defaults.test.ts` 的文件头记了同一个坑）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dirs: string[] = [];
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

/** 在 tmpdir 下建一个只有 `ubean.config.ts` 的项目（不 import `ubean`，避免 fixture 解析不到包）。 */
function projectWithConfig(configSource: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ubean-unknown-keys-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'ubean.config.ts'), configSource);
  return dir;
}

async function loadConfig(configSource: string): Promise<void> {
  const { loadUbeanConfigSync } = (await import('../src/loader')) as typeof import('../src/loader');
  loadUbeanConfigSync(projectWithConfig(configSource));
}

/** 只取本文件关心的那条警告（避免被同进程其它 console.warn 干扰）。 */
function unknownKeyWarnings(): string[] {
  return warnSpy.mock.calls.map(args => String(args[0])).filter(message => message.includes('Unknown config option'));
}

describe('未知顶层配置 key 警告', () => {
  it('顶层的 preset 会被点名，并提示正确的 build.preset 写法', async () => {
    await loadConfig("export default { preset: 'vercel' };\n");

    const warnings = unknownKeyWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('`preset` (did you mean `build.preset`?)');
    // 警告必须说明后果，否则用户不知道「忽略」意味着构建仍按默认预设产出
    expect(warnings[0]).toContain('ignored');
  });

  it('拼错的字段名会被点名', async () => {
    await loadConfig("export default { autoImport: true, colourScheme: 'dark' };\n");

    const warnings = unknownKeyWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('`autoImport`');
    expect(warnings[0]).toContain('`colourScheme`');
  });

  it('合法配置不触发警告（含 c12 的 $env 约定键）', async () => {
    await loadConfig(
      [
        'export default {',
        "  srcDir: 'app',",
        "  mode: 'spa',",
        "  build: { preset: 'vercel', outputDir: 'out' },",
        '  $env: { production: { srcDir: "prod" } },',
        '  routeRules: { "/api/**": { cache: { ttl: 60 } } },',
        "  modules: ['@ubean/icon'],",
        '  dir: { pages: "pages" }',
        '};',
        ''
      ].join('\n')
    );

    expect(unknownKeyWarnings()).toEqual([]);
  });

  it('空配置不触发警告', async () => {
    await loadConfig('export default {};\n');
    expect(unknownKeyWarnings()).toEqual([]);
  });
});
