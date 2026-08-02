/**
 * OPT-04 4b — @ubean/build VirtualModuleRegistry 单元测试
 *
 * 覆盖 register / resolveId / load / invalidate / clear +
 * defineVirtualModule / defineVirtualModulePrefix + useVirtualRegistry 单例。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  VirtualModuleRegistry,
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
