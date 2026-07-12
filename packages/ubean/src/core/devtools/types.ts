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

export interface DevToolsCronInfo {
  name: string;
  schedule?: string;
  filePath?: string;
}

export interface DevToolsLayoutInfo {
  name: string;
  path: string;
  filePath?: string;
  isDefault: boolean;
}

export interface DevToolsInfo {
  version: string;
  startTime: number;
  config: Record<string, unknown>;
  env?: Record<string, string>;
  pages: number;
  apiRoutes: number;
  middleware: number;
  layouts?: number;
  crons?: number;
  presets?: string[];
  routes?: DevToolsRouteInfo[];
  pagesList?: DevToolsPageInfo[];
  middlewaresList?: DevToolsMiddlewareInfo[];
  layoutsList?: DevToolsLayoutInfo[];
  cronsList?: DevToolsCronInfo[];
  openAPI?: {
    enabled: boolean;
    scalarPath?: string;
    openAPIPath?: string;
  };
  database?: {
    drizzleStudioAvailable?: boolean;
    studioUrl?: string;
  };
  customTabs?: DevToolsCustomTab[];
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

export interface DevToolsCustomTab {
  id: string;
  label: string;
  icon?: string;
  src: string;
  sandbox?: string[];
}

export type CrudResourceType = 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron';

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

export const DEVTOOLS_MAGIC_KEY = '__ubean_devtools__';
export const DEVTOOLS_RPC_PATH = '/__ubean_devtools__/rpc';
export const DEVTOOLS_CLIENT_PATH = '/__ubean_devtools__/client';
export const DEVTOOLS_IFRAME_PATH = '/__ubean_devtools__/iframe';
