export interface DevToolsOptions {
  enabled?: boolean;
  port?: number;
  host?: string;
}

export interface DevToolsServer {
  rpcHandlers: Map<string, RpcHandler>;
  registerHandler: (name: string, handler: RpcHandler) => void;
  getInfo: () => DevToolsInfo;
}

export type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

export interface DevToolsRouteInfo {
  method: string;
  path: string;
  filePath?: string;
}

export interface DevToolsPageInfo {
  path: string;
  name?: string;
  filePath?: string;
  layout?: string;
}

export interface DevToolsMiddlewareInfo {
  path: string;
  filePath?: string;
  global: boolean;
}

export interface DevToolsInfo {
  version: string;
  startTime: number;
  config: Record<string, unknown>;
  pages: number;
  apiRoutes: number;
  middleware: number;
  routes?: DevToolsRouteInfo[];
  pagesList?: DevToolsPageInfo[];
  middlewaresList?: DevToolsMiddlewareInfo[];
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

export const DEVTOOLS_MAGIC_KEY = '__ubean_devtools__';
export const DEVTOOLS_RPC_PATH = '/__ubean_devtools__/rpc';
export const DEVTOOLS_CLIENT_PATH = '/__ubean_devtools__/client';
export const DEVTOOLS_IFRAME_PATH = '/__ubean_devtools__/iframe';
