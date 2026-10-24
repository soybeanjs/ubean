/**
 * 同一路径重复声明的处理：先到先得 + 告警。
 *
 * 不处理会坏三种方式，其中两种是编译/运行时硬错：
 * - `a.vue` + `a.tsx`              → 两份 `const Page_A`，模块重复声明
 * - `a.vue` + `a.reuse.ts`（同名）  → `const Page_A = Page_A`，顶层 TDZ
 * - `a.vue` + `a/index.vue`        → 第二条在路由表里成孤儿（能构建，静默丢页）
 *
 * 并行路由的插槽页与此不同：它们**本就**共享同一个 URL 和派生名，不属于重复，
 * 必须两条都留，且各自拿到独立的 loader 变量名。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { clearScanWarnings, scanPages } from '../src/scan-pages';
import { generatePagesModuleSource } from '../src/virtual-pages';
import type { ScanPagesResult } from '../src/types';

let tmpDir: string;
let warnSpy: MockInstance;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-collisions-'));
  mkdirSync(join(tmpDir, 'src', 'pages'), { recursive: true });
  mkdirSync(join(tmpDir, 'src', 'layouts'), { recursive: true });
  clearScanWarnings();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writePage(rel: string, source = '<template><slot /></template>'): void {
  const full = join(tmpDir, 'src', 'pages', rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, source);
}

async function scan(): Promise<ScanPagesResult> {
  return scanPages({ cwd: tmpDir, srcDir: 'src', pagesDir: 'pages', layoutsDir: 'layouts' });
}

function moduleSource(result: ScanPagesResult): string {
  return generatePagesModuleSource({ pages: result.pages, layouts: result.layouts } as never);
}

/** 生成的虚拟模块必须是合法 JS（重复 `const` 在这里就会抛）。 */
function assertParses(source: string): void {
  expect(() => new Function(source.replace(/^\/\/.*$/gm, '').replace(/^export /gm, ''))).not.toThrow();
}

const warnings = (): string => warnSpy.mock.calls.flat().join('\n');

describe('scanPages — 同路径重复声明', () => {
  it('`a.vue` + `a/index.vue` 只留一条，另一条不再是孤儿', async () => {
    writePage('a.vue');
    writePage('a/index.vue');
    const result = await scan();

    expect(result.pages.map(p => p.relativePath)).toEqual(['a.vue']);
    expect(warnings()).toContain('a/index.vue');
    expect(warnings()).toContain('/a');
  });

  it('`a.vue` + `a.tsx` 只留一条，模块没有重复的 `const`', async () => {
    writePage('a.vue');
    writePage('a.tsx', 'export default { render: () => null };');
    const result = await scan();

    expect(result.pages.map(p => p.relativePath)).toEqual(['a.tsx']);
    assertParses(moduleSource(result));
    expect(warnings()).toContain('a.vue');
  });

  it('`a.vue` + 同名 `a.reuse.ts` 不会生成 `const Page_A = Page_A`', async () => {
    writePage('a.vue');
    writePage('a.reuse.ts', '<script>definePage({ reuse: "A" })</script>');
    const result = await scan();
    const source = moduleSource(result);

    assertParses(source);
    expect(source).not.toMatch(/const Page_A = Page_A;/);
    expect(result.pages).toHaveLength(1);
  });

  it('`definePage({ path })` 给不同路径时不算冲突', async () => {
    writePage('a.vue', '<script setup>definePage({ path: "/x" })</script>');
    writePage('a/index.vue', '<script setup>definePage({ path: "/y" })</script>');
    const result = await scan();

    expect(result.pages.map(p => p.path).sort()).toEqual(['/x', '/y']);
    expect(warnings()).toBe('');
  });
});

describe('scanPages — 并行路由不参与去重', () => {
  it('插槽页与默认页同 URL 时两条都留、默认视图没丢', async () => {
    writePage('photo/[id].vue');
    writePage('@dialog/photo/[id].vue');
    const result = await scan();

    expect(result.pages).toHaveLength(2);
    expect(warnings()).toBe('');

    const source = moduleSource(result);
    assertParses(source);
    // 两个视图各自的组件都在，变量名不撞；谁先拿到无后缀的名字由文件名序决定，
    // 所以断言按“插槽名指向与默认名不同的那个变量”来写。
    const names = [...source.matchAll(/const (Page_PhotoId\w*) = /g)].map(m => m[1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    const dialogVar = source.match(/"dialog": (Page_\w+)/)?.[1];
    const defaultVar = source.match(/default: (Page_\w+)/)?.[1];
    expect(dialogVar).toBeDefined();
    expect(defaultVar).toBeDefined();
    expect(dialogVar).not.toBe(defaultVar);
  });
});
