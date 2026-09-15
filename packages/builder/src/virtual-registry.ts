export interface VirtualModuleContext {
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
  invalidate(id: string): void;
}

export type VirtualModuleTransform = (id: string, code: string) => string | Promise<string>;

export interface VirtualModule {
  id: string;
  resolve(id: string, importer?: string): string | undefined;
  load(id?: string): string | Promise<string>;
}

/**
 * 注册表的**只读视图**（RM-V02）。
 *
 * 插件只读；写入由 scan 层构建出注册表后注入。这样插件实例不再持有跨构建的可变状态 ——
 * Phase 2 的单 builder 多环境共享插件实例时，环境之间不会互相污染。
 */
export interface VirtualModuleResolver {
  resolveId(id: string, importer?: string): string | undefined;
  load(id: string): Promise<string | undefined> | string | undefined;
  getModules(): VirtualModule[];
}

export class VirtualModuleRegistry implements VirtualModuleResolver {
  private modules = new Map<string, VirtualModule>();
  private invalidated = new Set<string>();

  register(mod: VirtualModule): void {
    this.modules.set(mod.id, mod);
  }

  resolveId(id: string, importer?: string): string | undefined {
    if (this.modules.has(id)) return id;
    for (const mod of this.modules.values()) {
      const resolved = mod.resolve(id, importer);
      if (resolved) return resolved;
    }
    return undefined;
  }

  async load(id: string): Promise<string | undefined> {
    // 1. 精确匹配（性能快路径）
    const exactMod = this.modules.get(id);
    if (exactMod) return exactMod.load(id);
    // 2. 前缀匹配（defineVirtualModulePrefix 注册的模块）
    for (const [modId, mod] of this.modules) {
      if (modId === id) continue;
      if (mod.resolve(id)) return mod.load(id);
    }
    return undefined;
  }

  invalidate(id: string): void {
    this.invalidated.add(id);
  }

  isInvalidated(id: string): boolean {
    return this.invalidated.has(id);
  }

  clearInvalidated(): void {
    this.invalidated.clear();
  }

  getModules(): VirtualModule[] {
    return [...this.modules.values()];
  }

  clear(): void {
    this.modules.clear();
    this.invalidated.clear();
  }
}

let _registry: VirtualModuleRegistry | null = null;

/**
 * 建一个独立的注册表实例（RM-V02）。
 *
 * 框架路径（build / dev / 主包 vite 入口）各自建一个并**显式注入**给插件，不再依赖模块级
 * 单例。单例上的 `clear()` 曾用于在两次构建之间重置状态，正是跨构建污染的来源。
 */
export function createVirtualRegistry(modules: VirtualModule[] = []): VirtualModuleRegistry {
  const registry = new VirtualModuleRegistry();
  for (const mod of modules) registry.register(mod);
  return registry;
}

/**
 * @deprecated RM-V02 起框架路径改为显式注入（`createVirtualRegistry()` + 插件 `registry`
 * 选项）。保留此单例仅供既有测试与外部一次性用法，新代码不要使用。
 */
export function useVirtualRegistry(): VirtualModuleRegistry {
  if (!_registry) {
    _registry = new VirtualModuleRegistry();
  }
  return _registry;
}

/** @deprecated 见 `useVirtualRegistry()`。 */
export function resetVirtualRegistry(): void {
  _registry = null;
}

export function defineVirtualModule(id: string, loader: () => string | Promise<string>): VirtualModule {
  return {
    id,
    resolve(resolvedId: string): string | undefined {
      return resolvedId === id ? id : undefined;
    },
    load: loader
  };
}

export function defineVirtualModulePrefix(
  prefix: string,
  loader: (id: string) => string | Promise<string>
): VirtualModule {
  return {
    id: prefix,
    resolve(id: string): string | undefined {
      if (id.startsWith(prefix)) return id;
      return undefined;
    },
    load(id?: string) {
      return loader(id || prefix);
    }
  };
}
