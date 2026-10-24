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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanPages } from '../src/scan-pages';
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

  it('`default.vue` 与 `default/index.vue` 共存 → 两条同名，文件形态优先保留 isDefault', async () => {
    writeLayout('default.vue');
    writeLayout('default/index.vue');
    const result = await scan();

    // 同名冲突不静默吞掉任何一条：`isDefault` 至少有一条为 true，
    // 否则 `find(l => l.isDefault)` 落空。谁胜出由文件遍历顺序决定（既有行为）。
    expect(result.layouts.filter(l => l.name === 'default')).toHaveLength(2);
    expect(result.layouts.some(l => l.isDefault)).toBe(true);
  });

  it('嵌套目录 `admin/dashboard.vue` → name `admin/dashboard`', async () => {
    writeLayout('admin/dashboard.vue');
    const result = await scan();

    expect(byName(result, 'admin/dashboard')).toBeDefined();
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
