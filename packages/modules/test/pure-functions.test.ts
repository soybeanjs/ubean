import type { Plugin as VitePlugin } from 'vite';
/**
 * OPT-08 — @ubean/modules 纯函数单元测试（必做 P）
 *
 * 覆盖 extractPackageName / isModuleDefinition / isVitePlugin /
 * getModuleKey / getModuleName / extractPlugins / topologicalSort。
 *
 * 这些函数此前为模块私有，已 export 以支持单测（见 ADR-0006）。
 */
import { describe, it, expect } from 'vitest';
import type { ModuleDefinition } from '@ubean/config';
import {
  extractPackageName,
  isModuleDefinition,
  isVitePlugin,
  getModuleKey,
  getModuleName,
  extractPlugins,
  topologicalSort
} from '../src/index';

describe('extractPackageName()', () => {
  it('scoped 包：@scope/name/sub → @scope/name', () => {
    expect(extractPackageName('@ubean/ui/vite')).toBe('@ubean/ui');
    expect(extractPackageName('@ubean/electron/vite')).toBe('@ubean/electron');
  });

  it('scoped 包无子路径：原样返回', () => {
    expect(extractPackageName('@ubean/ui')).toBe('@ubean/ui');
  });

  it('非 scoped 包：取首段', () => {
    expect(extractPackageName('some-pkg/sub')).toBe('some-pkg');
    expect(extractPackageName('some-pkg')).toBe('some-pkg');
  });
});

describe('isModuleDefinition()', () => {
  it('含 vitePlugin 字段 → true', () => {
    expect(isModuleDefinition({ vitePlugin: { name: 'p' } })).toBe(true);
  });

  it('含 setup 字段 → true', () => {
    expect(isModuleDefinition({ setup: () => {} })).toBe(true);
  });

  it('含 hooks 字段 → true', () => {
    expect(isModuleDefinition({ hooks: {} })).toBe(true);
  });

  it('含 dependsOn 字段 → true', () => {
    expect(isModuleDefinition({ dependsOn: [] })).toBe(true);
  });

  it('无任何 ModuleDefinition 键 → false', () => {
    expect(isModuleDefinition({ name: 'p', transform: () => {} })).toBe(false);
  });

  it('null / undefined / 基础类型 → false', () => {
    expect(isModuleDefinition(null)).toBe(false);
    expect(isModuleDefinition(undefined)).toBe(false);
    expect(isModuleDefinition('str')).toBe(false);
    expect(isModuleDefinition(42)).toBe(false);
  });

  it('数组 → false（即使元素像 ModuleDefinition）', () => {
    expect(isModuleDefinition([{ setup: () => {} }])).toBe(false);
  });
});

describe('isVitePlugin()', () => {
  it('含 name 字符串且非 ModuleDefinition → true', () => {
    expect(isVitePlugin({ name: 'vite-plugin-foo' })).toBe(true);
  });

  it('name 为字符串且同时是 ModuleDefinition → false（ModuleDefinition 优先）', () => {
    // 同时含 name 和 setup，应识别为 ModuleDefinition 而非 VitePlugin
    expect(isVitePlugin({ name: 'x', setup: () => {} })).toBe(false);
  });

  it('无 name 字段 → false', () => {
    expect(isVitePlugin({ transform: () => {} })).toBe(false);
  });

  it('name 非字符串 → false', () => {
    expect(isVitePlugin({ name: 123 })).toBe(false);
  });

  it('null / 数组 → false', () => {
    expect(isVitePlugin(null)).toBe(false);
    expect(isVitePlugin([])).toBe(false);
  });
});

describe('getModuleKey()', () => {
  it('字符串模块 → 字符串本身', () => {
    expect(getModuleKey('@ubean/ui/vite', 0)).toBe('@ubean/ui/vite');
  });

  it('元组 [namedFactory] → factory.name', () => {
    function myPlugin() {
      return [];
    }
    expect(getModuleKey([myPlugin, {}], 0)).toBe('myPlugin');
  });

  it('元组 [匿名Factory] → __factory_<index>__', () => {
    // 箭头函数赋值给 const 时会获得变量名，需显式置空 name 才能命中匿名分支
    const anon = () => [];
    Object.defineProperty(anon, 'name', { value: '' });
    expect(getModuleKey([anon, {}], 3)).toBe('__factory_3__');
  });

  it('元组 [非函数] → __tuple_<index>__', () => {
    expect(getModuleKey(['not-a-fn', {}], 1)).toBe('__tuple_1__');
  });

  it('ModuleDefinition 有 name → name', () => {
    const def: ModuleDefinition = { name: 'my-module', setup: () => {} };
    expect(getModuleKey(def, 0)).toBe('my-module');
  });

  it('ModuleDefinition 无 name → __def_<index>__', () => {
    const def: ModuleDefinition = { setup: () => {} };
    expect(getModuleKey(def, 2)).toBe('__def_2__');
  });

  it('VitePlugin 对象 → plugin.name', () => {
    const plugin: VitePlugin = { name: 'vite-plugin-x' };
    expect(getModuleKey(plugin, 0)).toBe('vite-plugin-x');
  });

  it('无 name 的普通对象 → __module_<index>__', () => {
    expect(getModuleKey({ foo: 'bar' }, 4)).toBe('__module_4__');
  });
});

describe('getModuleName()', () => {
  it('字符串模块 → 末段', () => {
    expect(getModuleName('@ubean/ui/vite', 'key')).toBe('vite');
    expect(getModuleName('some-pkg/sub', 'key')).toBe('sub');
  });

  it('字符串模块无子路径 → 自身', () => {
    expect(getModuleName('some-pkg', 'key')).toBe('some-pkg');
  });

  it('元组 [namedFactory] → factory.name', () => {
    function myPlugin() {
      return [];
    }
    expect(getModuleName([myPlugin, {}], 'key')).toBe('myPlugin');
  });

  it('元组 [匿名Factory] → key', () => {
    const anon = () => [];
    Object.defineProperty(anon, 'name', { value: '' });
    expect(getModuleName([anon, {}], 'fallback-key')).toBe('fallback-key');
  });

  it('ModuleDefinition 有 name → name', () => {
    const def: ModuleDefinition = { name: 'my-module', setup: () => {} };
    expect(getModuleName(def, 'key')).toBe('my-module');
  });

  it('VitePlugin → plugin.name', () => {
    const plugin: VitePlugin = { name: 'vite-plugin-x' };
    expect(getModuleName(plugin, 'key')).toBe('vite-plugin-x');
  });

  it('无 name 的对象 → key', () => {
    expect(getModuleName({ foo: 'bar' }, 'fallback')).toBe('fallback');
  });
});

describe('extractPlugins()', () => {
  it('null / undefined → []', () => {
    expect(extractPlugins(null)).toEqual([]);
    expect(extractPlugins(undefined)).toEqual([]);
  });

  it('数组 → 过滤出 VitePlugin', () => {
    const p1: VitePlugin = { name: 'p1' };
    const p2: VitePlugin = { name: 'p2' };
    const notPlugin = { transform: () => {} };
    expect(extractPlugins([p1, notPlugin, p2])).toEqual([p1, p2]);
  });

  it('ModuleDefinition 有 vitePlugin（单个）→ 提取', () => {
    const plugin: VitePlugin = { name: 'p1' };
    const def: ModuleDefinition = { vitePlugin: plugin };
    expect(extractPlugins(def)).toEqual([plugin]);
  });

  it('ModuleDefinition 有 vitePlugin（数组）→ 提取全部', () => {
    const p1: VitePlugin = { name: 'p1' };
    const p2: VitePlugin = { name: 'p2' };
    const def: ModuleDefinition = { vitePlugin: [p1, p2] };
    expect(extractPlugins(def)).toEqual([p1, p2]);
  });

  it('ModuleDefinition 无 vitePlugin → []', () => {
    const def: ModuleDefinition = { setup: () => {} };
    expect(extractPlugins(def)).toEqual([]);
  });

  it('VitePlugin 对象 → [自身]', () => {
    const plugin: VitePlugin = { name: 'p1' };
    expect(extractPlugins(plugin)).toEqual([plugin]);
  });

  it('普通对象（非 plugin 非 def）→ []', () => {
    expect(extractPlugins({ foo: 'bar' })).toEqual([]);
  });

  it('ModuleDefinition.vitePlugin 数组中混入非 plugin → 过滤', () => {
    const p1: VitePlugin = { name: 'p1' };
    const notPlugin = { transform: () => {} };
    const def: ModuleDefinition = { vitePlugin: [p1, notPlugin as unknown as VitePlugin] };
    expect(extractPlugins(def)).toEqual([p1]);
  });
});

describe('topologicalSort()', () => {
  interface TestMod {
    key: string;
    name: string;
    dependsOn: string[];
  }

  it('空数组 → 空数组', () => {
    expect(topologicalSort([], new Map())).toEqual([]);
  });

  it('无依赖 → 保持原序', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: [] },
      { key: 'b', name: 'B', dependsOn: [] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1]
    ]);
    expect(topologicalSort(mods, keyToIndex).map(m => m.key)).toEqual(['a', 'b']);
  });

  it('b dependsOn a → a 在 b 前', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: [] },
      { key: 'b', name: 'B', dependsOn: ['a'] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1]
    ]);
    const sorted = topologicalSort(mods, keyToIndex).map(m => m.key);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
  });

  it('链式依赖 c→b→a → a, b, c', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: [] },
      { key: 'b', name: 'B', dependsOn: ['a'] },
      { key: 'c', name: 'C', dependsOn: ['b'] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2]
    ]);
    expect(topologicalSort(mods, keyToIndex).map(m => m.key)).toEqual(['a', 'b', 'c']);
  });

  it('依赖不存在于 keyToIndex → 忽略该依赖', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: ['nonexistent'] },
      { key: 'b', name: 'B', dependsOn: [] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1]
    ]);
    // 'nonexistent' 不在 keyToIndex 中，a 的入度仍为 0
    const sorted = topologicalSort(mods, keyToIndex).map(m => m.key);
    expect(sorted).toContain('a');
    expect(sorted).toContain('b');
    expect(sorted).toHaveLength(2);
  });

  it('循环依赖 → 仍返回全部模块（未排序部分追加到末尾）', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: ['b'] },
      { key: 'b', name: 'B', dependsOn: ['a'] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1]
    ]);
    const sorted = topologicalSort(mods, keyToIndex);
    expect(sorted).toHaveLength(2);
    expect(sorted.map(m => m.key).sort()).toEqual(['a', 'b']);
  });

  it('菱形依赖：d 依赖 b 和 c，b/c 依赖 a', () => {
    const mods: TestMod[] = [
      { key: 'a', name: 'A', dependsOn: [] },
      { key: 'b', name: 'B', dependsOn: ['a'] },
      { key: 'c', name: 'C', dependsOn: ['a'] },
      { key: 'd', name: 'D', dependsOn: ['b', 'c'] }
    ];
    const keyToIndex = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3]
    ]);
    const sorted = topologicalSort(mods, keyToIndex).map(m => m.key);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
    expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
  });
});
