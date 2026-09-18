/**
 * `.ubean/auto-imports.d.ts` 必须同时覆盖**脚本作用域**与**模板作用域**。
 *
 * 缺陷形态（2026-09-18 实测）：ubean 的 codegen 只写 `export {}` + `declare global { const … }`，
 * 而 unplugin-auto-import（`vueTemplate: true`）还会追加一段
 * `declare module 'vue' { interface ComponentCustomProperties { readonly x: UnwrapRef<…> } }`。
 * 模板表达式里的标识符是由 vue 的**组件实例类型**解析的（vue-tsc 编译成 `__VLS_ctx.x`），
 * 不走模块作用域的全局声明 —— 于是同一个自动导入 helper 在 `<script setup>` 里正常、在模板里
 * 报 `Property 'isPageCached' does not exist on type '{ $: … }'`。
 *
 * 表现是**漂移**：`ubean prepare`（codegen 版）之后类型报错，跑过一次 `vite dev`（unplugin 版）
 * 又变绿 —— 两个写入器写同一份文件，谁后写谁赢，因此两边都必须产出这段。
 */
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { join, resolve } from 'pathe';
import { generateAutoImports } from '../src/codegen/auto-imports';

function emptyScan(): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: [],
    middlewares: [],
    plugins: [],
    crons: [],
    queues: [],
    locales: [],
    appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } },
    serverEntry: { shared: { exists: false }, dev: { exists: false }, prod: { exists: false } }
  };
}

describe('generateAutoImports auto-imports.d.ts 模板声明', () => {
  it('包含 ComponentCustomProperties 段，且条目数与全局声明一致', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-template-'));
    await mkdir(join(cwd, 'src'), { recursive: true });

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.autoImportsDtsPath, 'utf8');

    // 全局声明（脚本作用域）
    expect(raw).toContain('declare global {');
    expect(raw).toMatch(/\n  const useHead: typeof import\('ubean\/client'\)\.useHead/);

    // 模板声明（组件实例类型）—— 缺这段就会在模板里报「属性不存在」
    expect(raw).toContain('// for vue template auto import');
    expect(raw).toContain("import { UnwrapRef } from 'vue'");
    expect(raw).toContain("declare module 'vue' {");
    expect(raw).toContain('interface ComponentCustomProperties {');
    expect(raw).toMatch(/\n    readonly useHead: UnwrapRef<typeof import\('ubean\/client'\)\['useHead'\]>/);

    // 两段的条目数必须一致（都来自同一份 imports；漏一条就是模板里少一个可知的名字）
    const globalEntries = raw.match(/^ {2}const \w+: typeof import\(/gm) ?? [];
    const templateEntries = raw.match(/^ {4}readonly \w+: UnwrapRef<typeof import\(/gm) ?? [];
    expect(globalEntries.length).toBeGreaterThan(30);
    expect(templateEntries.length).toBe(globalEntries.length);
  });

  it('模板段与全局段的「名字 → 来源路径」逐条一致', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-template-paths-'));
    await mkdir(join(cwd, 'src'), { recursive: true });

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.autoImportsDtsPath, 'utf8');

    const parse = (re: RegExp) =>
      Object.fromEntries(
        [...raw.matchAll(re)].map(match => [match[1], match[2]]).sort(([a], [b]) => a.localeCompare(b))
      );

    // 全局段：`const useHead: typeof import('ubean/client').useHead`
    const globals = parse(/^ {2}const (\w+): typeof import\('([^']+)'\)/gm);
    // 模板段：`readonly useHead: UnwrapRef<typeof import('ubean/client')['useHead']>`
    const templates = parse(/^ {4}readonly (\w+): UnwrapRef<typeof import\('([^']+)'\)\[/gm);

    // 同一个 helper 在两段里必须指向同一个来源 —— 否则脚本里能用、模板里用到的是另一个模块
    expect(templates).toEqual(globals);
  });
});
