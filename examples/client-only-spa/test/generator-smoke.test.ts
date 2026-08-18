/**
 * 实体路由文件生成器冒烟(@ubean/vue/generator,精简 SPA 侧使用)。
 *
 * 输入直接复用虚拟模块的 routes 扫描来源 —— 由 @ubean/vue/vite 的
 * scanClientPages 重新扫描示例页面目录,验证精简 SPA 也能走 file 模式。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRouteFiles } from '@ubean/vue/generator';
import { scanClientPages } from '@ubean/vue/vite';

const exampleRoot = resolve(fileURLToPath(import.meta.url), '../..');
let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'spa-gen-'));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('@ubean/vue/generator(精简 SPA file 模式冒烟)', () => {
  it('扫描示例页面并生成实体路由文件(routes.ts 含 matcher/reuse/slot 语义)', async () => {
    const scan = await scanClientPages(exampleRoot, { markdown: true, head: true });
    expect(scan.pages.length).toBeGreaterThan(0);

    const outDir = join(tmpDir, 'src', 'router', '_generated');
    mkdirSync(outDir, { recursive: true });

    const result = await generateRouteFiles(
      { pages: scan.pages, layouts: scan.layouts },
      { cwd: tmpDir, srcDir: exampleRoot, outDir }
    );

    expect(result.routeCount).toBe(scan.pages.length);
    expect(result.routesPath).toBeDefined();
    expect(result.importsPath).toBeDefined();

    const routes = readFileSync(join(outDir, 'routes.ts'), 'utf-8');
    // matcher 语义:meta 携带 matchers(供 createMatcherGuard 消费)
    expect(routes).toContain('"matchers":{"id":"numeric"}');
    // reuse 语义:About2 的 component 指向目标 About
    expect(routes).toMatch(/name: "About2"[\s\S]*?component: "About"/);
    // markdown 页面参与实体文件生成
    expect(routes).toContain('name: "Guide"');

    const imports = readFileSync(join(outDir, 'imports.ts'), 'utf-8');
    // reuse 页不进 views 映射
    expect(imports).not.toContain(`About2: () => import`);
    expect(imports).toContain(`export type RouteReuseKey = 'About2'`);
  });
});
