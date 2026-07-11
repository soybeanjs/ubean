export interface VirtualModuleContext {
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
  invalidate(id: string): void;
}

export type VirtualModuleTransform = (id: string, code: string) => string | Promise<string>;

export interface VirtualModule {
  id: string;
  resolve(id: string, importer?: string): string | undefined;
  load(): string | Promise<string>;
}

export class VirtualModuleRegistry {
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
    const mod = this.modules.get(id);
    if (!mod) return undefined;
    return mod.load();
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
}

let _registry: VirtualModuleRegistry | null = null;

export function useVirtualRegistry(): VirtualModuleRegistry {
  if (!_registry) {
    _registry = new VirtualModuleRegistry();
  }
  return _registry;
}

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
