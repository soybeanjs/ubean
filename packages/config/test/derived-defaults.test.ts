/**
 * TS-14 · 派生默认值矩阵：`electron` × `ssr`（§6.3「`electron` × `ssr` 2 格」）
 *
 * 这一组断言的是**派生**默认值，不是配置回读：`electron: true` 时 `ssr` 的默认值必须变成关闭，
 * 这是 `AGENTS.md` 与配置类型文档都写明的行为契约（「启用 `electron: true` 时，`ssr` 默认值改为
 * `false`（桌面应用无需 SSR，除非显式指定 `ssr: true`）」）。断言一个**被推导出来的**值，就是在
 * 断言这条契约本身；而「输入 5 就断言读回 5」那种回读才是 §5 TS-14 验收①要禁止的。
 *
 * 运行时效果（`ssr: false` → CSR 外壳）另在 `packages/app/test/config-matrix.test.ts` 的
 * ssr 优先级链里断言 —— 两层各证明自己那一环，合起来是 `electron → ssr:false → CSR 外壳`。
 *
 * 为什么用 `vi.resetModules()` + 动态 import：`loadUbeanConfigSync` 的结果写进**模块级单例**
 * `cachedConfig`（`packages/config/src/loader.ts:260`），同一进程第二次加载直接命中缓存，
 * 于是「第二条用例读到第一条的配置」——现有 `loader-sync-default.test.ts` 为此只能保留一个用例。
 * 这里用 `vi.resetModules()` 让每条用例拿到**重新求值**的模块实例，从而能覆盖 2 格（+ 2 个对照）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dirs: string[] = [];

beforeEach(() => {
  // 清掉模块注册表，让下面的动态 import 重新求值（也就重新初始化 `cachedConfig = null`）
  vi.resetModules();
});

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

/** 在 tmpdir 下建一个只有 `ubean.config.ts` 的项目（不 import `ubean`，避免 fixture 解析不到包）。 */
function projectWithConfig(configSource: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ubean-derived-defaults-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'ubean.config.ts'), configSource);
  return dir;
}

interface LoadedConfig {
  ssr: { enabled: boolean; all: boolean; exclude: string[]; streaming: boolean };
}

async function loadConfig(configSource: string): Promise<LoadedConfig> {
  const { loadUbeanConfigSync } = (await import('../src/loader')) as typeof import('../src/loader');
  return loadUbeanConfigSync(projectWithConfig(configSource)) as unknown as LoadedConfig;
}

describe('TS-14 · electron × ssr 派生默认值', () => {
  it('electron: true 且未显式给 ssr → ssr 默认关闭（enabled=false）', async () => {
    const config = await loadConfig(`export default { electron: true };`);

    expect(config.ssr.enabled).toBe(false);
    expect(config.ssr.all).toBe(false);
  });

  it('electron: true 但显式 ssr: true → 用户的显式值优先（enabled=true）', async () => {
    const config = await loadConfig(`export default { electron: true, ssr: true };`);

    expect(config.ssr.enabled).toBe(true);
    expect(config.ssr.all).toBe(true);
  });

  it('对照：未启用 electron 且未给 ssr → 默认开启（enabled=true）', async () => {
    const config = await loadConfig(`export default {};`);

    expect(config.ssr.enabled).toBe(true);
  });
});
