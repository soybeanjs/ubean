import type { RpcHandler, RpcRequest, RpcResponse, DevToolsInfo, DevToolsRouteInfo, DevToolsPageInfo, DevToolsMiddlewareInfo } from '../types';

export function createRpcServer() {
  const handlers = new Map<string, RpcHandler>();
  const startTime = Date.now();
  let info: DevToolsInfo = {
    version: '0.0.1',
    startTime,
    config: {},
    pages: 0,
    apiRoutes: 0,
    middleware: 0,
    routes: [],
    pagesList: [],
    middlewaresList: []
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

  registerHandler('getInfo', () => getInfo());

  registerHandler('ping', () => ({ pong: true, time: Date.now() }));

  registerHandler('getRoutes', () => info.routes || []);

  registerHandler('getPages', () => info.pagesList || []);

  registerHandler('getMiddlewares', () => info.middlewaresList || []);

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
    setMiddlewares
  };
}

export type DevToolsRpcServer = ReturnType<typeof createRpcServer>;
