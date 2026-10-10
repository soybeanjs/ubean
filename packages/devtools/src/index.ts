// Devframe integration — devframe definition + Vite plugin shell + state helpers.
export {
  createUbeanDevframe,
  ubeanDevtoolsPlugin,
  buildDevToolsInfo,
  emptyDevToolsInfo,
  UBEAN_INFO_STATE_KEY,
  maskSensitiveEnv
} from './node';
export type { UbeanDevtoolsPlugin, UbeanDevtoolsPluginOptions, ScanResultLike, DevToolsConfigMeta } from './node';

// RPC function aggregator (for testing / custom setups).
export { createAllRpcFunctions } from './node/rpc';
export type { UbeanRpcFunctions, RpcDeps } from './node/rpc';
export { UBEAN_RPC_NAMESPACE, UBEAN_AI_STREAM_STATE_KEY, UBEAN_ANCHOR_DOCK } from './node/rpc/types';

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
