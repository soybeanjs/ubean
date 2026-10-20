/**
 * `.meta.ts` / `.meta.js` 元数据页 + `definePage({ routable })` 扫描与产物测试。
 *
 * 这个文件存在的理由是**两个互相咬合的约定**：
 *
 * 1. `.meta.*` 是只有 `definePage`、没有组件实现的文件。扫描器必须认出它
 *    （`isMeta`），否则会把它当成普通页面 —— 生成的 loader 指向一个没有
 *    default export 的模块，运行时解析出空组件。
 * 2. `routable: false` 让页面留在「扫描清单」里但不产生路由记录。这是宿主
 *    （如 soybean-admin 的菜单目录 / 外链入口）声明「不是路由」的唯一出口 ——
 *    框架不认识 catalog / iframe / link 这些业务词。
 *
 * 两者必须同时成立：`.meta.*` 的**文件名本身即 `routable: false`**（省略字段即可，
 * 显式写 `true` 会在扫描期报错，而不是静默降级成一条坏路由），`routable: false`
 * 的普通页面仍要保留组件 loader（`.reuse.ts` 靠它借组件）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scanPages } from '../src/scan-pages';
import type { ScannedPage } from '../src/types';
import { generatePagesModuleSource, generateTypedRouter } from '../src/virtual-pages';

let tmpDir: string;
let pagesDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-meta-pages-'));
  pagesDir = join(tmpDir, 'src', 'pages');
  mkdirSync(pagesDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const full = join(pagesDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

async function scan() {
  return scanPages({
    cwd: tmpDir,
    srcDir: 'src',
    pagesDir: 'pages',
    layoutsDir: 'layouts'
  });
}

describe('scanPages — .meta.ts 元数据页', () => {
  it('识别 isMeta，名称按去掉 .meta 后缀的 basename 派生', async () => {
    writeFile(
      'plugin/index.meta.ts',
      `export default definePage({ meta: { menuType: 'directory' } });`
    );

    const result = await scan();
    const entry = result.pages.find(p => p.isMeta);

    expect(entry).toBeDefined();
    expect(entry?.relativePath).toBe('plugin/index.meta.ts');
    // 名称派生与普通 `users/index.vue` → `UsersIndex` 一致（index 不作为特殊段）。
    expect(entry?.name).toBe('PluginIndex');
    expect(entry?.route).toBe('/plugin');
    // 文件名即语义：`.meta.*` 省略 `routable` 时被归一化为 false。
    expect(entry?.routable).toBe(false);
  });

  it('`.meta.*` 省略 routable 即默认 false，不需要用户再抄一遍布尔值', async () => {
    writeFile('plugin/index.meta.ts', `definePage({ meta: { menuType: 'directory' } });`);

    const result = await scan();
    const entry = result.pages.find(p => p.isMeta);

    expect(entry?.routable).toBe(false);
    // 显式 `routable: false` 仍然有效（向后兼容，不构成 BREAKING）。
    writeFile('legacy.meta.ts', `definePage({ routable: false });`);
    const legacy = (await scan()).pages.find(p => p.name === 'Legacy');
    expect(legacy?.routable).toBe(false);
  });

  it('`.meta.*` 显式声明 `routable: true` 直接报错（没有组件实现，必然产出坏路由）', async () => {
    writeFile('plugin/index.meta.ts', `definePage({ routable: true, meta: { menuType: 'directory' } });`);

    await expect(scan()).rejects.toThrow(/routable: true/);
  });

  it('.meta.js 同样被识别', async () => {
    writeFile('legacy.meta.js', `definePage({ routable: false });`);

    const result = await scan();
    expect(result.pages.find(p => p.name === 'Legacy')?.isMeta).toBe(true);
  });

  it('`.meta.vue` 不在约定内 —— 按普通组件页处理', async () => {
    writeFile('widget.meta.vue', `<template><div /></template>`);

    const result = await scan();
    const entry = result.pages[0];

    expect(entry.isMeta).toBe(false);
    expect(entry.routable).toBe(true);
    expect(entry.relativePath).toBe('widget.meta.vue');
  });

  it('元数据页声明 reuse 会报错（元数据页不产生路由，reuse 需要一个新 URL）', async () => {
    writeFile('alias.meta.ts', `definePage({ routable: false, reuse: 'About' });`);

    await expect(scan()).rejects.toThrow(/不能声明 `reuse`/);
  });

  it('元数据页不能作为 reuse 的目标', async () => {
    writeFile('about.vue', `<template><div /></template>`);
    writeFile('dir/index.meta.ts', `definePage({ routable: false });`);
    writeFile('alias.reuse.ts', `definePage({ reuse: 'Dir' });`);

    // 目标不存在于「有组件实现的页面」集合 → 扫描器告警（不抛错）
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await scan();
    spy.mockRestore();

    const alias = result.pages.find(p => p.isReuse);
    expect(alias).toBeDefined();
    // reuse 仍被解析（cache 继承找不到 target 就不继承），但不会指向元数据页
    expect(result.pages.find(p => p.name === 'DirIndex')?.isMeta).toBe(true);
  });
});

describe('scanPages — routable: false 的普通页面', () => {
  it('页面保留组件实现，但被标记为不可路由', async () => {
    writeFile('about.vue', `<template><div /></template>`);
    writeFile(
      'hidden.vue',
      `<script setup lang="ts">
definePage({ routable: false, meta: { menuType: 'link', href: 'https://example.com' } });
</script>
<template><div /></template>`
    );

    const result = await scan();
    const hidden = result.pages.find(p => p.name === 'Hidden');

    expect(hidden?.isMeta).toBe(false);
    expect(hidden?.routable).toBe(false);
    expect(hidden?.fullPath).toContain('hidden.vue');
  });

  it('未声明 routable 的页面默认 routable 为 true', async () => {
    writeFile('about.vue', `<template><div /></template>`);

    const result = await scan();
    expect(result.pages[0].routable).toBe(true);
  });
});

describe('generatePagesModuleSource — 非路由页', () => {
  function page(overrides: Partial<ScannedPage>): ScannedPage {
    return {
      fullPath: '/app/src/pages/x.vue',
      relativePath: 'x.vue',
      dirname: '/app/src/pages',
      basename: 'x.vue',
      name: 'X',
      route: '/x',
      path: '/x',
      isReuse: false,
      isMeta: false,
      routable: true,
      isMarkdown: false,
      ...overrides
    };
  }

  const layouts: never[] = [];

  it('routable: false 的页面不产生路由记录（但仍出现在 pages 清单）', () => {
    const source = generatePagesModuleSource({
      pages: [page({ name: 'About', route: '/about' }), page({ name: 'Hidden', route: '/hidden', routable: false })],
      layouts
    });

    // routes 数组只含可路由页
    const routesBlock = source.slice(source.indexOf('export const routes = ['), source.indexOf('const _layoutLoaders'));
    expect(routesBlock).toContain('name: "About"');
    expect(routesBlock).not.toContain('name: "Hidden"');

    // pages 清单（宿主用于菜单/路由声明一致性校验）仍含有它
    expect(source).toContain('"Hidden": { name: "Hidden"');
  });

  it('routable: false 的组件页仍保留 loader —— reuse 靠它借组件', () => {
    const source = generatePagesModuleSource({
      pages: [page({ name: 'Hidden', route: '/hidden', routable: false })],
      layouts
    });

    expect(source).toContain('const Page_Hidden = () => import(');
    expect(source).toContain('"Hidden": Page_Hidden');
    expect(source).toContain('export const pageNames = ["Hidden"]');
  });

  it('isMeta 页既不产生路由也不产生 loader（模块没有 default export）', () => {
    const source = generatePagesModuleSource({
      pages: [page({ name: 'Dir', route: '/dir', isMeta: true, routable: false, relativePath: 'dir/index.meta.ts' })],
      layouts
    });

    expect(source).not.toContain('Page_Dir = () => import');
    const routesBlock = source.slice(source.indexOf('export const routes = ['));
    expect(routesBlock.slice(0, routesBlock.indexOf('const _layoutLoaders'))).not.toContain('/dir');
  });

  it('pages 导出带 routable / isMeta / pageMeta，供宿主读应用层语义', () => {
    const source = generatePagesModuleSource({
      pages: [
        page({
          name: 'Dir',
          route: '/dir',
          isMeta: true,
          routable: false,
          pageMeta: { routable: false, meta: { menuType: 'directory', title: '插件' } }
        })
      ],
      layouts
    });

    expect(source).toContain('routable: false');
    expect(source).toContain('isMeta: true');
    expect(source).toContain('"menuType":"directory"');
  });
});

describe('generateTypedRouter — 非路由页不进 RouteNamedMap', () => {
  it('routable: false 的页面被排除', () => {
    const dts = generateTypedRouter({
      pages: [
        {
          fullPath: '/app/src/pages/about.vue',
          relativePath: 'about.vue',
          dirname: '/app/src/pages',
          basename: 'about.vue',
          name: 'About',
          route: '/about',
          path: '/about',
          isReuse: false,
          isMeta: false,
          routable: true,
          isMarkdown: false
        },
        {
          fullPath: '/app/src/pages/hidden.meta.ts',
          relativePath: 'hidden.meta.ts',
          dirname: '/app/src/pages',
          basename: 'hidden.meta.ts',
          name: 'Hidden',
          route: '/hidden',
          path: '/hidden',
          isReuse: false,
          isMeta: true,
          routable: false,
          isMarkdown: false
        }
      ],
      layouts: []
    });

    expect(dts).toContain('"About":');
    expect(dts).not.toContain('"Hidden":');
  });
});
