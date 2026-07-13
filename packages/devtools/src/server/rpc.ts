import type {
  RpcHandler,
  RpcRequest,
  RpcResponse,
  DevToolsInfo,
  DevToolsRouteInfo,
  DevToolsPageInfo,
  DevToolsMiddlewareInfo,
  DevToolsCronInfo,
  DevToolsLayoutInfo,
  DevToolsCustomTab
} from '../types';
import { maskSensitiveEnv } from '../shared/env';
import { createDevToolsHooks } from './hooks';
import type { DevToolsHooksInstance } from './hooks';
import { createAiServer } from './ai';
import type { AiChatMessage } from './ai';
import { createCrudServer } from './crud';
import type { DevToolsCrudServer } from './crud';

interface RpcServerOptions {
  cwd?: string;
  getEnv?: () => Record<string, string>;
  setEnv?: (env: Record<string, string>) => void;
  getConfig?: () => Record<string, unknown>;
  onFileChange?: () => void | Promise<void>;
  ai?: {
    apiKey?: string;
    apiBase?: string;
    model?: string;
  };
}

export function createRpcServer(options: RpcServerOptions = {}) {
  const handlers = new Map<string, RpcHandler>();
  const startTime = Date.now();
  let envData: Record<string, string> = {};

  let info: DevToolsInfo = {
    version: '0.0.1',
    startTime,
    config: {},
    env: {},
    pages: 0,
    apiRoutes: 0,
    middleware: 0,
    layouts: 0,
    crons: 0,
    presets: [],
    routes: [],
    pagesList: [],
    middlewaresList: [],
    layoutsList: [],
    cronsList: [],
    customTabs: [],
    ai: {
      enabled: !!(options.ai?.apiKey || process.env.UBEAN_AI_API_KEY || process.env.OPENAI_API_KEY),
      provider: options.ai?.apiBase?.includes('anthropic') ? 'anthropic' : 'openai',
      model: options.ai?.model
    }
  };

  const hooks: DevToolsHooksInstance = createDevToolsHooks();

  const crud: DevToolsCrudServer = createCrudServer({
    cwd: options.cwd || process.cwd(),
    hooks,
    getEnv: options.getEnv || (() => envData),
    setEnv:
      options.setEnv ||
      (env => {
        envData = { ...env };
        info.env = maskSensitiveEnv(envData);
      }),
    getConfig: options.getConfig,
    onFileChange: options.onFileChange
  });

  const ai = createAiServer(crud, () => info);

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

  function setLayouts(layouts: DevToolsLayoutInfo[]) {
    info.layoutsList = layouts;
    info.layouts = layouts.length;
  }

  function setEnv(env: Record<string, string>) {
    envData = { ...env };
    info.env = maskSensitiveEnv(envData);
  }

  function setPresets(presets: string[]) {
    info.presets = [...presets];
  }

  function setConfig(config: Record<string, unknown>) {
    info.config = { ...config };
  }

  function setOpenAPI(openAPI: DevToolsInfo['openAPI']) {
    info.openAPI = openAPI;
  }

  function setDatabase(database: DevToolsInfo['database']) {
    info.database = database;
  }

  function setCustomTabs(tabs: DevToolsCustomTab[]) {
    info.customTabs = [...tabs];
  }

  registerHandler('getInfo', () => getInfo());

  registerHandler('ping', () => ({ pong: true, time: Date.now() }));

  registerHandler('getRoutes', () => info.routes || []);

  registerHandler('getPages', () => info.pagesList || []);

  registerHandler('getMiddlewares', () => info.middlewaresList || []);

  registerHandler('getCrons', () => info.cronsList || []);

  registerHandler('getLayouts', () => info.layoutsList || []);

  registerHandler('getEnv', () => maskSensitiveEnv(envData));

  registerHandler('getPresets', () => info.presets || []);

  registerHandler('crud:create', params => crud.create(params as never));
  registerHandler('crud:read', params => crud.read(params as never));
  registerHandler('crud:update', params => crud.update(params as never));
  registerHandler('crud:delete', params => crud.delete(params as never));
  registerHandler('crud:restore', params => crud.restore((params as { path: string }).path));

  registerHandler('ai:tools', () => ai.getToolDefinitions());
  registerHandler('ai:chat', params =>
    ai.chat({
      messages: (params as { messages: AiChatMessage[] }).messages,
      apiKey: (params as { apiKey?: string }).apiKey || options.ai?.apiKey,
      apiBase: (params as { apiBase?: string }).apiBase || options.ai?.apiBase,
      model: (params as { model?: string }).model || options.ai?.model
    })
  );

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
    setLayouts,
    setEnv,
    setPresets,
    setConfig,
    setOpenAPI,
    setDatabase,
    setCustomTabs,
    hooks,
    crud
  };
}

export type DevToolsRpcServer = ReturnType<typeof createRpcServer>;
