import type { App, Component, Plugin } from 'vue';
import type { PageHead } from '../pages/protocol';

export interface AppPluginConfig {
  plugin: Plugin | [Plugin, ...any[]];
  mode?: 'all' | 'client' | 'server';
}

export interface DefineAppOptions {
  plugins?: Array<Plugin | [Plugin, ...any[]] | AppPluginConfig>;
  globalComponents?: Record<string, Component>;
  provides?: Record<string | symbol, unknown>;
  head?: PageHead;
  rootId?: string;
  rootAttrs?: Record<string, string>;
  onAppCreated?: (app: App) => void | Promise<void>;
  onClientReady?: (app: App) => void | Promise<void>;
  errorComponent?: Component;
  loadingComponent?: Component;
}

export interface ResolvedAppConfig {
  plugins: AppPluginConfig[];
  globalComponents: Record<string, Component>;
  provides: Record<string | symbol, unknown>;
  head?: PageHead;
  rootId: string;
  rootAttrs: Record<string, string>;
  onAppCreated?: (app: App) => void | Promise<void>;
  onClientReady?: (app: App) => void | Promise<void>;
  errorComponent?: Component;
  loadingComponent?: Component;
}

export function defineApp(options: DefineAppOptions): ResolvedAppConfig {
  const plugins: AppPluginConfig[] = [];

  if (options.plugins) {
    for (const p of options.plugins) {
      if (Array.isArray(p)) {
        plugins.push({ plugin: p as [Plugin, ...any[]], mode: 'all' });
      } else if (typeof p === 'object' && 'plugin' in p) {
        plugins.push(p);
      } else {
        plugins.push({ plugin: p as Plugin, mode: 'all' });
      }
    }
  }

  return {
    plugins,
    globalComponents: options.globalComponents || {},
    provides: options.provides || {},
    head: options.head,
    rootId: options.rootId || 'app',
    rootAttrs: options.rootAttrs || {},
    onAppCreated: options.onAppCreated,
    onClientReady: options.onClientReady,
    errorComponent: options.errorComponent,
    loadingComponent: options.loadingComponent
  };
}

export function applyAppConfig(app: App, config: ResolvedAppConfig, mode: 'client' | 'server'): void {
  for (const { plugin, mode: pluginMode = 'all' } of config.plugins) {
    if (pluginMode === 'all' || pluginMode === mode) {
      if (Array.isArray(plugin)) {
        app.use(plugin[0], ...plugin.slice(1));
      } else {
        app.use(plugin);
      }
    }
  }

  for (const [name, comp] of Object.entries(config.globalComponents)) {
    app.component(name, comp);
  }

  for (const [key, value] of Object.entries(config.provides)) {
    app.provide(key, value);
  }
}

export function createDefaultAppConfig(): ResolvedAppConfig {
  return {
    plugins: [],
    globalComponents: {},
    provides: {},
    rootId: 'app',
    rootAttrs: {}
  };
}
