/**
 * OPT-04 4b — @ubean/build VirtualModuleRegistry 单元测试
 *
 * 覆盖 register / resolveId / load / invalidate / clear +
 * defineVirtualModule / defineVirtualModulePrefix + useVirtualRegistry 单例。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  VirtualModuleRegistry,
  createVirtualRegistry,
  useVirtualRegistry,
  resetVirtualRegistry,
  defineVirtualModule,
  defineVirtualModulePrefix
} from '../src/virtual-registry';

describe('VirtualModuleRegistry', () => {
  let registry: VirtualModuleRegistry;

  beforeEach(() => {
    registry = new VirtualModuleRegistry();
  });

  it('register + load：注册后可加载', async () => {
    const mod = defineVirtualModule('virtual:test', () => 'export const x = 1;');
    registry.register(mod);
    const code = await registry.load('virtual:test');
    expect(code).toBe('export const x = 1;');
  });

  it('load 未注册的 id → undefined', async () => {
    expect(await registry.load('virtual:unknown')).toBeUndefined();
  });

  it('resolveId 精确匹配已注册 id', () => {
    registry.register(defineVirtualModule('virtual:foo', () => ''));
    expect(registry.resolveId('virtual:foo')).toBe('virtual:foo');
  });

  it('resolveId 未匹配 → undefined', () => {
    expect(registry.resolveId('virtual:unknown')).toBeUndefined();
  });

  it('defineVirtualModulePrefix：前缀匹配', () => {
    registry.register(defineVirtualModulePrefix('virtual:prefix:', id => `// ${id}`));
    expect(registry.resolveId('virtual:prefix:abc')).toBe('virtual:prefix:abc');
    expect(registry.resolveId('virtual:other')).toBeUndefined();
  });

  it('defineVirtualModulePrefix：load 接收完整 id', async () => {
    registry.register(defineVirtualModulePrefix('virtual:p:', id => `// loaded ${id}`));
    const code = await registry.load('virtual:p:xyz');
    expect(code).toBe('// loaded virtual:p:xyz');
  });

  it('invalidate + isInvalidated', () => {
    registry.invalidate('virtual:test');
    expect(registry.isInvalidated('virtual:test')).toBe(true);
    expect(registry.isInvalidated('virtual:other')).toBe(false);
  });

  it('clearInvalidated 清空 invalidate 集合', () => {
    registry.invalidate('virtual:a');
    registry.invalidate('virtual:b');
    registry.clearInvalidated();
    expect(registry.isInvalidated('virtual:a')).toBe(false);
    expect(registry.isInvalidated('virtual:b')).toBe(false);
  });

  it('getModules 返回全部已注册模块副本', () => {
    registry.register(defineVirtualModule('virtual:a', () => ''));
    registry.register(defineVirtualModule('virtual:b', () => ''));
    const mods = registry.getModules();
    expect(mods).toHaveLength(2);
    expect(mods.map(m => m.id).sort()).toEqual(['virtual:a', 'virtual:b']);
  });

  it('clear 清空全部模块与 invalidate', async () => {
    registry.register(defineVirtualModule('virtual:a', () => ''));
    registry.invalidate('virtual:a');
    registry.clear();
    expect(await registry.load('virtual:a')).toBeUndefined();
    expect(registry.isInvalidated('virtual:a')).toBe(false);
    expect(registry.getModules()).toHaveLength(0);
  });

  it('注册相同 id → 后者覆盖前者', async () => {
    registry.register(defineVirtualModule('virtual:dup', () => 'first'));
    registry.register(defineVirtualModule('virtual:dup', () => 'second'));
    expect(await registry.load('virtual:dup')).toBe('second');
    expect(registry.getModules()).toHaveLength(1);
  });
});

describe('useVirtualRegistry() 单例', () => {
  beforeEach(() => {
    resetVirtualRegistry();
  });

  it('多次调用返回同一实例', () => {
    const a = useVirtualRegistry();
    const b = useVirtualRegistry();
    expect(a).toBe(b);
  });

  it('resetVirtualRegistry 后返回新实例', () => {
    const a = useVirtualRegistry();
    resetVirtualRegistry();
    const b = useVirtualRegistry();
    expect(a).not.toBe(b);
  });
});

// RM-V02：框架路径改为显式注入注册表，插件不再依赖模块级单例。
describe('createVirtualRegistry()', () => {
  beforeEach(() => {
    resetVirtualRegistry();
  });

  it('新建实例为空，可按初始模块预填', () => {
    expect(createVirtualRegistry().getModules()).toHaveLength(0);

    const seeded = createVirtualRegistry([defineVirtualModule('virtual:seed', () => 'seeded')]);
    expect(seeded.getModules().map(m => m.id)).toEqual(['virtual:seed']);
  });

  it('两个实例互不干扰，也不写入模块级单例', async () => {
    const global = useVirtualRegistry();
    const a = createVirtualRegistry();
    const b = createVirtualRegistry();

    a.register(defineVirtualModule('virtual:only-a', () => 'a'));

    expect(a.getModules().map(m => m.id)).toEqual(['virtual:only-a']);
    expect(b.getModules()).toHaveLength(0);
    expect(await b.load('virtual:only-a')).toBeUndefined();
    // 关键不变量：显式创建的注册表与全局单例完全解耦
    expect(global.getModules()).toHaveLength(0);
    expect(a).not.toBe(global);
  });

  it('同一实例连续两次注册同一 id 只保留后者（无跨构建累积）', async () => {
    const registry = createVirtualRegistry();
    registry.register(defineVirtualModule('virtual:x', () => 'build-1'));
    registry.register(defineVirtualModule('virtual:x', () => 'build-2'));

    expect(registry.getModules()).toHaveLength(1);
    expect(await registry.load('virtual:x')).toBe('build-2');
  });
});
