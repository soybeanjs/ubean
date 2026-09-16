/**
 * OPT-04 4b — @ubean/build 宏转换单元测试
 *
 * 覆盖 stripMacros / transformMacros：
 * - definePage 宏剥离（语句级、含 export default、嵌套括号、字符串字面量）
 * - transformMacros 按 id 路径分派（src/pages/、src/routes/、src/middleware/、其他）
 * - Vue SFC <script> 块内宏剥离
 */
import { describe, it, expect } from 'vitest';
import { parse, compileScript } from '@vue/compiler-sfc';
import { stripMacros, transformMacros } from '../src/macros';

describe('stripMacros()', () => {
  it('剥离顶层 definePage(...) 语句', () => {
    const code = `definePage({ name: 'About' });\nexport default {}`;
    const result = stripMacros(code);
    expect(result).toBe('\nexport default {}');
  });

  it('剥离 reuse 文件的 definePage(...)（reuse.ts 场景，无需 export）', () => {
    const code = `definePage({ reuse: 'about' });`;
    const result = stripMacros(code);
    expect(result).toBe('');
  });

  it('剥离带嵌套括号与字符串的 definePage', () => {
    const code = `definePage({ meta: { title: 'A(b)', arr: [1, 2] } });\nconst x = 1;`;
    const result = stripMacros(code);
    expect(result).toBe('\nconst x = 1;');
  });

  it('剥离含模板字符串的 definePage', () => {
    const code = 'definePage({ meta: { title: `A${b}` } });\nconst y = 2;';
    const result = stripMacros(code);
    expect(result).toBe('\nconst y = 2;');
  });

  it('剥离含注释的 definePage', () => {
    const code = `definePage({ /* comment */ name: 'A' });\nconst z = 3;`;
    const result = stripMacros(code);
    expect(result).toBe('\nconst z = 3;');
  });

  it('多个 definePage 全部剥离', () => {
    const code = `definePage({ name: 'A' });\ndefinePage({ name: 'B' });\nconst w = 4;`;
    const result = stripMacros(code);
    expect(result).toBe('\n\nconst w = 4;');
  });

  it('无 definePage → 原样返回', () => {
    const code = `const a = 1;\nconst b = 2;`;
    expect(stripMacros(code)).toBe(code);
  });

  it('不误剥离开头的 definePageLike 函数（单词边界）', () => {
    const code = `definePageLike({ name: 'A' });\nconst c = 5;`;
    // \b 边界：definePageLike 中的 definePage 后跟 Like，不匹配
    expect(stripMacros(code)).toBe(code);
  });
});

describe('transformMacros()', () => {
  it('非 src/pages/、src/routes/、src/middleware/ 路径 → null', () => {
    expect(transformMacros('definePage({})', '/foo/bar.ts')).toBeNull();
    expect(transformMacros('definePage({})', '/src/components/btn.vue')).toBeNull();
  });

  it('src/pages/*.vue → 剥离 <script> 内的宏', () => {
    const code = `<script setup>\ndefinePage({ name: 'About' });\nconst x = 1;\n</script>`;
    const result = transformMacros(code, '/src/pages/about.vue');
    expect(result).toContain('const x = 1;');
    expect(result).not.toContain('definePage');
  });

  it('src/routes/*.ts → 剥离宏', () => {
    const code = `definePage({ name: 'A' });\nexport const GET = () => {};`;
    const result = transformMacros(code, '/src/routes/users.ts');
    expect(result).not.toContain('definePage');
    expect(result).toContain('export const GET');
  });

  it('src/middleware/*.ts → 剥离宏', () => {
    const code = `definePage({ name: 'M' });\nexport default () => {};`;
    const result = transformMacros(code, '/src/middleware/auth.ts');
    expect(result).not.toContain('definePage');
  });

  it('.js/.mjs/.tsx/.jsx 文件 → 剥离宏', () => {
    const code = `definePage({ name: 'A' });\nconst x = 1;`;
    expect(transformMacros(code, '/src/pages/a.js')).not.toContain('definePage');
    expect(transformMacros(code, '/src/pages/a.mjs')).not.toContain('definePage');
    expect(transformMacros(code, '/src/pages/a.tsx')).not.toContain('definePage');
    expect(transformMacros(code, '/src/pages/a.jsx')).not.toContain('definePage');
  });

  it('未知扩展名 → null', () => {
    expect(transformMacros('definePage({})', '/src/pages/a.css')).toBeNull();
    expect(transformMacros('definePage({})', '/src/pages/a.md')).toBeNull();
  });

  it('Vue SFC 多个 <script> 块均处理', () => {
    const code = `<script>definePage({ name: 'A' });</script>\n<script setup>const x = 1;</script>`;
    const result = transformMacros(code, '/src/pages/a.vue');
    expect(result).not.toContain('definePage');
    expect(result).toContain('const x = 1;');
  });
});

/**
 * 生产构建的 `MISSING_EXPORT "default"` 缺陷（页面 loader 约定形状）。
 *
 * `definePage()` 是宏、必被剥掉；页面约定又要求 `loader` 写在普通 `<script>`、`definePage` 写在
 * `<script setup>`。于是「只有 loader 的页面」在剥离后得到**空**的 setup 块 —— `@vue/compiler-sfc`
 * 把只有空白的 setup 块当作不存在，组件就只剩那个普通脚本块（只有具名导出），
 * 而 `@vitejs/plugin-vue` 的主模块照旧 `import _sfc_main from '...?vue&type=script'`。
 *
 * 断言落在**编译产物是否有默认导出**上（而不是「有没有插入那行注释」）：这才是构建真正依赖的不变量。
 *
 * `@vue/compiler-sfc` 是 `@vitejs/plugin-vue` 的依赖、由 workspace 的 `shamefullyHoist` 提升后可直接
 * 解析 —— **不要**为了这条用例把它加进 devDependencies：实测一次 `pnpm add` 会让 pnpm 重解析整仓
 * （lockfile 25 增 89 删），产生两份 `@voidzero-dev/vite-plus-core` 变体，`pnpm typecheck` 当场报
 * 「结构相同但来源不同的 Plugin 类型不可赋值」。
 */
describe('空 <script setup> 块（宏剥离后）', () => {
  const loaderPage = (setupContent: string): string =>
    `<script lang="ts">\nexport async function loader() {\n  return { from: 'loader' };\n}\n</script>\n\n<script setup lang="ts">${setupContent}</script>\n\n<template><p>x</p></template>`;

  function compiledHasDefault(source: string): boolean {
    const { descriptor } = parse(source, { filename: 'Page.vue' });
    return /export\s+default/.test(compileScript(descriptor, { id: 'test' }).content);
  }

  it('loader 页（setup 只剩 definePage）→ 仍有默认导出', () => {
    const transformed = transformMacros(loaderPage("\ndefinePage({ name: 'A' });\n"), '/src/pages/a.vue')!;
    expect(transformed).not.toContain('definePage');
    expect(compiledHasDefault(transformed)).toBe(true);
  });

  it('无普通 <script> 块时不动 setup 块（走 plugin-vue 的 template-only 路径）', () => {
    const source = `<script setup>\ndefinePage({ name: 'A' });\n</script>\n\n<template><p>x</p></template>`;
    const transformed = transformMacros(source, '/src/pages/a.vue')!;
    // 该形状下 plugin-vue 不调 compileScript（没有脚本块时由模板单独生成组件），本身不报错 ——
    // 所以这里**不**注入保留注释，保持对用户文件的零改动。
    expect(transformed).toBe(`<script setup>\n\n</script>\n\n<template><p>x</p></template>`);
  });
});
