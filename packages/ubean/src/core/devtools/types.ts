export type {
  DevToolsOptions,
  DevToolsServer,
  RpcHandler,
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsCronInfo,
  DevToolsLayoutInfo,
  DevToolsInfo,
  RpcRequest,
  RpcResponse,
  DevToolsTab,
  DevToolsCustomTab,
  CrudResourceType,
  CrudResult,
  CreateCrudParams,
  ReadCrudParams,
  UpdateCrudParams,
  DeleteCrudParams,
  CrudHookType,
  CrudHookContext,
  CrudHookHandler
} from '@ubean/devtools';

export const DEVTOOLS_MAGIC_KEY = '_devtools';
export const DEVTOOLS_RPC_PATH = '/_devtools/rpc';
export const DEVTOOLS_CLIENT_PATH = '/_devtools/client';
export const DEVTOOLS_IFRAME_PATH = '/_devtools/iframe';
