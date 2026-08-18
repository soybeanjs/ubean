/**
 * `@ubean/ai` Vite plugin.
 *
 * Responsibilities (decision A scope):
 * 1. Config injection — resolve AI options (provider presets, default provider)
 *    and push them into the client runtime via `setAIProviderConfig`.
 * 2. Auto-import — register a resolver so `useChat` / `useAgent` /
 *    `useAIProvider` are auto-imported from `@ubean/ai/runtime/vue` in SFCs.
 *
 * The plugin does NOT implement a dev gateway proxy (left to the external
 * gateway, e.g. OmniRoute). Providers are registered on the server kernel via
 * `defineProvider` at config time.
 */
import type { Plugin } from 'vite';
import { registerComponentResolver } from '@ubean/build';
import { defineProvider } from './core';
import type { ProviderDefinition } from './types';

/** Composable API names auto-importable from `@ubean/ai/runtime/vue`. */
const RUNTIME_COMPOSABLES = ['useChat', 'useAgent', 'useAIProvider'] as const;

export interface UbeanAiOptions {
  /** Master switch. Disabled plugin returns a noop. */
  enabled?: boolean;
  /** Provider presets to register on the server kernel. */
  providers?: ProviderDefinition[];
  /** Default provider id used when a model string has no provider segment. */
  defaultProvider?: string;
  /** Auto-import the runtime composables (default true). */
  autoImport?: boolean;
}

/** Type-safe helper for defining AI options (pass-through). */
export function defineAiConfig(options: UbeanAiOptions): UbeanAiOptions {
  return options;
}

const VIRTUAL_RUNTIME_ID = 'virtual:ubean-ai/runtime';
const RESOLVED_VIRTUAL_RUNTIME_ID = `\0${VIRTUAL_RUNTIME_ID}`;

export function ubeanAiPlugin(userOptions: UbeanAiOptions = {}): Plugin {
  const options: UbeanAiOptions = userOptions;

  if (options.enabled === false) {
    return { name: 'ubean:ai:noop', enforce: 'post' };
  }

  const autoImportEnabled = options.autoImport !== false;

  // Register provider presets on the server kernel at module-load time.
  // (defineProvider is idempotent by id; safe against duplicate registration.)
  for (const provider of options.providers ?? []) {
    defineProvider(provider);
  }

  // Register a component/composable resolver so the runtime composables are
  // auto-imported in SFCs. The core ubeanVite merges registered resolvers
  // into unplugin-vue-components.
  if (autoImportEnabled) {
    registerComponentResolver((name: string) => {
      if ((RUNTIME_COMPOSABLES as readonly string[]).includes(name)) {
        return { name, from: '@ubean/ai/runtime/vue' };
      }
      return undefined;
    });
  }

  return {
    name: 'ubean:ai',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_RUNTIME_ID) return RESOLVED_VIRTUAL_RUNTIME_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_RUNTIME_ID) {
        return generateRuntimeVirtualModule(options);
      }
      return null;
    },

    config() {
      return {
        optimizeDeps: {
          include: ['@ubean/ai/runtime/vue']
        }
      };
    }
  };
}

/** Generate the client virtual module that injects config and re-exports the runtime. */
function generateRuntimeVirtualModule(options: UbeanAiOptions): string {
  const defaultProvider = options.defaultProvider ?? '';
  const injectConfig = defaultProvider
    ? `setAIProviderConfig({ defaultProvider: ${JSON.stringify(defaultProvider)} });`
    : '';

  return `
import { useChat, useAgent, useAIProvider, setAIProviderConfig } from '@ubean/ai/runtime/vue';

${injectConfig}

export { useChat, useAgent, useAIProvider, setAIProviderConfig };
`;
}

export default ubeanAiPlugin;
