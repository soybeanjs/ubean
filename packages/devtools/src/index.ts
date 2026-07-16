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

// Reused server modules (CRUD/AI/hooks — transport-agnostic, used by the RPC layer).
export { createCrudServer } from './server/crud';
export { createAiServer } from './server/ai';
export { createDevToolsHooks } from './server/hooks';

export type { DevToolsCrudServer } from './server/crud';
export type { DevToolsAiServer, AiChatMessage, AiChatResponse, AiToolDefinition } from './server/ai';
export type { DevToolsHooksInstance, DevToolsHooks } from './server/hooks';

export * from './types';
