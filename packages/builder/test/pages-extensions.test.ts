/**
 * `pages.extensions` → 编译器注入 + 页面 glob 范围的**一致性**契约。
 *
 * 事故形态（修复前）：扫描层默认就收 `tsx` / `jsx`（`@ubean/vue` 的 `scan-pages.ts`），
 * 但 Vite 侧只注册 `@vitejs/plugin-vue`。于是 `src/pages/x.tsx` 先被算进路由表
 * （扫描日志 `Found 4 pages`），再在构建期抛
 * `[PARSE_ERROR] Unexpected JSX expression / src/pages/x.tsx:4:15`。dev 侧有断言、
 * 构建侧 0 断言 —— 与 RM-V14 同一个模式。
 *
 * 这里断言的是**装配结果**（插件 name 数组、glob 字符串），不是「代码里有没有调
 * `vueJsx()`」——后者是 `source.includes()` 式假契约。
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUbeanConfig } from '@ubean/config';
import type { ResolvedConfig } from '@ubean/config';
import { layoutGlobExtensions, pageGlobExtensions } from '../src/page-glob';
import { ubeanVite } from '../src/vue-plugin';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/build-project');

/** `@vitejs/plugin-vue-jsx` 注册的插件 name（Vite 官方插件名，稳定）。 */
const VUE_JSX_PLUGIN_NAME = 'vite:vue-jsx';
const VUE_PLUGIN_NAME = 'vite:vue';

type NamedPlugin = { name?: string };

const names = (plugins: unknown[]): string[] =>
  plugins.flat(Number.POSITIVE_INFINITY).map(plugin => (plugin as NamedPlugin)?.name ?? '<unnamed>');

const withPages = (config: ResolvedConfig, extensions: string[]): ResolvedConfig => ({
  ...config,
  pages: { extensions }
});

describe('pages.extensions 决定注入哪个编译器', () => {
  it('默认（vue + tsx + jsx）→ vue 与 vue-jsx 各一份', async () => {
    const config = await loadUbeanConfig(FIXTURE);
    const pluginNames = names(ubeanVite({ config }));

    expect(pluginNames.filter(n => n === VUE_PLUGIN_NAME)).toHaveLength(1);
    expect(pluginNames.filter(n => n === VUE_JSX_PLUGIN_NAME)).toHaveLength(1);
  });

  it("extensions: ['vue'] → 不注入 vue-jsx（不用为 JSX 付 babel 链路的加载成本）", async () => {
    const config = withPages(await loadUbeanConfig(FIXTURE), ['vue']);
    const pluginNames = names(ubeanVite({ config }));

    expect(pluginNames).toContain(VUE_PLUGIN_NAME);
    expect(pluginNames).not.toContain(VUE_JSX_PLUGIN_NAME);
  });

  it("extensions: ['vue','tsx'] → vue-jsx 仍然注入（tsx 走同一个编译插件）", async () => {
    const config = withPages(await loadUbeanConfig(FIXTURE), ['vue', 'tsx']);
    expect(names(ubeanVite({ config }))).toContain(VUE_JSX_PLUGIN_NAME);
  });

  it("extensions: ['vue','jsx'] → 同样注入", async () => {
    const config = withPages(await loadUbeanConfig(FIXTURE), ['vue', 'jsx']);
    expect(names(ubeanVite({ config }))).toContain(VUE_JSX_PLUGIN_NAME);
  });
});

describe('pageGlobExtensions 与扫描范围对齐', () => {
  it('页面 glob 不含被关掉的扩展名（否则 import.meta.glob 仍会把 tsx 拉进构建）', () => {
    const glob = pageGlobExtensions(['vue'], ['md']).split(',');
    expect(glob).toContain('vue');
    expect(glob).not.toContain('tsx');
    expect(glob).not.toContain('jsx');
  });

  it('元数据页后缀（ts/js）恒参与，与页面扩展名无关', () => {
    const glob = pageGlobExtensions(['vue']).split(',');
    // `.reuse.ts` / `.meta.ts` 是独立约定，不写进 extensions 也要扫到。
    // 只写了 `vue` 时若丢掉 ts/js，`import.meta.glob` 就加载不到元数据页 ——
    // 扫描器能扫到、产物里却没有对应模块（路由表与可加载模块脱节）。
    expect(glob).toContain('ts');
    expect(glob).toContain('js');
  });

  it('关掉 JSX 后真正能加载 .reuse.ts / .meta.ts（端到端证据）', async () => {
    // glob 字符串里有 `ts` 只是必要条件；这里直接用同一份扩展名跑一次真实
    // `import.meta.glob` 语义等价的匹配，锁住「关 JSX 不影响元数据页」。
    const glob = pageGlobExtensions(['vue'], ['md']);
    const pattern = new RegExp(`^.*\\.(${glob.split(',').join('|')})$`);

    expect(pattern.test('src/pages/about-alias.reuse.ts')).toBe(true);
    expect(pattern.test('src/pages/legacy.reuse.js')).toBe(true);
    expect(pattern.test('src/pages/menu.meta.ts')).toBe(true);
    expect(pattern.test('src/pages/menu.meta.js')).toBe(true);
    // 关掉的扩展名依然被排除
    expect(pattern.test('src/pages/probe.tsx')).toBe(false);
    expect(pattern.test('src/pages/probe.jsx')).toBe(false);
  });

  it('markdown 后缀由开关决定，不透传 extensions', () => {
    expect(pageGlobExtensions(['vue'], ['md']).split(',')).toContain('md');
    expect(pageGlobExtensions(['vue'], ['md', 'mdx']).split(',')).toContain('mdx');
    expect(pageGlobExtensions(['vue'], []).split(',')).not.toContain('md');
  });

  it('全开时与修复前硬编码的集合一致（不回归旧行为）', () => {
    const glob = pageGlobExtensions(['vue', 'tsx', 'jsx'], ['md', 'mdx']).split(',').sort();
    expect(glob).toEqual(['js', 'jsx', 'md', 'mdx', 'ts', 'tsx', 'vue'].sort());
  });
});

describe('layoutGlobExtensions 与扫描器对齐', () => {
  it('默认是 vue / tsx / jsx（不含 ts / js / markdown）', () => {
    const glob = layoutGlobExtensions(undefined).split(',').sort();
    expect(glob).toEqual(['jsx', 'tsx', 'vue']);
    expect(glob).not.toContain('ts');
    expect(glob).not.toContain('js');
    expect(glob).not.toContain('md');
  });

  it("关掉 JSX 后 tsx/jsx 一起消失", () => {
    const glob = layoutGlobExtensions(['vue']).split(',');
    expect(glob).toEqual(['vue']);
  });

  it('显式写 ts 时布局也收 ts', () => {
    expect(layoutGlobExtensions(['vue', 'ts']).split(',')).toContain('ts');
  });

  it('与 `@ubean/vue` 的 scanPages 真实扫描结果逐扩展名一致', async () => {
    // 只比字符串会漏掉「两侧判据不同」——这里用同一份 extensions 跑真实扫描，
    // 逐个断言：glob 认的后缀扫描器都认，扫描器认的 glob 都认。
    const { scanClientPages } = await import('@ubean/vue/vite');
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const candidates = ['vue', 'tsx', 'jsx', 'ts', 'js', 'md'];
    for (const extensions of [undefined, ['vue'], ['vue', 'tsx'], ['vue', 'jsx'], ['vue', 'ts']]) {
      const tmp = mkdtempSync(join(tmpdir(), 'ubean-layout-glob-'));
      try {
        mkdirSync(join(tmp, 'src', 'pages'), { recursive: true });
        for (const ext of candidates) {
          const full = join(tmp, 'src', 'layouts', `probe-${ext}.${ext}`);
          mkdirSync(join(full, '..'), { recursive: true });
          writeFileSync(full, '<template><slot /></template>');
        }

        const scanned = new Set(
          (
            await scanClientPages(tmp, {
              pagesDir: 'src/pages',
              layoutsDir: 'src/layouts',
              extensions
            })
          ).layouts.map(l => l.relativePath.split('.').pop()!)
        );
        const globbed = new Set(layoutGlobExtensions(extensions).split(','));

        for (const ext of candidates) {
          expect([extensions, ext, globbed.has(ext)]).toEqual([extensions, ext, scanned.has(ext)]);
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  });
});
