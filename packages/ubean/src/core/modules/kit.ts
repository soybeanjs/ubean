import type { Plugin as VitePlugin } from 'vite';
import type { MiddlewareHandler } from 'hono';
import type { UbeanApp } from '../../runtime/app';
import type { UbeanEnv } from '../../types/handler';

export interface DevToolsCustomTab {
  id: string;
  title: string;
  icon?: string;
  component?: any;
}

export interface ModuleHooks {
  'app:created': (app: UbeanApp) => void | Promise<void>;
  'app:before:register': (app: UbeanApp) => void | Promise<void>;
  'app:after:register': (app: UbeanApp) => void | Promise<void>;
  'app:ready': (app: UbeanApp) => void | Promise<void>;
  'build:before': () => void | Promise<void>;
  'build:after': () => void | Promise<void>;
  'dev:setup': () => void | Promise<void>;
  'dev:listen': (info: { port: number; host: string; url: string }) => void | Promise<void>;
  'request:start': (c: any) => void | Promise<void>;
  'request:end': (c: any, res: Response) => void | Promise<void>;
}

export interface ModuleKitContext {
  moduleName: string;
  options: Record<string, unknown>;
  hooks: {
    hook: <T extends keyof ModuleHooks>(name: T, fn: ModuleHooks[T]) => void;
    callHook: <T extends keyof ModuleHooks>(name: T, ...args: Parameters<ModuleHooks[T]>) => Promise<void>;
  };
  addServerHandler: (handler: ServerHandlerRegistration) => void;
  addDevServerHandler: (handler: DevServerHandlerRegistration) => void;
  addVitePlugin: (plugin: VitePlugin | VitePlugin[]) => void;
  addVirtualImports: (imports: VirtualImportRegistration) => void;
  addComponentsDir: (dir: ComponentsDirRegistration) => void;
  addAutoImport: (imports: AutoImportRegistration) => void;
  addDevToolsTab: (tab: DevToolsCustomTab) => void;
  _vitePlugins: VitePlugin[];
  _serverHandlers: ServerHandlerRegistration[];
  _devServerHandlers: DevServerHandlerRegistration[];
  _virtualImports: VirtualImportRegistration[];
  _componentsDirs: ComponentsDirRegistration[];
  _autoImports: AutoImportRegistration[];
  _devToolsTabs: DevToolsCustomTab[];
}

export interface ServerHandlerRegistration {
  route: string;
  handler: MiddlewareHandler<UbeanEnv> | ((...args: any[]) => any);
  method?: string | string[];
  middleware?: boolean;
}

export interface DevServerHandlerRegistration {
  route: string;
  handler: MiddlewareHandler<UbeanEnv> | ((...args: any[]) => any);
  method?: string | string[];
}

export interface VirtualImportRegistration {
  imports: Array<{ name: string; as?: string; from: string }>;
  from?: string;
}

export interface ComponentsDirRegistration {
  path: string;
  pattern?: string;
  pathPrefix?: boolean;
  global?: boolean;
}

export interface AutoImportRegistration {
  imports: Array<string | { name: string; as?: string; from: string }>;
  from?: string;
}

export function createModuleKitContext(moduleName: string, options: Record<string, unknown>): ModuleKitContext {
  const ctx: ModuleKitContext = {
    moduleName,
    options,
    hooks: {
      hook: () => {},
      callHook: async () => {}
    },
    addServerHandler: handler => {
      ctx._serverHandlers.push(handler);
    },
    addDevServerHandler: handler => {
      ctx._devServerHandlers.push(handler);
    },
    addVitePlugin: plugin => {
      const plugins = Array.isArray(plugin) ? plugin : [plugin];
      ctx._vitePlugins.push(...plugins);
    },
    addVirtualImports: imports => {
      ctx._virtualImports.push(imports);
    },
    addComponentsDir: dir => {
      ctx._componentsDirs.push(dir);
    },
    addAutoImport: imports => {
      ctx._autoImports.push(imports);
    },
    addDevToolsTab: tab => {
      ctx._devToolsTabs.push(tab);
    },
    _vitePlugins: [],
    _serverHandlers: [],
    _devServerHandlers: [],
    _virtualImports: [],
    _componentsDirs: [],
    _autoImports: [],
    _devToolsTabs: []
  };

  return ctx;
}

export function topologicalSort<T extends { key: string; name: string; dependsOn: string[] }>(
  modules: T[],
  keyToIndex: Map<string, number>
): T[] {
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  const sorted: T[] = [];

  for (const mod of modules) {
    inDegree.set(mod.key, 0);
    graph.set(mod.key, []);
  }

  for (const mod of modules) {
    for (const dep of mod.dependsOn) {
      const depKey = dep;
      if (keyToIndex.has(depKey)) {
        graph.get(depKey)!.push(mod.key);
        inDegree.set(mod.key, (inDegree.get(mod.key) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const mod of modules) {
    if ((inDegree.get(mod.key) || 0) === 0) {
      queue.push(mod.key);
    }
  }

  while (queue.length > 0) {
    const key = queue.shift()!;
    const idx = keyToIndex.get(key);
    if (idx !== undefined) {
      sorted.push(modules[idx]);
    }
    for (const dependent of graph.get(key) || []) {
      inDegree.set(dependent, (inDegree.get(dependent) || 0) - 1);
      if ((inDegree.get(dependent) || 0) === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length < modules.length) {
    const sortedKeys = new Set(sorted.map(m => m.key));
    for (const mod of modules) {
      if (!sortedKeys.has(mod.key)) {
        sorted.push(mod);
      }
    }
  }

  return sorted;
}
