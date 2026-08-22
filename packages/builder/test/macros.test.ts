/**
 * OPT-04 4b — @ubean/build 宏转换单元测试
 *
 * 覆盖 stripMacros / transformMacros：
 * - definePage 宏剥离（语句级、含 export default、嵌套括号、字符串字面量）
 * - transformMacros 按 id 路径分派（src/pages/、src/routes/、src/middleware/、其他）
 * - Vue SFC <script> 块内宏剥离
 */
import { describe, it, expect } from 'vitest';
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
