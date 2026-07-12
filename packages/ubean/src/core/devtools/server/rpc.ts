import type {
  RpcHandler,
  RpcRequest,
  RpcResponse,
  DevToolsInfo,
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsCronInfo
} from '../types';
import { createDevToolsHooks } from './hooks';
import type { DevToolsHooksInstance } from './hooks';
import { createCrudServer } from './crud';
import type { DevToolsCrudServer } from './crud';

interface RpcServerOptions {
  cwd?: string;
  getEnv?: () => Record<string, string>;
  setEnv?: (env: Record<string, string>) => void;
  getConfig?: () => Record<string, unknown>;
  onFileChange?: () => void | Promise<void>;
}

export function createRpcServer(options: RpcServerOptions = {}) {
  const handlers = new Map<string, RpcHandler>();
  const startTime = Date.now();
  let envData: Record<string, string> = {};

  const hooks: DevToolsHooksInstance = createDevToolsHooks();

  const crud: DevToolsCrudServer = createCrudServer({
    cwd: options.cwd || process.cwd(),
    hooks,
    getEnv: options.getEnv || (() => envData),
    setEnv:
      options.setEnv ||
      (env => {
        envData = { ...env };
        const safeEnv: Record<string, string> = {};
        const sensitiveKeys = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'];
        for (const [key, value] of Object.entries(env)) {
          const isSensitive = sensitiveKeys.some(k => key.toUpperCase().includes(k));
          safeEnv[key] = isSensitive ? '***' : value;
        }
        info.env = safeEnv;
      }),
    getConfig: options.getConfig,
    onFileChange: options.onFileChange
  });

  let info: DevToolsInfo = {
    version: '0.0.1',
    startTime,
    config: {},
    env: {},
    pages: 0,
    apiRoutes: 0,
    middleware: 0,
    crons: 0,
    presets: [],
    routes: [],
    pagesList: [],
    middlewaresList: [],
    cronsList: []
  };

  function registerHandler(name: string, handler: RpcHandler) {
    handlers.set(name, handler);
  }

  function updateInfo(partial: Partial<DevToolsInfo>) {
    info = { ...info, ...partial };
  }

  function getInfo(): DevToolsInfo {
    return { ...info };
  }

  function setRoutes(routes: DevToolsRouteInfo[]) {
    info.routes = routes;
    info.apiRoutes = routes.length;
  }

  function setPages(pages: DevToolsPageInfo[]) {
    info.pagesList = pages;
    info.pages = pages.length;
  }

  function setMiddlewares(middlewares: DevToolsMiddlewareInfo[]) {
    info.middlewaresList = middlewares;
    info.middleware = middlewares.length;
  }

  function setCrons(crons: DevToolsCronInfo[]) {
    info.cronsList = crons;
    info.crons = crons.length;
  }

  function setEnv(env: Record<string, string>) {
    envData = { ...env };
    const safeEnv: Record<string, string> = {};
    const sensitiveKeys = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'];
    for (const [key, value] of Object.entries(env)) {
      const isSensitive = sensitiveKeys.some(k => key.toUpperCase().includes(k));
      safeEnv[key] = isSensitive ? '***' : value;
    }
    info.env = safeEnv;
  }

  function setPresets(presets: string[]) {
    info.presets = [...presets];
  }

  function setOpenAPI(openAPI: DevToolsInfo['openAPI']) {
    info.openAPI = openAPI;
  }

  function setDatabase(database: DevToolsInfo['database']) {
    info.database = database;
  }

  registerHandler('getInfo', () => getInfo());

  registerHandler('ping', () => ({ pong: true, time: Date.now() }));

  registerHandler('getRoutes', () => info.routes || []);

  registerHandler('getPages', () => info.pagesList || []);

  registerHandler('getMiddlewares', () => info.middlewaresList || []);

  registerHandler('getCrons', () => info.cronsList || []);

  registerHandler('getEnv', () => {
    const safeEnv: Record<string, string> = {};
    const sensitiveKeys = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'];
    for (const [key, value] of Object.entries(envData)) {
      const upperKey = key.toUpperCase();
      if (sensitiveKeys.some(k => upperKey.includes(k))) {
        safeEnv[key] = '***';
      } else {
        safeEnv[key] = value;
      }
    }
    return safeEnv;
  });

  registerHandler('getPresets', () => info.presets || []);

  registerHandler('crud:create', params => crud.create(params as any));
  registerHandler('crud:read', params => crud.read(params as any));
  registerHandler('crud:update', params => crud.update(params as any));
  registerHandler('crud:delete', params => crud.delete(params as any));
  registerHandler('crud:restore', params => crud.restore((params as any).path));

  async function handleRequest(request: RpcRequest): Promise<RpcResponse> {
    const handler = handlers.get(request.method);
    if (!handler) {
      return {
        id: request.id,
        error: `Method not found: ${request.method}`
      };
    }

    try {
      const result = await handler(request.params);
      return {
        id: request.id,
        result
      };
    } catch (err) {
      return {
        id: request.id,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  async function handleBatch(requests: RpcRequest[]): Promise<RpcResponse[]> {
    return Promise.all(requests.map(req => handleRequest(req)));
  }

  return {
    registerHandler,
    handleRequest,
    handleBatch,
    getInfo,
    updateInfo,
    setRoutes,
    setPages,
    setMiddlewares,
    setCrons,
    setEnv,
    setPresets,
    setOpenAPI,
    setDatabase,
    hooks,
    crud
  };
}

export type DevToolsRpcServer = ReturnType<typeof createRpcServer>;
