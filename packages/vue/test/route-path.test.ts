/**
 * @ubean/vue 路由路径算法单元测试
 *
 * 覆盖 route-path.ts 主路径：stripRouteGroups / parseMatchers / filePathToRoute。
 * (随页面路由所有权迁移自 @ubean/scan 的 path/route-path 测试)
 */
import { describe, it, expect } from 'vitest';
import { stripRouteGroups, parseMatchers, filePathToRoute } from '../src/route-path';

describe('stripRouteGroups()', () => {
  it('剥离中间路由组', () => {
    expect(stripRouteGroups('/(marketing)/about')).toBe('/about');
  });

  it('剥离尾部路由组（保留前置斜杠）', () => {
    // ROUTE_GROUP_TRAILING_REGEX 只剥离 (name)，前置的 / 保留
    expect(stripRouteGroups('/about/(marketing)')).toBe('/about/');
  });

  it('无路由组时原样返回', () => {
    expect(stripRouteGroups('/about')).toBe('/about');
  });
});

describe('parseMatchers()', () => {
  it('解析 [id=numeric] → 剥离 =numeric 并记录映射', () => {
    const { cleaned, matchers } = parseMatchers('users/[id=numeric]');
    expect(cleaned).toBe('users/[id]');
    expect(matchers).toEqual({ id: 'numeric' });
  });

  it('解析 catch-all [...slug=any]', () => {
    const { cleaned, matchers } = parseMatchers('blog/[...slug=any]');
    expect(cleaned).toBe('blog/[...slug]');
    expect(matchers).toEqual({ slug: 'any' });
  });

  it('无 matcher 语法时返回 cleaned = 原输入且 matchers 为 undefined', () => {
    const { cleaned, matchers } = parseMatchers('users/[id]');
    expect(cleaned).toBe('users/[id]');
    expect(matchers).toBeUndefined();
  });
});

describe('filePathToRoute()', () => {
  it('普通页面', () => {
    expect(filePathToRoute('about.vue').route).toBe('/about');
  });

  it('index 文件 → /', () => {
    expect(filePathToRoute('index.vue').route).toBe('/');
  });

  it('嵌套 index → 父路径', () => {
    expect(filePathToRoute('users/index.vue').route).toBe('/users');
  });

  it('动态参数 [id]', () => {
    expect(filePathToRoute('users/[id].vue').route).toBe('/users/:id');
  });

  it('catch-all [...slug]', () => {
    expect(filePathToRoute('blog/[...slug].vue').route).toBe('/blog/**:slug');
  });

  it('optional 参数 [[page]]', () => {
    expect(filePathToRoute('list/[[page]].vue').route).toBe('/list/:page?');
  });

  it('matcher 语法 [id=numeric] 提取映射并剥离后缀', () => {
    const result = filePathToRoute('users/[id=numeric].vue');
    expect(result.route).toBe('/users/:id');
    expect(result.matchers).toEqual({ id: 'numeric' });
  });

  it('method 后缀 .get', () => {
    const result = filePathToRoute('users.get.ts');
    expect(result.route).toBe('/users');
    expect(result.method).toBe('get');
  });

  it('env 后缀 .dev', () => {
    const result = filePathToRoute('users.dev.ts');
    expect(result.route).toBe('/users');
    expect(result.env).toBe('dev');
  });

  it('mixed method+env 后缀 .get.dev', () => {
    const result = filePathToRoute('users.get.dev.ts');
    expect(result.route).toBe('/users');
    expect(result.method).toBe('get');
    expect(result.env).toBe('dev');
  });

  it('路由组被剥离', () => {
    expect(filePathToRoute('(marketing)/about.vue').route).toBe('/about');
  });

  it('扩展名被剥离（含 .vue/.ts/.tsx 等）', () => {
    expect(filePathToRoute('a.vue').route).toBe('/a');
    expect(filePathToRoute('a.ts').route).toBe('/a');
    expect(filePathToRoute('a.tsx').route).toBe('/a');
  });

  it('参数名中的特殊字符被替换为下划线', () => {
    expect(filePathToRoute('users/[user-id].vue').route).toBe('/users/:user-id');
  });
});
