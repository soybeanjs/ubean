import type { Plugin as VitePlugin } from 'vite';
/**
 * OPT-08 — @ubean/modules resolveModules 集成测试（应做 S）
 *
 * 覆盖：
 * - builtin-skip：所有 builtin 未启用时跳过，仅处理 user modules
 * - user module 解析：对象形式 ModuleDefinition（含 vitePlugin / setup）
 * - 去重：相同 key 的模块只保留一个
 * - topo 排序回归：dependsOn 决定的顺序在 resolveModules 输出中保持
 *
 * 不依赖真实文件系统 / 动态 import：用户模块以对象形式（ModuleDefinition）
 * 直接传入，避免字符串形式触发的 `await import()`。
 */
import { describe, it, expect, vi } from 'vitest';
import type { ResolvedConfig } from '@ubean/config';
import { resolveModules } from '../src/index';

/** 构造一个所有 builtin 都禁用的最小 config mock。 */
function makeMockConfig(modules: unknown[]): ResolvedConfig {
  return {
    modules,
    // 所有 builtin 字段设为 false → isBuiltinDisabled 返回 true → 跳过
    icon: false,
    pwa: false,
    auth: false,
    image: false,
    fonts: false,
    electron: false,
    ui: false,
    pinia: false
  } as unknown as ResolvedConfig;
}

describe('resolveModules() — 集成', () => {
  it('builtin-skip：所有 builtin 禁用 → 仅处理 user modules', async () => {
    const userPlugin: VitePlugin = { name: 'user-plugin-a' };
    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([{ name: 'user-a', vitePlugin: userPlugin }]),
      builtinPlugins: [{ name: 'builtin-core' }]
    });

    // core module + user module
    expect(result.modules).toHaveLength(2);
    expect(result.modules[0].name).toBe('ubean-core');
    expect(result.modules[1].name).toBe('user-a');

    // builtin core plugins + user plugin 都在 plugins 数组中
    const pluginNames = result.plugins.map(p => p.name);
    expect(pluginNames).toContain('builtin-core');
    expect(pluginNames).toContain('user-plugin-a');

    // 没有 builtin 扩展插件（icon/pwa/...）被加载
    expect(pluginNames).not.toContain('ubean:icon');
    expect(pluginNames).not.toContain('ubean:pwa');
  });

  it('user module 解析：对象形式 ModuleDefinition 含 setup 与 vitePlugin', async () => {
    const setupFn = vi.fn();
    const userPlugin: VitePlugin = { name: 'user-plugin-x' };
    const userModule = {
      name: 'user-x',
      vitePlugin: userPlugin,
      setup: setupFn
    };

    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([userModule]),
      builtinPlugins: []
    });

    // setup 被调用
    expect(setupFn).toHaveBeenCalledTimes(1);

    // user module 出现在结果中
    const mod = result.modules.find(m => m.name === 'user-x');
    expect(mod).toBeDefined();
    expect(mod?.plugins.map(p => p.name)).toContain('user-plugin-x');
  });

  it('去重：相同 key 的模块只保留一个', async () => {
    const p1: VitePlugin = { name: 'plugin-1' };
    const p2: VitePlugin = { name: 'plugin-2' };

    // 两个对象形式模块都无 name → 都得到 key '__def_0__' / '__def_1__'
    // 改用相同 name 触发去重（getModuleKey 对 ModuleDefinition 用 name 作 key）
    const modA = { name: 'dup', vitePlugin: p1 };
    const modB = { name: 'dup', vitePlugin: p2 };

    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([modA, modB]),
      builtinPlugins: []
    });

    // core + 仅一个 'dup' 模块
    const dupModules = result.modules.filter(m => m.name === 'dup');
    expect(dupModules).toHaveLength(1);
  });

  it('topo 排序回归：dependsOn 决定的顺序在输出中保持', async () => {
    // b dependsOn a → a 应在 b 之前
    // 注意：dependsOn 引用的是 key，对象形式 ModuleDefinition 的 key = name
    const pluginA: VitePlugin = { name: 'plugin-a' };
    const pluginB: VitePlugin = { name: 'plugin-b' };

    const modA = { name: 'mod-a', vitePlugin: pluginA };
    // mod-b 依赖 mod-a，故意把 b 放在 a 前面，验证排序后 a 仍在 b 前
    const modB = { name: 'mod-b', vitePlugin: pluginB, dependsOn: ['mod-a'] };

    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([modB, modA]),
      builtinPlugins: []
    });

    const names = result.modules.map(m => m.name);
    const idxA = names.indexOf('mod-a');
    const idxB = names.indexOf('mod-b');
    expect(idxA).toBeLessThan(idxB);
  });

  it('空 modules → 仅 core module', async () => {
    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([]),
      builtinPlugins: [{ name: 'core' }]
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].name).toBe('ubean-core');
  });

  it('字符串形式模块加载失败 → 静默跳过', async () => {
    // 不存在的模块路径 → import 失败 → parseUserModule 返回 null
    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig(['@nonexistent/pkg/sub']),
      builtinPlugins: []
    });

    // 仅 core，user module 被跳过
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].name).toBe('ubean-core');
  });

  it('元组 [factory, options] 形式模块', async () => {
    const userPlugin: VitePlugin = { name: 'factory-plugin' };
    function factoryPlugin(_options: unknown) {
      return { name: 'factory-mod', vitePlugin: userPlugin };
    }

    const result = await resolveModules({
      cwd: '/fake',
      config: makeMockConfig([[factoryPlugin, { foo: 'bar' }]]),
      builtinPlugins: []
    });

    const mod = result.modules.find(m => m.name === 'factory-mod');
    expect(mod).toBeDefined();
    expect(result.plugins.map(p => p.name)).toContain('factory-plugin');
  });
});
