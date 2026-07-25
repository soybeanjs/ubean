// Vite DevTools Kit (DTK) integration — Vite plugin entry point + state helpers.
export {
  ubeanDevtoolsPlugin,
  defineRpcFunction,
  buildDevToolsInfo,
  emptyDevToolsInfo,
  UBEAN_INFO_STATE_KEY,
  maskSensitiveEnv
} from './node';
export type { UbeanDevtoolsPluginOptions, ViteDevToolsNodeContext, ScanResultLike, DevToolsConfigMeta } from './node';

// RPC function aggregator (for testing / custom setups).
export { createAllRpcFunctions } from './node/rpc';

// Reused server modules (CRUD/AI/terminal/hooks — transport-agnostic, used by the RPC layer).
export { createCrudServer } from './server/crud';
export { createAiServer } from './server/ai';
export { createTerminalServer } from './server/terminal';
export { createDevToolsHooks } from './server/hooks';

export type { DevToolsCrudServer } from './server/crud';
export type { DevToolsAiServer, AiChatMessage, AiChatResponse, AiToolDefinition } from './server/ai';
export type { TerminalServer, TerminalStartParams, TerminalPollResult } from './server/terminal';
export type { DevToolsHooksInstance, DevToolsHooks } from './server/hooks';

export * from './types';

// Custom DevTools tab registration API.
export { defineDevToolsTab, getCustomTabs, clearCustomTabs } from './define-tab';
export type { DevToolsTabDefinition } from './define-tab';
