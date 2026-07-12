import type { Plugin as VitePlugin } from 'vite';
import type {
  ModuleDefinition,
  ResolvedModule,
  ResolvedConfig
} from '../config/types';

const BUILTIN_MODULE_KEYS = new Set(['__ubean_core__', '__ubean_vue__', '__ubean_islands__']);

const MODULE_DEF_KEYS = new Set(['vitePlugin', 'setup', 'hooks', 'dependsOn']);

function isModuleDefinition(obj: unknown): obj is ModuleDefinition {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj as object);
  return keys.some(k => MODULE_DEF_KEYS.has(k));
}

function isVitePlugin(obj: unknown): obj is VitePlugin {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const p = obj as Record<string, unknown>;
  return typeof p.name === 'string' && !isModuleDefinition(obj);
}

function getModuleKey(mod: unknown, index: number): string {
  if (typeof mod === 'string') {
    return mod;
  }
  if (Array.isArray(mod)) {
    const [factory] = mod;
    if (typeof factory === 'function') {
      return factory.name || `__factory_${index}__`;
    }
    return `__tuple_${index}__`;
  }
  if (mod && typeof mod === 'object') {
    if (isModuleDefinition(mod)) {
      return mod.name || `__def_${index}__`;
    }
    const plugin = mod as VitePlugin;
    if (plugin.name) {
      return plugin.name;
    }
  }
  return `__module_${index}__`;
}

function getModuleName(mod: unknown, key: string): string {
  if (typeof mod === 'string') {
    const parts = mod.split('/');
    return parts[parts.length - 1] || mod;
  }
  if (Array.isArray(mod)) {
    const [factory] = mod;
    if (typeof factory === 'function') {
      return factory.name || key;
    }
    return key;
  }
  if (mod && typeof mod === 'object') {
    if (isModuleDefinition(mod) && mod.name) {
      return mod.name;
    }
    const plugin = mod as VitePlugin;
    if (plugin.name) {
      return plugin.name;
    }
  }
  return key;
}

function extractPlugins(mod: unknown): VitePlugin[] {
  if (!mod) return [];

  if (Array.isArray(mod)) {
    return mod.filter(isVitePlugin);
  }

  if (typeof mod === 'object') {
    if (isModuleDefinition(mod)) {
      if (mod.vitePlugin) {
        return Array.isArray(mod.vitePlugin) ? mod.vitePlugin.filter(isVitePlugin) : [mod.vitePlugin].filter(isVitePlugin);
      }
      return [];
    }

    if (isVitePlugin(mod)) {
      return [mod];
    }
  }

  return [];
}

function extractSetup(mod: unknown): ModuleDefinition['setup'] | undefined {
  if (isModuleDefinition(mod)) {
    return mod.setup;
  }
  return undefined;
}

function extractHooks(mod: unknown): ModuleDefinition['hooks'] | undefined {
  if (isModuleDefinition(mod)) {
    return mod.hooks;
  }
  return undefined;
}

function extractDependsOn(mod: unknown): string[] {
  if (isModuleDefinition(mod)) {
    return mod.dependsOn || [];
  }
  return [];
}

export interface ResolveModulesOptions {
  cwd: string;
  config: ResolvedConfig;
  builtinPlugins: VitePlugin[];
}

export interface ResolveModulesResult {
  plugins: VitePlugin[];
  modules: ResolvedModule[];
  setupFns: Array<(app: unknown) => void | Promise<void>>;
}

export async function resolveModules(options: ResolveModulesOptions): Promise<ResolveModulesResult> {
  const { config, builtinPlugins } = options;
  const { modules: userModules = [] } = config;

  const resolved = new Map<string, ResolvedModule>();
  const plugins: VitePlugin[] = [...builtinPlugins];
  const setupFns: Array<(app: unknown) => void | Promise<void>> = [];

  const builtinModule: ResolvedModule = {
    name: 'ubean-core',
    key: '__ubean_core__',
    plugins: builtinPlugins,
    dependsOn: []
  };
  resolved.set(builtinModule.key, builtinModule);

  for (let i = 0; i < userModules.length; i++) {
    const mod = userModules[i];
    const key = getModuleKey(mod, i);

    if (resolved.has(key) || BUILTIN_MODULE_KEYS.has(key)) {
      continue;
    }

    let resolvedPlugins: VitePlugin[] = [];
    let setupFn: ModuleDefinition['setup'] | undefined;
    let hooks: ModuleDefinition['hooks'] | undefined;
    let dependsOn: string[] = [];
    let name = getModuleName(mod, key);

    if (typeof mod === 'string') {
      try {
        const factory = await import(/* @vite-ignore */ mod);
        const factoryFn = factory.default || factory;
        if (typeof factoryFn === 'function') {
          const result = await factoryFn({}, null);
          if (result) {
            if (Array.isArray(result)) {
              resolvedPlugins = extractPlugins(result);
            } else {
              resolvedPlugins = extractPlugins(result);
              setupFn = extractSetup(result);
              hooks = extractHooks(result);
              dependsOn = extractDependsOn(result);
              if (isModuleDefinition(result) && result.name) name = result.name;
            }
          }
        }
      } catch {
        // Module not found, skip
      }
    } else if (Array.isArray(mod)) {
      const [factory, factoryOptions] = mod;
      if (typeof factory === 'function') {
        try {
          const result = await factory(factoryOptions, null);
          if (result) {
            if (Array.isArray(result)) {
              resolvedPlugins = extractPlugins(result);
            } else {
              resolvedPlugins = extractPlugins(result);
              setupFn = extractSetup(result);
              hooks = extractHooks(result);
              dependsOn = extractDependsOn(result);
              if (isModuleDefinition(result) && result.name) name = result.name;
            }
          }
        } catch {
          // Factory failed, skip
        }
      }
    } else {
      resolvedPlugins = extractPlugins(mod);
      setupFn = extractSetup(mod);
      hooks = extractHooks(mod);
      dependsOn = extractDependsOn(mod);
      if (isModuleDefinition(mod) && mod.name) name = mod.name;
    }

    const resolvedMod: ResolvedModule = {
      name,
      key,
      plugins: resolvedPlugins,
      setup: setupFn,
      hooks,
      dependsOn
    };

    resolved.set(key, resolvedMod);
    plugins.push(...resolvedPlugins);

    if (setupFn) {
      setupFns.push((app: unknown) => setupFn!({}, app));
    }
  }

  return {
    plugins,
    modules: Array.from(resolved.values()),
    setupFns
  };
}

export function defineModule<TOptions = unknown>(
  def: ModuleDefinition & { setup?: (options: TOptions, app: unknown) => void | Promise<void> }
): ModuleDefinition {
  return def;
}
