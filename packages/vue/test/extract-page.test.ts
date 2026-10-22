/**
 * `definePage(...)` 宏参数提取测试 —— 针对**旧字符串扫描器的四个静默故障面**。
 *
 * 这些用例的存在理由是「不报错但字段消失」比「报错」危险得多：旧实现
 * (`findBalancedCall` + 手写对象字面量解析器)在这些形状下返回 `{}` 或截断到
 * 第一个不可求值的键,**没有一个会抛错或告警**,于是 `cache` / `layout` /
 * `requiresAuth` 悄悄不生效。换成 AST 后每个用例都必须拿到完整字段。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractCallObject, extractDefinePageFromCode } from '../src/extract-page';

describe('definePage 提取 — 注释', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('对象内行注释不影响其余字段（旧实现：返回 {} 全丢）', () => {
    const code = `definePage({
  // 路由名
  name: 'N',
  path: '/p',
  cache: true
});`;
    const meta = extractDefinePageFromCode(code);
    expect(meta?.name).toBe('N');
    expect(meta?.path).toBe('/p');
    expect(meta?.cache).toBe(true);
  });

  it('对象内块注释保留字段', () => {
    const meta = extractDefinePageFromCode(`definePage({ /* 说明 */ name: 'A', cache: true });`);
    expect(meta).toEqual({ name: 'A', cache: true });
  });

  it('`redirect` 字符串字面量被提取', () => {
    const meta = extractDefinePageFromCode(`definePage({ redirect: '/home' });`);
    expect(meta?.redirect).toBe('/home');
  });

  it('`redirect` 非字符串（函数形式）被丢掉并告警，其余字段保留', () => {
    const meta = extractDefinePageFromCode(`definePage({ redirect: to => '/home', name: 'Home' });`, 'index.ts');
    expect(meta?.redirect).toBeUndefined();
    expect(meta?.name).toBe('Home');
    expect(console.warn).toHaveBeenCalled();
  });

  it('空字符串 `redirect` 不算重定向（不产生无目标的跳转）', () => {
    expect(extractDefinePageFromCode(`definePage({ redirect: '' });`)?.redirect).toBeUndefined();
  });

  it('块注释里的 definePage 调用不被当成真调用', () => {
    const code = `/* definePage({ name: 'GHOST' }) */\ndefinePage({ name: 'Real' });`;
    expect(extractDefinePageFromCode(code)?.name).toBe('Real');
  });

  it('行注释里的 definePage 调用被忽略', () => {
    const code = `// definePage({ name: 'GHOST' })\ndefinePage({ name: 'Real' });`;
    expect(extractDefinePageFromCode(code)?.name).toBe('Real');
  });

  it('字符串里提到 definePage 不算调用', () => {
    const code = `const doc = "definePage({ name: 'GHOST' })";\ndefinePage({ name: 'Real' });`;
    expect(extractDefinePageFromCode(code)?.name).toBe('Real');
  });
});

describe('definePage 提取 — TypeScript 语法', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('`as const` 断言（旧实现曾因 run 顺序侥幸通过，rollup parseAst 则直接抛错）', () => {
    const meta = extractDefinePageFromCode(`definePage({ name: 'C', meta: { x: 1 } as const });`);
    expect(meta?.name).toBe('C');
    expect(meta?.meta).toEqual({ x: 1 });
  });

  it('`satisfies` 断言', () => {
    const meta = extractDefinePageFromCode(`definePage({ name: 'D', meta: {} satisfies Record<string, never> });`);
    expect(meta?.name).toBe('D');
  });

  it('不可求值的值只丢该字段，后续字段保留', () => {
    const meta = extractDefinePageFromCode(`definePage({ meta: makeMeta(), name: 'N', cache: true });`);
    expect(meta?.name).toBe('N');
    expect(meta?.cache).toBe(true);
    expect(meta?.meta).toBeUndefined();
  });

  it('`{} as any` 静态可求值（空对象），字段保留', () => {
    // 旧实现在这里丢掉 name/cache —— `as any` 让手写解析器卡住并截断后续字段。
    const meta = extractDefinePageFromCode(`definePage({ meta: {} as any, name: 'N', cache: true });`);
    expect(meta?.name).toBe('N');
    expect(meta?.cache).toBe(true);
    expect(meta?.meta).toEqual({});
  });

  it('不可求值的值会 warn 出具体字段名与中文原因', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractDefinePageFromCode(`definePage({ name: makeName(), cache: true });`);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('`name`'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('函数调用'));
  });

  it('warn 带文件路径与**文件内**行号（不是块内行号）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `definePage` 在第 7 行；`<script setup>` 块从第 5 行开始。
    const sfc = `<template>
  <div />
</template>

<script setup lang="ts">
const x = 1;
definePage({ name: makeName() });
</script>
`;
    extractDefinePageFromCode(sfc, 'index.vue', {
      fileName: '/proj/src/pages/users/index.vue',
      cwd: '/proj'
    });
    const message = spy.mock.calls[0][0] as string;
    expect(message).toContain('src/pages/users/index.vue:7:');
  });

  it('warn 带行号但不带路径时降级为 `第 N 行`', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractDefinePageFromCode(`\ndefinePage({ name: f() });`, 'a.ts', {});
    expect(spy.mock.calls[0][0]).toContain('第 2 行:');
  });

  it('不传 context 时不出现定位前缀（与旧行为一致）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 用一个前面用例没报过的字段：warn 按整条文案去重，重复文案不会再触发。
    extractDefinePageFromCode(`definePage({ ssr: f() });`);
    const message = spy.mock.calls[0][0] as string;
    expect(message).toContain('[ubean/vue] definePage():');
  });

  it('spread 没有键名时报「有一个字段」而不是空的 `字段 ```', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractDefinePageFromCode(`definePage({ ...base, name: 'N' });`, 'a.ts');
    const message = spy.mock.calls[0][0] as string;
    expect(message).toContain('有一个字段 无法在构建期静态求值(展开语法)');
  });
});

describe('definePage 提取 — 引用与 spread', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spread 不吞掉后面的字段', () => {
    const meta = extractDefinePageFromCode(
      `const base = { name: 'B' };\ndefinePage({ ...base, path: '/b', cache: true });`
    );
    expect(meta?.path).toBe('/b');
    expect(meta?.cache).toBe(true);
  });

  it('标识符引用不再被当成字符串值（旧实现把 `layout: L` 变成 "L"）', () => {
    const meta = extractDefinePageFromCode(`const L = 'admin';\ndefinePage({ layout: L, path: '/d' });`);
    expect(meta?.layout).toBeUndefined();
    expect(meta?.path).toBe('/d');
  });

  it('简写属性（`{ name }`）不产生假值', () => {
    const meta = extractDefinePageFromCode(`const name = 'N';\ndefinePage({ name, cache: true });`);
    expect(meta?.name).toBeUndefined();
    expect(meta?.cache).toBe(true);
  });
});

describe('definePage 提取 — 脚本块与扩展名', () => {
  it('SFC 优先 <script setup> 块', () => {
    const code = `<script lang="ts">
definePage({ name: 'WRONG' });
</script>
<script setup lang="ts">
definePage({ name: 'RIGHT' });
</script>
<template><p>x</p></template>`;
    expect(extractDefinePageFromCode(code, 'page.vue')?.name).toBe('RIGHT');
  });

  it('SFC 无 setup 块时回落到普通 <script>', () => {
    const code = `<script lang="ts">
export const loader = () => 1;
definePage({ name: 'Plain' });
</script>
<template><p>x</p></template>`;
    expect(extractDefinePageFromCode(code, 'page.vue')?.name).toBe('Plain');
  });

  it('TSX 页面（含 JSX 元素）', () => {
    const code = `definePage({ name: 'J', cache: true });\nexport default { setup: () => () => <div/> };`;
    expect(extractDefinePageFromCode(code, 'page.tsx')).toMatchObject({ name: 'J', cache: true });
  });

  it('JSX 页面（无文件名也能解析 —— 兜底重试插件组合）', () => {
    const code = `definePage({ cache: false, requiresAuth: true });\nexport function Page() {\n  return <ul><li>{'a)'}</li></ul>;\n}`;
    expect(extractDefinePageFromCode(code)).toMatchObject({ cache: false, requiresAuth: true });
  });

  it('`.reuse.ts` 的 export default definePage(...)', () => {
    expect(extractDefinePageFromCode(`export default definePage({ reuse: 'About' });`, 'alias.reuse.ts')).toEqual({
      reuse: 'About'
    });
  });

  it('正则字面量里的括号不影响提取', () => {
    const code = `const re = /((/g;\ndefinePage({ name: 'A', path: '/a' });`;
    expect(extractDefinePageFromCode(code)).toMatchObject({ name: 'A', path: '/a' });
  });

  it('语法错误时返回 null（不在构建期抛错）', () => {
    expect(extractDefinePageFromCode(`definePage({ name: `, 'broken.ts')).toBeNull();
  });
});

describe('extractCallObject — 复用同一解析器（defineHandlerMeta）', () => {
  it('提取 defineHandlerMeta 的字段', () => {
    const code = `export const GET = defineHandler(handler);
defineHandlerMeta({
  // 需要登录
  requiresAuth: true,
  meta: { group: 'users' }
});`;
    expect(extractCallObject(code, 'defineHandlerMeta')).toEqual({
      requiresAuth: true,
      meta: { group: 'users' }
    });
  });
});
