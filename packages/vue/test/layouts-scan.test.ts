/**
 * 布局扫描约定：文件形态 / 目录形态 / 扩展名集合。
 *
 * 三种约定都必须产出**同一个**布局名，且只有 `default` 系（含目录形态）是默认布局：
 * - `layouts/admin.vue`        → name `admin`
 * - `layouts/admin/index.vue`  → name `admin`（文档已承诺的目录形态）
 * - `layouts/default.vue`      → name `default` + isDefault
 * - `layouts/default/index.vue`→ name `default` + isDefault（此前漏判，默认布局静默失效）
 *
 * 扩展名与 `pages.extensions` 同源（默认 vue / tsx / jsx，不含 `ts`）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { clearScanWarnings, scanPages } from '../src/scan-pages';
import type { ScanPagesResult, ScannedLayout } from '../src/types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-layouts-scan-'));
  mkdirSync(join(tmpDir, 'src', 'pages'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** 写入一个布局文件（自动建父目录）。 */
function writeLayout(rel: string, source = '<template><slot /></template>'): void {
  const full = join(tmpDir, 'src', 'layouts', rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, source);
}

async function scan(extensions?: string[]): Promise<ScanPagesResult> {
  return scanPages({ cwd: tmpDir, srcDir: 'src', pagesDir: 'pages', layoutsDir: 'layouts', extensions });
}

const byName = (result: ScanPagesResult, name: string): ScannedLayout | undefined =>
  result.layouts.find(l => l.name === name);

describe('scanPages — 布局命名约定', () => {
  it('文件形态 `xx.vue` → name `xx`，非默认布局', async () => {
    writeLayout('admin.vue');
    const result = await scan();

    expect(byName(result, 'admin')).toMatchObject({ name: 'admin', isDefault: false, relativePath: 'admin.vue' });
  });

  it('目录形态 `xx/index.vue` → name `xx`，非默认布局', async () => {
    writeLayout('admin/index.vue');
    const result = await scan();

    expect(byName(result, 'admin')).toMatchObject({ name: 'admin', isDefault: false, relativePath: 'admin/index.vue' });
  });

  it('`default.vue` → 默认布局', async () => {
    writeLayout('default.vue');
    const result = await scan();

    expect(byName(result, 'default')).toMatchObject({ name: 'default', isDefault: true });
  });

  it('`default/index.vue`（目录形态的默认布局）→ 仍是默认布局', async () => {
    writeLayout('default/index.vue');
    const result = await scan();

    expect(byName(result, 'default')).toMatchObject({ name: 'default', isDefault: true });
    // 关键断言：`layouts.find(l => l.isDefault)` 是框架找默认布局的唯一判据，
    // 落空意味着没有 default.vue 的项目默认布局直接失效。
    expect(result.layouts.find(l => l.isDefault)?.name).toBe('default');
  });

  it('根 `index.vue` → 默认布局（历史形态）', async () => {
    writeLayout('index.vue');
    const result = await scan();

    expect(byName(result, 'default')?.isDefault).toBe(true);
  });

  it('`default.vue` 与 `default/index.vue` 共存 → 文件形态胜出且仍是默认布局', async () => {
    writeLayout('default.vue');
    writeLayout('default/index.vue');
    const result = await scan();

    // 两条同名会让虚拟模块生成重复的 `const Layout_default`（编译期直接失败），
    // 所以扫描期只留 `files.sort()` 的第一条；两者都是默认布局，留谁都对。
    expect(result.layouts.filter(l => l.name === 'default')).toHaveLength(1);
    expect(result.layouts.find(l => l.isDefault)?.relativePath).toBe('default.vue');
  });

  it('两层以外的文件不收：`admin/dashboard.vue`（深度 2，非 index）', async () => {
    writeLayout('admin/dashboard.vue');
    const result = await scan();

    expect(byName(result, 'admin/dashboard')).toBeUndefined();
    expect(result.layouts).toHaveLength(0);
  });

  it('`admin/index.vue` 与 `admin.vue` 是同一个名字（两种写法）', async () => {
    writeLayout('admin/index.vue');
    const result = await scan();

    expect(byName(result, 'admin')).toMatchObject({ name: 'admin', relativePath: 'admin/index.vue' });
  });

  it('`layouts/components/foo.vue` 不是布局（非 index）', async () => {
    writeLayout('components/foo.vue');
    writeLayout('default.vue');
    const result = await scan();

    expect(result.layouts.map(l => l.name)).toEqual(['default']);
  });

  it('`_` 前缀的文件与目录都不收', async () => {
    writeLayout('_hidden.vue');
    writeLayout('_partials/nav.vue');
    writeLayout('_partials/index.vue');
    writeLayout('default.vue');
    const result = await scan();

    expect(result.layouts.map(l => l.name)).toEqual(['default']);
  });
});

describe('scanPages — 布局扩展名', () => {
  it('默认集合是 vue / tsx / jsx，不含 ts', async () => {
    writeLayout('a.vue');
    writeLayout('b.tsx');
    writeLayout('c.jsx');
    writeLayout('d.ts');
    const result = await scan();

    expect(result.layouts.map(l => l.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it("`extensions: ['vue']` 关掉 JSX 后不再扫 tsx/jsx", async () => {
    writeLayout('a.vue');
    writeLayout('b.tsx');
    writeLayout('c.jsx');
    const result = await scan(['vue']);

    expect(result.layouts.map(l => l.name)).toEqual(['a']);
  });

  it('显式把 ts 写进 extensions 时布局也收 ts', async () => {
    writeLayout('a.vue');
    writeLayout('d.ts');
    const result = await scan(['vue', 'ts']);

    expect(result.layouts.map(l => l.name).sort()).toEqual(['a', 'd']);
  });

  it('markdown 后缀不进入布局集合（布局不是 markdown 页面）', async () => {
    writeLayout('a.vue');
    writeLayout('b.md');
    const result = await scan();

    expect(result.layouts.map(l => l.name)).toEqual(['a']);
  });

  it('目录形态的 tsx 布局也被扫到（`admin/index.tsx`）', async () => {
    writeLayout('admin/index.tsx', 'export default { render: () => null };');
    const result = await scan();

    expect(byName(result, 'admin')).toMatchObject({ name: 'admin', isDefault: false });
  });
});

describe('scanPages — 布局同名冲突', () => {
  let warnSpy: MockInstance;

  beforeEach(() => {
    clearScanWarnings();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // 同名两条会在虚拟模块里生成重复的 `const Layout_X`，整份路由表编译失败，
  // 因此扫描期就必须只留一条（`files.sort()` 先到先得）。
  it('`default.vue` + `default/index.vue` 只保留一条并告警', async () => {
    writeLayout('default.vue');
    writeLayout('default/index.vue');
    const result = await scan();

    expect(result.layouts).toHaveLength(1);
    expect(byName(result, 'default')).toMatchObject({ relativePath: 'default.vue', isDefault: true });
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('default/index.vue');
  });

  it('`admin.vue` + `admin/index.tsx` 只保留一条并告警', async () => {
    writeLayout('admin.tsx', 'export default { render: () => null };');
    writeLayout('admin/index.vue');
    const result = await scan(['vue', 'tsx']);

    expect(result.layouts.map(l => l.name)).toEqual(['admin']);
    expect(warnSpy.mock.calls.flat().join('\n')).toContain('同名布局');
  });

  it('名字不同的近邻不算冲突（`a/index.vue` → `a`，`b.vue` → `b`）', async () => {
    writeLayout('a/index.vue');
    writeLayout('b.vue');
    const result = await scan();

    expect(result.layouts.map(l => l.name)).toEqual(['a', 'b']);
    expect(warnSpy.mock.calls.flat().join('\n')).not.toContain('同名布局');
  });
});
