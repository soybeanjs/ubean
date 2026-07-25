import type { Plugin as VitePlugin } from 'vite';
import type { ModuleDefinition, ResolvedModule, ResolvedConfig } from '@ubean/config';
import { createHooks } from 'hookable';
import { BUILTIN_MODULES, isBuiltinDisabled, extractBuiltinOptions } from './builtins';
import { createModuleKitContext, topologicalSort } from './kit';
import type {
  ModuleKitContext,
  ModuleHooks,
  ServerHandlerRegistration,
  DevServerHandlerRegistration,
  DevToolsCustomTab
} from './kit';

export {
  BUILTIN_MODULES,
  getBuiltinModuleByKey,
  isBuiltinModuleConfig,
  extractBuiltinOptions,
  isBuiltinDisabled
} from './builtins';
export type { BuiltinModuleDefinition } from './builtins';
export { createModuleKitContext, topologicalSort } from './kit';
export type {
  ModuleKitContext,
  ModuleHooks,
  ServerHandlerRegistration,
  DevServerHandlerRegistration,
  VirtualImportRegistration,
  ComponentsDirRegistration,
  AutoImportRegistration,
  DevToolsCustomTab
} from './kit';

const BUILTIN_CORE_KEYS = new Set(['__ubean_core__', '__ubean_vue__', '__ubean_islands__']);

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
        return Array.isArray(mod.vitePlugin)
          ? mod.vitePlugin.filter(isVitePlugin)
          : [mod.vitePlugin].filter(isVitePlugin);
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

interface ParsedModule {
  key: string;
  name: string;
  plugins: VitePlugin[];
  setup?: ModuleDefinition['setup'];
  hooks?: ModuleDefinition['hooks'];
  dependsOn: string[];
  options: Record<string, unknown>;
  kit: ModuleKitContext;
}

export interface ResolveModulesOptions {
  cwd: string;
  config: ResolvedConfig;
  builtinPlugins: VitePlugin[];
}

export interface ResolveModulesResult {
  plugins: VitePlugin[];
  modules: ResolvedModule[];
  setupFns: Array<(kit?: ModuleKitContext) => void | Promise<void>>;
  hooks: ReturnType<typeof createHooks<ModuleHooks>>;
  serverHandlers: ServerHandlerRegistration[];
  devServerHandlers: DevServerHandlerRegistration[];
  devToolsTabs: DevToolsCustomTab[];
}

function userModulesHasBuiltin(userModules: unknown[], builtin: { modulePath: string; pluginName: string }): boolean {
  for (const mod of userModules) {
    if (typeof mod === 'string') {
      if (mod === builtin.modulePath || mod.endsWith(builtin.modulePath)) {
        return true;
      }
    } else if (Array.isArray(mod)) {
      const [factory] = mod;
      if (typeof factory === 'function') {
        if (factory.name === `${builtin.pluginName.replace(':', '')}Plugin`) {
          return true;
        }
      }
    } else if (mod && typeof mod === 'object') {
      if (isModuleDefinition(mod) && mod.name === builtin.pluginName) {
        return true;
      }
      const plugin = mod as VitePlugin;
      if (plugin.name === builtin.pluginName) {
        return true;
      }
    }
  }
  return false;
}

async function loadBuiltinModule(
  builtin: { modulePath: string; factoryExport?: string; pluginName: string; key: string },
  configValue: unknown
): Promise<ParsedModule | null> {
  const options = extractBuiltinOptions(configValue);
  const kit = createModuleKitContext(builtin.pluginName, options);
  try {
    const mod = await import(/* @vite-ignore */ builtin.modulePath);
    const factory = builtin.factoryExport ? mod[builtin.factoryExport] : mod.default || mod;
    if (typeof factory === 'function') {
      const result = await factory(options, kit);
      if (result) {
        const plugins = extractPlugins(result);
        const setup = extractSetup(result);
        const hooks = extractHooks(result);
        const dependsOn = extractDependsOn(result);
        plugins.push(...kit._vitePlugins);
        return {
          key: builtin.modulePath,
          name: builtin.pluginName,
          plugins,
          setup,
          hooks,
          dependsOn,
          options,
          kit
        };
      }
    }
  } catch {
    // Module not installed, skip auto-registration
  }
  return null;
}

async function parseUserModule(mod: unknown, index: number): Promise<ParsedModule | null> {
  const key = getModuleKey(mod, index);
  const name = getModuleName(mod, key);
  const options: Record<string, unknown> = {};
  const kit = createModuleKitContext(name, options);

  let resolvedPlugins: VitePlugin[] = [];
  let setupFn: ModuleDefinition['setup'] | undefined;
  let hooks: ModuleDefinition['hooks'] | undefined;
  let dependsOn: string[] = [];

  if (typeof mod === 'string') {
    try {
      const factoryMod = await import(/* @vite-ignore */ mod);
      const factoryFn = factoryMod.default || factoryMod;
      if (typeof factoryFn === 'function') {
        const result = await factoryFn(options, kit);
        if (result) {
          if (Array.isArray(result)) {
            resolvedPlugins = extractPlugins(result);
          } else {
            resolvedPlugins = extractPlugins(result);
            setupFn = extractSetup(result);
            hooks = extractHooks(result);
            dependsOn = extractDependsOn(result);
            if (isModuleDefinition(result) && result.name) {
              kit.moduleName = result.name;
            }
          }
        }
      }
    } catch {
      // Module not found, skip
      return null;
    }
  } else if (Array.isArray(mod)) {
    const [factory, factoryOptions] = mod;
    Object.assign(options, (factoryOptions as Record<string, unknown>) || {});
    if (typeof factory === 'function') {
      try {
        const result = await factory(factoryOptions, kit);
        if (result) {
          if (Array.isArray(result)) {
            resolvedPlugins = extractPlugins(result);
          } else {
            resolvedPlugins = extractPlugins(result);
            setupFn = extractSetup(result);
            hooks = extractHooks(result);
            dependsOn = extractDependsOn(result);
            if (isModuleDefinition(result) && result.name) {
              kit.moduleName = result.name;
            }
          }
        }
      } catch {
        // Factory failed, skip
        return null;
      }
    }
  } else if (mod && typeof mod === 'object') {
    resolvedPlugins = extractPlugins(mod);
    setupFn = extractSetup(mod);
    hooks = extractHooks(mod);
    dependsOn = extractDependsOn(mod);
    if (isModuleDefinition(mod) && mod.name) {
      kit.moduleName = mod.name;
    }
  } else {
    return null;
  }

  resolvedPlugins.push(...kit._vitePlugins);

  return {
    key,
    name: kit.moduleName || name,
    plugins: resolvedPlugins,
    setup: setupFn,
    hooks,
    dependsOn,
    options,
    kit
  };
}

export async function resolveModules(options: ResolveModulesOptions): Promise<ResolveModulesResult> {
  const { config, builtinPlugins } = options;
  const { modules: userModules = [] } = config;
  const moduleHooks = createHooks<ModuleHooks>();

  const parsed: ParsedModule[] = [];
  const parsedKeys = new Set<string>();
  const plugins: VitePlugin[] = [...builtinPlugins];
  const serverHandlers: ServerHandlerRegistration[] = [];
  const devServerHandlers: DevServerHandlerRegistration[] = [];
  const devToolsTabs: DevToolsCustomTab[] = [];

  for (const builtin of BUILTIN_MODULES) {
    const configValue = config[builtin.key as keyof ResolvedConfig];
    if (isBuiltinDisabled(configValue)) continue;
    if (userModulesHasBuiltin(userModules, builtin)) continue;

    const loaded = await loadBuiltinModule(builtin, configValue);
    if (loaded && !BUILTIN_CORE_KEYS.has(loaded.key) && !parsedKeys.has(loaded.key)) {
      parsedKeys.add(loaded.key);
      parsed.push(loaded);
    }
  }

  for (let i = 0; i < userModules.length; i++) {
    const mod = userModules[i];
    const key = getModuleKey(mod, i);

    if (BUILTIN_CORE_KEYS.has(key) || parsedKeys.has(key)) continue;

    const parsedMod = await parseUserModule(mod, i);
    if (parsedMod) {
      parsedKeys.add(parsedMod.key);
      parsed.push(parsedMod);
    }
  }

  const keyToIndex = new Map<string, number>();
  for (let i = 0; i < parsed.length; i++) {
    keyToIndex.set(parsed[i].key, i);
  }

  const sorted = topologicalSort(parsed, keyToIndex);

  const resolvedModules: ResolvedModule[] = [];

  const coreModule: ResolvedModule = {
    name: 'ubean-core',
    key: '__ubean_core__',
    plugins: builtinPlugins,
    dependsOn: []
  };
  resolvedModules.push(coreModule);

  for (const mod of sorted) {
    if (mod.setup) {
      const setup = mod.setup;
      const kit = mod.kit;
      kit.hooks = {
        hook: ((name: keyof ModuleHooks, fn: (...args: unknown[]) => unknown) =>
          moduleHooks.hook(name, fn as never)) as ModuleKitContext['hooks']['hook'],
        callHook: async (name: keyof ModuleHooks, ...args: unknown[]) => {
          await (moduleHooks.callHook as (n: string, ...a: unknown[]) => Promise<void>)(name, ...args);
        }
      };
      await setup(mod.options, kit);
    }

    if (mod.hooks) {
      for (const [hookName, hookFn] of Object.entries(mod.hooks)) {
        moduleHooks.hook(hookName as keyof ModuleHooks, hookFn as never);
      }
    }

    plugins.push(...mod.plugins);
    plugins.push(...mod.kit._vitePlugins);
    serverHandlers.push(...mod.kit._serverHandlers);
    devServerHandlers.push(...mod.kit._devServerHandlers);
    devToolsTabs.push(...mod.kit._devToolsTabs);

    resolvedModules.push({
      name: mod.name,
      key: mod.key,
      plugins: [...mod.plugins, ...mod.kit._vitePlugins],
      options: mod.options,
      setup: mod.setup,
      hooks: mod.hooks,
      dependsOn: mod.dependsOn
    });
  }

  return {
    plugins,
    modules: resolvedModules,
    setupFns: [],
    hooks: moduleHooks,
    serverHandlers,
    devServerHandlers,
    devToolsTabs
  };
}

export function defineModule<TOptions = unknown>(
  def: ModuleDefinition & { setup?: (options: TOptions, kit: ModuleKitContext) => void | Promise<void> }
): ModuleDefinition {
  return def;
}
