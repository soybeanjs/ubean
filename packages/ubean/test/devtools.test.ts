import { describe, it, expect } from 'vitest';
import { createDevToolsMiddleware } from '../src/core/devtools/server/middleware';
import { getDevtoolsClientScript, getDevtoolsIframeHtml } from '../src/core/devtools/client';
import { createRpcServer } from '../src/core/devtools/server/rpc';
import { DEVTOOLS_RPC_PATH, DEVTOOLS_IFRAME_PATH, DEVTOOLS_MAGIC_KEY } from '../src/core/devtools/types';
import { createUbeanApp } from '../src/runtime/app';

describe('DevTools RPC Server', () => {
  it('creates an RPC server with default info', () => {
    const rpc = createRpcServer();
    const info = rpc.getInfo();
    expect(info.version).toBe('0.0.1');
    expect(info.pages).toBe(0);
    expect(info.apiRoutes).toBe(0);
    expect(info.middleware).toBe(0);
    expect(info.routes).toEqual([]);
    expect(info.pagesList).toEqual([]);
    expect(info.middlewaresList).toEqual([]);
  });

  it('updates info via updateInfo', () => {
    const rpc = createRpcServer();
    rpc.updateInfo({
      pages: 5,
      apiRoutes: 10,
      middleware: 3,
      config: { preset: 'node' }
    });
    const info = rpc.getInfo();
    expect(info.pages).toBe(5);
    expect(info.apiRoutes).toBe(10);
    expect(info.middleware).toBe(3);
    expect(info.config).toEqual({ preset: 'node' });
  });

  it('sets routes via setRoutes', () => {
    const rpc = createRpcServer();
    const routes = [
      { method: 'GET', path: '/api/users' },
      { method: 'POST', path: '/api/users' }
    ];
    rpc.setRoutes(routes);
    const info = rpc.getInfo();
    expect(info.routes).toHaveLength(2);
    expect(info.apiRoutes).toBe(2);
    expect(info.routes?.[0].method).toBe('GET');
  });

  it('sets pages via setPages', () => {
    const rpc = createRpcServer();
    const pages = [
      { path: '/', name: 'Home' },
      { path: '/about', name: 'About' }
    ];
    rpc.setPages(pages);
    const info = rpc.getInfo();
    expect(info.pagesList).toHaveLength(2);
    expect(info.pages).toBe(2);
    expect(info.pagesList?.[0].name).toBe('Home');
  });

  it('sets middlewares via setMiddlewares', () => {
    const rpc = createRpcServer();
    const middlewares = [
      { path: '*', global: true },
      { path: '/api', global: false }
    ];
    rpc.setMiddlewares(middlewares);
    const info = rpc.getInfo();
    expect(info.middlewaresList).toHaveLength(2);
    expect(info.middleware).toBe(2);
  });

  it('handles ping method', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'ping'
    });
    expect(response.id).toBe('1');
    expect((response.result as any).pong).toBe(true);
    expect(typeof (response.result as any).time).toBe('number');
  });

  it('handles getInfo method', async () => {
    const rpc = createRpcServer();
    rpc.updateInfo({ pages: 3 });
    const response = await rpc.handleRequest({
      id: '2',
      method: 'getInfo'
    });
    expect(response.id).toBe('2');
    expect((response.result as any).pages).toBe(3);
  });

  it('handles getRoutes method', async () => {
    const rpc = createRpcServer();
    rpc.setRoutes([{ method: 'GET', path: '/test' }]);
    const response = await rpc.handleRequest({
      id: '3',
      method: 'getRoutes'
    });
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result as any[]).toHaveLength(1);
  });

  it('handles getPages method', async () => {
    const rpc = createRpcServer();
    rpc.setPages([{ path: '/' }]);
    const response = await rpc.handleRequest({
      id: '4',
      method: 'getPages'
    });
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result as any[]).toHaveLength(1);
  });

  it('handles getMiddlewares method', async () => {
    const rpc = createRpcServer();
    rpc.setMiddlewares([{ path: '*', global: true }]);
    const response = await rpc.handleRequest({
      id: '5',
      method: 'getMiddlewares'
    });
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result as any[]).toHaveLength(1);
  });

  it('returns error for unknown method', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '6',
      method: 'unknownMethod'
    });
    expect(response.error).toBe('Method not found: unknownMethod');
  });

  it('registers custom handlers', async () => {
    const rpc = createRpcServer();
    rpc.registerHandler('customMethod', (params: any) => ({
      message: 'hello',
      name: params?.name
    }));
    const response = await rpc.handleRequest({
      id: '7',
      method: 'customMethod',
      params: { name: 'world' }
    });
    expect((response.result as any).message).toBe('hello');
    expect((response.result as any).name).toBe('world');
  });

  it('handles batch requests', async () => {
    const rpc = createRpcServer();
    const responses = await rpc.handleBatch([
      { id: '1', method: 'ping' },
      { id: '2', method: 'getInfo' },
      { id: '3', method: 'unknown' }
    ]);
    expect(responses).toHaveLength(3);
    expect((responses[0].result as any).pong).toBe(true);
    expect(responses[2].error).toBeDefined();
  });

  it('catches errors in handlers', async () => {
    const rpc = createRpcServer();
    rpc.registerHandler('failingMethod', () => {
      throw new Error('test error');
    });
    const response = await rpc.handleRequest({
      id: '8',
      method: 'failingMethod'
    });
    expect(response.error).toBe('test error');
  });
});

describe('DevTools Client Script', () => {
  it('generates client script with RPC path', () => {
    const script = getDevtoolsClientScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
    expect(script).toContain(DEVTOOLS_RPC_PATH);
    expect(script).toContain(DEVTOOLS_IFRAME_PATH);
    expect(script).toContain('__ubeanDevtoolsInstalled');
    expect(script).toContain('createButton');
    expect(script).toContain('createPanel');
  });

  it('generates iframe HTML', async () => {
    const html = await getDevtoolsIframeHtml();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Ubean DevTools');
    expect(html).toContain(DEVTOOLS_RPC_PATH);
  }, 30000);
});

describe('DevTools Middleware', () => {
  it('creates middleware instance with enabled flag', () => {
    const devtools = createDevToolsMiddleware();
    expect(devtools.rpc).toBeDefined();
    expect(typeof devtools.middleware).toBe('function');
  });

  it('creates middleware with disabled flag', () => {
    const devtools = createDevToolsMiddleware({ enabled: false });
    expect(devtools.rpc).toBeDefined();
  });

  it('middleware has rpc server with update methods', () => {
    const devtools = createDevToolsMiddleware();
    expect(typeof devtools.rpc.updateInfo).toBe('function');
    expect(typeof devtools.rpc.setRoutes).toBe('function');
    expect(typeof devtools.rpc.setPages).toBe('function');
    expect(typeof devtools.rpc.setMiddlewares).toBe('function');
  });
});

describe('DevTools Integration with App', () => {
  it('creates app with devtools enabled', async () => {
    const app = createUbeanApp({ devtools: true });
    expect(app.devtools).toBeDefined();
    expect(app.devtools?.rpc).toBeDefined();
  });

  it('creates app without devtools by default', async () => {
    const app = createUbeanApp();
    expect(app.devtools).toBeUndefined();
  });

  it('handles RPC endpoint', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_RPC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'ping' })
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result.pong).toBe(true);
  });

  it('handles iframe endpoint', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_IFRAME_PATH}`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Ubean DevTools');
  }, 30000);

  it('injects devtools script into HTML responses', async () => {
    const app = createUbeanApp({ devtools: true });
    app.get('/test-html', c => {
      return c.html('<html><head></head><body><h1>Test</h1></body></html>');
    });
    await app.init();
    const req = new Request('http://localhost/test-html');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get(DEVTOOLS_MAGIC_KEY)).toBe('true');
    const html = await res.text();
    expect(html).toContain('__ubeanDevtoolsInstalled');
    expect(html).toContain('</body>');
  });

  it('does not inject into non-HTML responses', async () => {
    const app = createUbeanApp({ devtools: true });
    app.get('/test-json', c => {
      return c.json({ message: 'hello' });
    });
    await app.init();
    const req = new Request('http://localhost/test-json');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get(DEVTOOLS_MAGIC_KEY)).toBeNull();
    const data = await res.json();
    expect(data.message).toBe('hello');
  });

  it('does not enable devtools when disabled', async () => {
    const app = createUbeanApp({ devtools: false });
    const req = new Request(`http://localhost${DEVTOOLS_RPC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'ping' })
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });

  it('updates devtools info via rpc', async () => {
    const app = createUbeanApp({ devtools: true });
    app.devtools!.rpc.setRoutes([{ method: 'GET', path: '/api/test', filePath: '/test.ts' }]);
    app.devtools!.rpc.setPages([{ path: '/test', name: 'TestPage' }]);
    app.devtools!.rpc.setMiddlewares([{ path: '*', global: true, filePath: '/global.ts' }]);
    app.devtools!.rpc.updateInfo({
      config: { preset: 'test' }
    });

    const req = new Request(`http://localhost${DEVTOOLS_RPC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'getInfo' })
    });
    const res = await app.fetch(req);
    const data = await res.json();
    expect(data.result.pages).toBe(1);
    expect(data.result.apiRoutes).toBe(1);
    expect(data.result.middleware).toBe(1);
    expect(data.result.routes).toHaveLength(1);
    expect(data.result.pagesList).toHaveLength(1);
    expect(data.result.middlewaresList).toHaveLength(1);
    expect(data.result.config.preset).toBe('test');
  });

  it('returns 400 for invalid JSON on RPC endpoint', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_RPC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json'
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });
});
