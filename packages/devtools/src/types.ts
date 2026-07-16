/**
 * Shared devtools type contract.
 *
 * The host-facing contract types (the shapes `ubean`'s dev runner must build
 * to feed the RPC server, plus the iframe/client display types) live in
 * `ubean` itself so that `ubean` never depends on `@ubean/devtools`. This
 * file re-exports them and adds only package-internal types used solely
 * within `@ubean/devtools` server code.
 */

// Re-export the canonical contract types + runtime constants from ubean.
export type {
  DevToolsCustomTab,
  DevToolsInfo,
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsLayoutInfo,
  DevToolsCronInfo,
  DevToolsOptions
} from 'ubean';
export { DEVTOOLS_MAGIC_KEY, DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH, DEVTOOLS_CLIENT_PATH } from 'ubean';

// Local type-only bindings for use within package-internal interfaces and
// module augmentation below. (A pure `export type { X } from ...` re-export
// does not introduce a usable local name.)
import type { DevToolsInfo } from 'ubean';
import type { PlaygroundInvokeParams, PlaygroundInvokeResult } from './node/rpc/playground';
import type { AiToolDefinition, AiChatResponse } from './server/ai';
import type { TerminalStartParams, TerminalPollResult } from './server/terminal';

// ---------------------------------------------------------------------------
// Module augmentation — registers ubean's RPC functions and shared-state keys
// with the devframe type system so `getDevToolsRpcClient()` calls are
// type-safe on both server and client.
// ---------------------------------------------------------------------------

/** Read-result shape returned by `ubean:crud:read`. */
export interface CrudReadResult {
  success: boolean;
  content?: string;
  data?: unknown;
  error?: string;
}

/** Params for `ubean:ai:chat`. */
export interface AiChatParams {
  messages: import('./server/ai').AiChatMessage[];
  apiKey?: string;
  apiBase?: string;
  model?: string;
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'ubean:get-info': () => Promise<DevToolsInfo>;
    'ubean:get-env': () => Promise<Record<string, string>>;
    'ubean:crud:create': (params: CreateCrudParams) => Promise<CrudResult>;
    'ubean:crud:read': (params: ReadCrudParams) => Promise<CrudReadResult>;
    'ubean:crud:update': (params: UpdateCrudParams) => Promise<CrudResult>;
    'ubean:crud:delete': (params: DeleteCrudParams) => Promise<CrudResult>;
    'ubean:crud:restore': (path: string) => Promise<CrudResult>;
    'ubean:ai:tools': () => Promise<AiToolDefinition[]>;
    'ubean:ai:chat': (params: AiChatParams) => Promise<AiChatResponse>;
    'ubean:playground:invoke': (params: PlaygroundInvokeParams) => Promise<PlaygroundInvokeResult>;
    'ubean:terminal:start': (params: TerminalStartParams) => Promise<{ sessionId: string }>;
    'ubean:terminal:input': (params: { sessionId: string; data: string }) => Promise<boolean>;
    'ubean:terminal:resize': (params: { sessionId: string; cols: number; rows: number }) => Promise<boolean>;
    'ubean:terminal:poll': (params: { sessionId: string }) => Promise<TerminalPollResult>;
    'ubean:terminal:kill': (params: { sessionId: string }) => Promise<boolean>;
  }

  interface DevframeRpcSharedStates {
    'ubean:info': DevToolsInfo;
  }
}

// --- Package-internal types (only used inside @ubean/devtools) ---

export type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

export interface DevToolsServer {
  rpcHandlers: Map<string, RpcHandler>;
  registerHandler: (name: string, handler: RpcHandler) => void;
  getInfo: () => DevToolsInfo;
}

export interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

export interface RpcResponse<T = unknown> {
  id: string;
  result?: T;
  error?: string;
}

export interface DevToolsTab {
  id: string;
  label: string;
  icon?: string;
}

export type CrudResourceType = 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin';

export interface CrudResult {
  success: boolean;
  created?: string[];
  deleted?: string[];
  restored?: string[];
  updated?: string[];
  skipped?: string[];
  errors?: string[];
}

export interface CreateCrudParams {
  type: CrudResourceType;
  path: string;
  method?: string;
  schedule?: string;
  content?: string;
  force?: boolean;
}

export interface ReadCrudParams {
  type: CrudResourceType | 'env' | 'config';
  path?: string;
}

export interface UpdateCrudParams {
  type: CrudResourceType | 'env' | 'config';
  path?: string;
  key?: string;
  content?: string;
  value?: string;
}

export interface DeleteCrudParams {
  type: CrudResourceType | 'env';
  path?: string;
  key?: string;
  force?: boolean;
}

export type CrudHookType =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete';

export interface CrudHookContext {
  type: CrudResourceType | 'env' | 'config';
  path?: string;
  key?: string;
  content?: string;
  value?: string;
}

export type CrudHookHandler = (ctx: CrudHookContext) => void | Promise<void>;
