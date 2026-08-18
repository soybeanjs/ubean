/**
 * 实体路由文件生成器测试(原 `@ubean/scan/generator`,已下沉到本包)。
 *
 * 覆盖:
 * - routes.ts / imports.ts / typed-router.d.ts 三文件产出
 * - reuse 路由 component 指向目标页的 key
 * - matchers 注入 route meta
 * - RouteNamedMap 的动态参数类型化(ParamValue / ParamValueZeroOrOne)
 * - dts 增强的模块契约仍为 `@ubean/scan`(框架既有类型契约)
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateRouteFiles, RouteFileGenerator, DEFAULT_HEADER_COMMENT } from '../src/generator';
import type { ScannedPage, ScannedLayout } from '../src/types';

let tmpDir: string;
let srcDir: string;
let outDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-gen-'));
  srcDir = join(tmpDir, 'src');
  outDir = join(tmpDir, 'src', 'router', '_generated');
  mkdirSync(join(srcDir, 'pages'), { recursive: true });
  mkdirSync(join(srcDir, 'layouts'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function page(partial: Partial<ScannedPage> & { name: string; route: string }): ScannedPage {
  const rel = `pages/${partial.name}.vue`;
  const fullPath = join(srcDir, rel);
  writeFileSync(fullPath, '<template/>');
  return {
    fullPath,
    relativePath: rel,
    dirname: 'pages',
    basename: partial.name,
    path: partial.route,
    isReuse: false,
    isMarkdown: false,
    ...partial
  };
}

function layout(name: string): ScannedLayout {
  const rel = `layouts/${name}.vue`;
  const fullPath = join(srcDir, rel);
  writeFileSync(fullPath, '<template/>');
  return { fullPath, relativePath: rel, dirname: 'layouts', basename: name, name, path: `/${name}`, isDefault: name === 'default' };
}

describe('generateRouteFiles', () => {
  it('产出 routes.ts / imports.ts / typed-router.d.ts', async () => {
    const result = await generateRouteFiles(
      { pages: [page({ name: 'Home', route: '/' }), page({ name: 'UsersId', route: '/users/:id' })], layouts: [layout('default')] },
      { cwd: tmpDir, srcDir, outDir }
    );

    expect(result.routeCount).toBe(2);
    expect(result.layoutCount).toBe(1);

    const routes = readFileSync(join(outDir, 'routes.ts'), 'utf-8');
    expect(routes).toContain(`name: "UsersId"`);
    expect(routes).toContain(`path: "/users/:id"`);

    const imports = readFileSync(join(outDir, 'imports.ts'), 'utf-8');
    expect(imports).toContain(`UsersId: () => import("@/pages/UsersId.vue")`);
    expect(imports).toContain(`export type RouteKey = 'Home' | 'UsersId'`);

    const dts = readFileSync(join(outDir, 'typed-router.d.ts'), 'utf-8');
    expect(dts).toContain(`declare module '@ubean/scan'`);
    expect(dts).toContain(`"UsersId": RouteRecordInfo<"UsersId", "/users/:id"`);
  });

  it('reuse 路由 component 指向目标页 key,且不进 views 映射', async () => {
    const about = page({ name: 'About', route: '/about' });
    const about2 = page({ name: 'About2', route: '/about2', isReuse: true, reuseTarget: 'About' });

    await generateRouteFiles({ pages: [about, about2], layouts: [] }, { cwd: tmpDir, srcDir, outDir });

    const routes = readFileSync(join(outDir, 'routes.ts'), 'utf-8');
    expect(routes).toContain(`component: "About"`); // reuse → target key
    expect(routes).toContain(`reuse: true`);

    const imports = readFileSync(join(outDir, 'imports.ts'), 'utf-8');
    expect(imports).not.toContain(`About2: () => import`);
    expect(imports).toContain(`export type RouteReuseKey = 'About2'`);
  });

  it('matchers 注入 route meta;getRouteMeta 提供的额外 meta 不覆盖 definePage meta', async () => {
    const p = page({
      name: 'UsersId',
      route: '/users/:id',
      matchers: { id: 'numeric' },
      pageMeta: { meta: { section: 'users' } }
    });

    await generateRouteFiles({ pages: [p], layouts: [] }, {
      cwd: tmpDir,
      srcDir,
      outDir,
      getRouteMeta: () => ({ section: 'override-attempt', from: 'hook' })
    });

    const routes = readFileSync(join(outDir, 'routes.ts'), 'utf-8');
    // definePage meta 优先(getRouteMeta 的同名字段不覆盖),matchers 自动注入
    expect(routes).toContain(`"section":"users"`);
    expect(routes).toContain(`"from":"hook"`);
    expect(routes).toContain(`"matchers":{"id":"numeric"}`);
    expect(routes).not.toContain('override-attempt');
  });

  it('可选参数渲染 ParamValueZeroOrOne,无参数渲染 Record<never, never>', async () => {
    const gen = new RouteFileGenerator({ cwd: tmpDir, srcDir, outDir });
    const dts = gen.renderDtsFile({
      pages: [page({ name: 'DocsPage', route: '/docs/:page?' }), page({ name: 'About', route: '/about' })],
      layouts: []
    });

    expect(dts).toContain(`page?: ParamValueZeroOrOne<true>`);
    expect(dts).toMatch(/"About": RouteRecordInfo<"About", "\/about", Record<never, never>, Record<never, never>>/);
  });

  it('generateRoutes/generateImports/generateDts 可独立关闭', async () => {
    const result = await generateRouteFiles(
      { pages: [page({ name: 'Home', route: '/' })], layouts: [] },
      { cwd: tmpDir, srcDir, outDir, generateRoutes: false, generateImports: false, generateDts: false }
    );

    expect(result.routesPath).toBeUndefined();
    expect(result.importsPath).toBeUndefined();
    expect(result.dtsPath).toBeUndefined();
  });

  it('默认 header 注明生成器为 @ubean/vue/generator', () => {
    expect(DEFAULT_HEADER_COMMENT).toContain('@ubean/vue/generator');
  });
});
