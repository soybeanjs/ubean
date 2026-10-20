import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * `pages.extensions` 的解析与编译器推导。
 *
 * 这组用例锁的是一条**跨三层的一致性契约**：`pages.extensions` 同时决定
 * 1. `scanPages` 扫描哪些后缀（路由表里有什么）
 * 2. Vite 注入哪个编译器（产物能不能构建）
 *
 * 两者脱节是真实事故：扫描层默认收 tsx 但没有 jsx 编译器时，`src/pages/x.tsx`
 * 会先被算进路由、再在构建期抛 `[PARSE_ERROR] Unexpected JSX expression`
 * （扫描日志说 4 pages，构建直接死）。所以这里既断言归一化，也断言派生。
 *
 * `defu` 那条尤其重要：它对数组做**拼接**，`{ extensions: ['vue'] }` 会被合并成
 * `['vue','vue','tsx','jsx']` —— 关掉 JSX 的意图静默失效。所以解析必须基于用户
 * 原始值，不能走 `defu(config, defaults)`。
 */
import { describe, expect, it, vi } from 'vitest';
import { PAGE_EXTENSIONS, pagesConfigDefaults, resolvePageCompilers, resolvePagesConfig } from '../src/pages';

describe('resolvePagesConfig', () => {
  it('未配置时默认全开', () => {
    expect(resolvePagesConfig(undefined)).toEqual({ extensions: ['vue', 'tsx', 'jsx'] });
    expect(pagesConfigDefaults.extensions).toEqual([...PAGE_EXTENSIONS]);
  });

  it('用户数组覆盖默认值（不拼接、不去重前的前缀残留）', () => {
    expect(resolvePagesConfig({ extensions: ['vue'] })).toEqual({ extensions: ['vue'] });
  });

  it('归一化：前导点、大小写、重复项、空串', () => {
    expect(resolvePagesConfig({ extensions: ['.Vue', ' vue ', 'TSX', '', 'tsx'] })).toEqual({
      extensions: ['vue', 'tsx']
    });
  });

  it('空数组回落到默认值（没有页面可扫一定是笔误）', () => {
    expect(resolvePagesConfig({ extensions: [] })).toEqual({ extensions: [...PAGE_EXTENSIONS] });
  });
});

describe('resolvePageCompilers', () => {
  it('vue → plugin-vue only', () => {
    expect(resolvePageCompilers(['vue'])).toEqual({ vue: true, jsx: false });
  });

  it('tsx 或 jsx 任一 → plugin-vue-jsx', () => {
    expect(resolvePageCompilers(['vue', 'tsx'])).toEqual({ vue: true, jsx: true });
    expect(resolvePageCompilers(['vue', 'jsx'])).toEqual({ vue: true, jsx: true });
  });

  it('两者都要时同时注入', () => {
    expect(resolvePageCompilers(['vue', 'tsx', 'jsx'])).toEqual({ vue: true, jsx: true });
  });
});

describe('loadUbeanConfigSync 的 pages 派生（防 defu 数组拼接）', () => {
  const dirs: string[] = [];
  const write = (config: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'ubean-pages-ext-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'ubean.config.ts'), config, 'utf-8');
    return dir;
  };

  /**
   * 每条用例重新 import：`loadUbeanConfigSync` 把结果写进模块级单例 `cachedConfig`
   * （`packages/config/src/loader.ts`），不重置就会读到上一条用例的配置。
   */
  const load = async (dir: string) => {
    vi.resetModules();
    const mod = (await import('../src/loader')) as typeof import('../src/loader');
    return mod.loadUbeanConfigSync(dir);
  };

  // fixture 不 import `ubean` —— tmpdir 下解析不到包；`defineConfig` 只是 identity 函数，
  // 纯对象写法的解析路径完全一致。
  it('关掉 JSX 后配置里只剩 vue（defu 拼接会让它变成 4 个元素）', async () => {
    const dir = write(`export default { pages: { extensions: ['vue'] } };`);
    try {
      const config = await load(dir);
      expect(config.pages.extensions).toEqual(['vue']);
      expect(resolvePageCompilers(config.pages.extensions)).toEqual({ vue: true, jsx: false });
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });

  it('不写 pages → 默认全开，并推导出两个编译器', async () => {
    const dir = write(`export default {};`);
    try {
      const config = await load(dir);
      expect(config.pages.extensions).toEqual(['vue', 'tsx', 'jsx']);
      expect(resolvePageCompilers(config.pages.extensions)).toEqual({ vue: true, jsx: true });
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });
});
