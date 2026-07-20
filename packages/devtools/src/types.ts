/**
 * Shared devtools type contract.
 *
 * The host-facing contract types (the shapes `ubean`'s dev runner must build
 * to feed the RPC server, plus the iframe/client display types) are imported
 * from `ubean` using type-only imports (erased at compile time, no runtime
 * circular dependency). All runtime dependencies on `ubean` (scaffold
 * functions, fs ops) are injected via `UbeanDevtoolsPluginOptions` so
 * `@ubean/devtools` never has a hard runtime import from `ubean`.
 */

// Type-only re-export of the canonical contract types from ubean.
// These are erased at compile time and create NO runtime dependency.
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

// Local type-only bindings for use within package-internal interfaces and
// module augmentation below.
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

// --- Scaffold injection types (runtime deps from ubean injected via options) ---

export type DevToolsScaffoldType = 'page' | 'api' | 'layout' | 'middleware' | 'reuse';

export interface ScaffoldResult {
  created: string[];
  deleted: string[];
  restored: string[];
  skipped: string[];
  errors: string[];
}

export interface ScaffoldOptions {
  cwd?: string;
  type: DevToolsScaffoldType;
  path: string;
  method?: string;
  force?: boolean;
  dry?: boolean;
  baseDir?: string;
}

export interface DevToolsFsOps {
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string, enc?: BufferEncoding) => Promise<string>;
  writeFile: (path: string, content: string, enc?: BufferEncoding) => Promise<void>;
  remove: (path: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  createBackup: (path: string, opts?: { backupSuffix?: string; removeOriginal?: boolean }) => Promise<string | null>;
  removeBackup: (path: string, opts?: { backupSuffix?: string }) => Promise<void>;
}

export interface DevToolsScaffoldOps {
  createFsOps: (cwd: string) => DevToolsFsOps;
  scaffold: (opts: ScaffoldOptions) => Promise<ScaffoldResult>;
  deleteScaffold: (opts: ScaffoldOptions) => Promise<ScaffoldResult>;
  recoverScaffold: (opts: ScaffoldOptions) => Promise<ScaffoldResult>;
}
