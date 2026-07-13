import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDevToolsMiddleware,
  createRpcServer,
  getDevtoolsClientScript,
  getDevtoolsIframeHtml,
  DEVTOOLS_RPC_PATH,
  DEVTOOLS_IFRAME_PATH,
  DEVTOOLS_CLIENT_PATH,
  DEVTOOLS_MAGIC_KEY
} from '../src';
import { defineDevToolsTab, getCustomTabs, clearCustomTabs } from 'ubean';
import { createUbeanApp } from 'ubean';

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
    expect(script).toContain(DEVTOOLS_CLIENT_PATH);
    expect(script).toContain('__ubeanDevtoolsInstalled');
    expect(script).toContain('createButton');
    expect(script).toContain('createPanel');
  });

  it('generates iframe HTML', async () => {
    const html = await getDevtoolsIframeHtml();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html.toLowerCase()).toContain('<!doctype html>');
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
    await app.ensureDevtools();
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

  it('handles client SPA root endpoint', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_CLIENT_PATH}`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Ubean DevTools');
    expect(html).toContain(DEVTOOLS_RPC_PATH);
  }, 30000);

  it('handles client SPA root with trailing slash', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_CLIENT_PATH}/`);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  }, 30000);

  it('returns 404 for non-existent client assets', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_CLIENT_PATH}/assets/nonexistent.js`);
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal in client assets', async () => {
    const app = createUbeanApp({ devtools: true });
    const req = new Request(`http://localhost${DEVTOOLS_CLIENT_PATH}/../../../etc/passwd`);
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });

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
    await app.ensureDevtools();
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

describe('DevTools Hooks System (P6-13)', () => {
  it('has hooks instance on RPC server', () => {
    const rpc = createRpcServer();
    expect(rpc.hooks).toBeDefined();
    expect(typeof rpc.hooks.registerHook).toBe('function');
    expect(typeof rpc.hooks.runHook).toBe('function');
  });

  it('registers and runs beforeCreate hook', async () => {
    const rpc = createRpcServer();
    let hookCalled = false;
    let hookCtx: any = null;

    rpc.hooks.registerHook('beforeCreate', ctx => {
      hookCalled = true;
      hookCtx = ctx;
    });

    await rpc.hooks.runHook('beforeCreate', { type: 'page', path: '/test' });
    expect(hookCalled).toBe(true);
    expect(hookCtx.type).toBe('page');
    expect(hookCtx.path).toBe('/test');
  });

  it('runs multiple hooks in sequence', async () => {
    const rpc = createRpcServer();
    const order: string[] = [];

    rpc.hooks.registerHook('afterCreate', () => {
      order.push('1');
    });
    rpc.hooks.registerHook('afterCreate', () => {
      order.push('2');
    });
    rpc.hooks.registerHook('afterCreate', () => {
      order.push('3');
    });

    await rpc.hooks.runHook('afterCreate', { type: 'api', path: '/test' });
    expect(order).toEqual(['1', '2', '3']);
  });

  it('supports async hooks', async () => {
    const rpc = createRpcServer();
    let asyncHookCalled = false;

    rpc.hooks.registerHook('beforeDelete', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncHookCalled = true;
    });

    await rpc.hooks.runHook('beforeDelete', { type: 'page', path: '/test' });
    expect(asyncHookCalled).toBe(true);
  });
});

describe('DevTools CRUD RPC Methods (P6-12)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-devtools-crud-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('registers crud:create handler', async () => {
    const rpc = createRpcServer({ cwd: tmpDir });
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:create',
      params: { type: 'page', path: 'test-crud-page' }
    });
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect((response.result as any).success).toBe(true);
  });

  it('registers crud:read handler', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '2',
      method: 'crud:read',
      params: { type: 'env' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(true);
  });

  it('registers crud:update handler', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '3',
      method: 'crud:update',
      params: { type: 'env', key: 'TEST_KEY', value: 'test-value' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(true);
  });

  it('registers crud:delete handler for env', async () => {
    const rpc = createRpcServer();
    await rpc.handleRequest({
      id: 'setup',
      method: 'crud:update',
      params: { type: 'env', key: 'TO_DELETE', value: 'yes' }
    });
    const response = await rpc.handleRequest({
      id: '4',
      method: 'crud:delete',
      params: { type: 'env', key: 'TO_DELETE' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(true);
  });

  it('crud server is accessible on rpc instance', () => {
    const rpc = createRpcServer();
    expect(rpc.crud).toBeDefined();
    expect(typeof rpc.crud.create).toBe('function');
    expect(typeof rpc.crud.read).toBe('function');
    expect(typeof rpc.crud.update).toBe('function');
    expect(typeof rpc.crud.delete).toBe('function');
    expect(typeof rpc.crud.restore).toBe('function');
  });

  it('masks sensitive env vars in getEnv', async () => {
    const rpc = createRpcServer();
    rpc.setEnv({
      PUBLIC_VAR: 'public',
      SECRET_KEY: 'supersecret',
      AUTH_TOKEN: 'token123',
      DB_PASSWORD: 'pass456',
      NORMAL_VAR: 'normal'
    });
    const response = await rpc.handleRequest({
      id: '5',
      method: 'getEnv'
    });
    const env = response.result as Record<string, string>;
    expect(env.PUBLIC_VAR).toBe('public');
    expect(env.NORMAL_VAR).toBe('normal');
    expect(env.SECRET_KEY).toBe('***');
    expect(env.AUTH_TOKEN).toBe('***');
    expect(env.DB_PASSWORD).toBe('***');
  });
});

describe('DevTools Hooks - Advanced (P8-02)', () => {
  it('removeHook removes a registered hook', async () => {
    const rpc = createRpcServer();
    let called = false;
    const handler = () => {
      called = true;
    };
    rpc.hooks.registerHook('beforeCreate', handler);
    rpc.hooks.removeHook('beforeCreate', handler);
    await rpc.hooks.runHook('beforeCreate', { type: 'page', path: '/test' });
    expect(called).toBe(false);
  });

  it('removeAllHooks clears all hooks for all types', async () => {
    const rpc = createRpcServer();
    let createCalled = false;
    let updateCalled = false;
    rpc.hooks.registerHook('beforeCreate', () => {
      createCalled = true;
    });
    rpc.hooks.registerHook('beforeUpdate', () => {
      updateCalled = true;
    });
    rpc.hooks.removeAllHooks();
    await rpc.hooks.runHook('beforeCreate', { type: 'page', path: '/t' });
    await rpc.hooks.runHook('beforeUpdate', { type: 'env', key: 'X' });
    expect(createCalled).toBe(false);
    expect(updateCalled).toBe(false);
  });

  it('hook errors are caught and propagated', async () => {
    const rpc = createRpcServer();
    rpc.hooks.registerHook('afterCreate', () => {
      throw new Error('hook error');
    });
    await expect(rpc.hooks.runHook('afterCreate', { type: 'page', path: '/t' })).rejects.toThrow('hook error');
  });
});

describe('DevTools CRUD Error Handling (P8-02)', () => {
  it('crud:create returns error for unsupported type', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:create',
      params: { type: 'invalid' as any, path: 'test' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('Unsupported resource type');
  });

  it('crud:create returns error for cron with missing path', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:create',
      params: { type: 'cron' as any }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors).toBeDefined();
  });

  it('crud:read returns error for unsupported type', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:read',
      params: { type: 'invalid' as any, path: '/some/path' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).error).toContain('Unsupported resource type');
  });

  it('crud:read returns error when path is missing for file types', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:read',
      params: { type: 'page' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).error).toContain('Path is required');
  });

  it('crud:read returns error when file not found', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:read',
      params: { type: 'page', path: '/nonexistent/file.vue' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).error).toBeDefined();
  });

  it('crud:update returns error for config type (read-only)', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:update',
      params: { type: 'config' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('not supported');
  });

  it('crud:update returns error for env update without key', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:update',
      params: { type: 'env', value: 'val' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('Key is required');
  });

  it('crud:delete returns error for env delete without key', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:delete',
      params: { type: 'env' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('Key is required');
  });

  it('crud:delete returns error for file type without path', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:delete',
      params: { type: 'page' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('Path is required');
  });

  it('crud:update env adds and deletes keys', async () => {
    const rpc = createRpcServer();
    rpc.setEnv({ EXISTING_VAR: 'val' });

    await rpc.handleRequest({
      id: '1',
      method: 'crud:update',
      params: { type: 'env', key: 'NEW_VAR', value: 'new-val' }
    });
    let info = rpc.getInfo();
    expect(info.env.NEW_VAR).toBe('new-val');
    expect(info.env.EXISTING_VAR).toBe('val');

    await rpc.handleRequest({
      id: '2',
      method: 'crud:update',
      params: { type: 'env', key: 'EXISTING_VAR' }
    });
    info = rpc.getInfo();
    expect(info.env.EXISTING_VAR).toBeUndefined();
  });

  it('crud:delete env removes key', async () => {
    const rpc = createRpcServer();
    rpc.setEnv({ VAR_A: '1', VAR_B: '2' });

    await rpc.handleRequest({
      id: '1',
      method: 'crud:delete',
      params: { type: 'env', key: 'VAR_A' }
    });
    const info = rpc.getInfo();
    expect(info.env.VAR_A).toBeUndefined();
    expect(info.env.VAR_B).toBe('2');
  });

  it('crud:restore returns error when no backup exists', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:restore',
      params: { path: '/nonexistent/path' }
    });
    expect(response.error).toBeUndefined();
    expect((response.result as any).success).toBe(false);
    expect((response.result as any).errors[0]).toContain('No backup found');
  });
});

describe('DevTools Permission Boundaries (P8-02)', () => {
  it('masks all sensitive env patterns', async () => {
    const rpc = createRpcServer();
    rpc.setEnv({
      API_KEY: 'secret1',
      CLIENT_SECRET: 'secret2',
      AUTH_TOKEN: 'secret3',
      DB_PASSWORD: 'secret4',
      MY_CREDENTIAL: 'secret5',
      PUBLIC_INFO: 'visible',
      NORMAL: 'visible'
    });
    const response = await rpc.handleRequest({ id: '1', method: 'getEnv' });
    const env = response.result as Record<string, string>;
    expect(env.API_KEY).toBe('***');
    expect(env.CLIENT_SECRET).toBe('***');
    expect(env.AUTH_TOKEN).toBe('***');
    expect(env.DB_PASSWORD).toBe('***');
    expect(env.MY_CREDENTIAL).toBe('***');
    expect(env.PUBLIC_INFO).toBe('visible');
    expect(env.NORMAL).toBe('visible');
  });

  it('config type is read-only at runtime', async () => {
    const rpc = createRpcServer();
    const response = await rpc.handleRequest({
      id: '1',
      method: 'crud:update',
      params: { type: 'config', key: 'test', value: 'x' }
    });
    expect((response.result as any).success).toBe(false);
  });

  it('getEnv does not expose real secret values even if they exist internally', async () => {
    const rpc = createRpcServer();
    rpc.setEnv({ SECRET_KEY: 'super-secret-value-12345' });
    const response = await rpc.handleRequest({ id: '1', method: 'getEnv' });
    const env = response.result as Record<string, string>;
    expect(env.SECRET_KEY).not.toContain('super-secret');
    expect(env.SECRET_KEY).toBe('***');
  });
});

describe('DevTools RPC - setCrons/setPresets (P8-02)', () => {
  it('setCrons populates cronsList and crons count', () => {
    const rpc = createRpcServer();
    rpc.setCrons([{ name: 'cleanup', schedule: '0 0 * * *', filePath: '/crons/cleanup.ts' }]);
    const info = rpc.getInfo();
    expect(info.crons).toBe(1);
    expect(info.cronsList).toHaveLength(1);
    expect(info.cronsList![0].name).toBe('cleanup');
  });

  it('setPresets populates presets list', () => {
    const rpc = createRpcServer();
    rpc.setPresets(['standard', 'node']);
    const info = rpc.getInfo();
    expect(info.presets).toEqual(['standard', 'node']);
  });

  it('handles getCrons method', async () => {
    const rpc = createRpcServer();
    rpc.setCrons([{ name: 'daily', schedule: '* * * * *', filePath: '/x.ts' }]);
    const response = await rpc.handleRequest({ id: '1', method: 'getCrons' });
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result as any[]).toHaveLength(1);
  });

  it('handles getPresets method', async () => {
    const rpc = createRpcServer();
    rpc.setPresets(['cloudflare']);
    const response = await rpc.handleRequest({ id: '1', method: 'getPresets' });
    expect(Array.isArray(response.result)).toBe(true);
    expect((response.result as any[])[0]).toBe('cloudflare');
  });
});

describe('DevTools Batch Error Handling (P8-02)', () => {
  it('handles batch with mixed valid/invalid requests', async () => {
    const rpc = createRpcServer();
    const responses = await rpc.handleBatch([
      { id: '1', method: 'ping' },
      { id: '2', method: 'nonexistent' },
      { id: '3', method: 'getInfo' }
    ]);
    expect(responses).toHaveLength(3);
    expect(responses[0].error).toBeUndefined();
    expect((responses[0].result as any).pong).toBe(true);
    expect(responses[1].error).toBeDefined();
    expect(responses[1].error).toContain('Method not found');
    expect(responses[2].error).toBeUndefined();
  });

  it('handles empty batch', async () => {
    const rpc = createRpcServer();
    const responses = await rpc.handleBatch([]);
    expect(responses).toHaveLength(0);
  });
});

describe('DevTools Custom Tabs', () => {
  beforeEach(() => {
    clearCustomTabs();
  });

  it('defines a custom tab', () => {
    const tab = defineDevToolsTab({
      id: 'my-tab',
      label: 'My Tab',
      icon: 'lucide:star',
      src: '/__custom_tab__/my-tab'
    });
    expect(tab.id).toBe('my-tab');
    expect(tab.label).toBe('My Tab');
    expect(tab.icon).toBe('lucide:star');
    expect(tab.src).toBe('/__custom_tab__/my-tab');

    const tabs = getCustomTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('my-tab');
  });

  it('overwrites tab with same id', () => {
    defineDevToolsTab({ id: 'test', label: 'First', src: '/a' });
    defineDevToolsTab({ id: 'test', label: 'Second', src: '/b' });

    const tabs = getCustomTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].label).toBe('Second');
    expect(tabs[0].src).toBe('/b');
  });

  it('returns a copy of custom tabs', () => {
    defineDevToolsTab({ id: 't1', label: 'T1', src: '/t1' });
    const tabs = getCustomTabs();
    tabs.push({ id: 'fake', label: 'Fake', src: '/fake' });
    expect(getCustomTabs()).toHaveLength(1);
  });

  it('clears custom tabs', () => {
    defineDevToolsTab({ id: 't1', label: 'T1', src: '/t1' });
    defineDevToolsTab({ id: 't2', label: 'T2', src: '/t2' });
    expect(getCustomTabs()).toHaveLength(2);
    clearCustomTabs();
    expect(getCustomTabs()).toHaveLength(0);
  });

  it('supports optional icon and sandbox', () => {
    const tab = defineDevToolsTab({
      id: 'minimal',
      label: 'Minimal',
      src: '/minimal',
      sandbox: ['allow-scripts']
    });
    expect(tab.icon).toBeUndefined();
    expect(tab.sandbox).toEqual(['allow-scripts']);
  });

  it('RPC server supports setCustomTabs', () => {
    const rpc = createRpcServer();
    rpc.setCustomTabs([{ id: 'plugin-1', label: 'Plugin 1', src: '/p1', icon: 'lucide:puzzle' }]);
    const info = rpc.getInfo();
    expect(info.customTabs).toHaveLength(1);
    expect(info.customTabs![0].id).toBe('plugin-1');
    expect(info.customTabs![0].icon).toBe('lucide:puzzle');
  });

  it('app registers custom tabs via defineDevToolsTab', async () => {
    defineDevToolsTab({
      id: 'test-plugin',
      label: 'Test Plugin',
      icon: 'lucide:flask-conical',
      src: '/_test_plugin'
    });

    const app = createUbeanApp({ devtools: true });
    await app.init();

    expect(app.devtools).toBeDefined();
    const info = app.devtools!.rpc.getInfo();
    expect(info.customTabs).toBeDefined();
    expect(info.customTabs!.some(t => t.id === 'test-plugin')).toBe(true);

    clearCustomTabs();
  });

  it('app registers custom tabs via devtools option', async () => {
    const app = createUbeanApp({
      devtools: {
        customTabs: [{ id: 'option-tab', label: 'Option Tab', src: '/option' }]
      }
    });
    await app.init();

    const info = app.devtools!.rpc.getInfo();
    expect(info.customTabs).toBeDefined();
    expect(info.customTabs!.some(t => t.id === 'option-tab')).toBe(true);
  });

  it('merges defined tabs with option tabs, option tabs deduplicated by id', async () => {
    defineDevToolsTab({ id: 'defined', label: 'Defined', src: '/defined' });

    const app = createUbeanApp({
      devtools: {
        customTabs: [
          { id: 'defined', label: 'Overridden', src: '/overridden' },
          { id: 'option-only', label: 'Option Only', src: '/opt' }
        ]
      }
    });
    await app.init();

    const info = app.devtools!.rpc.getInfo();
    expect(info.customTabs).toHaveLength(2);
    const definedTab = info.customTabs!.find(t => t.id === 'defined');
    expect(definedTab!.label).toBe('Defined');

    clearCustomTabs();
  });
});

describe('DevTools RPC - setLayouts/setConfig/getLayouts', () => {
  it('setLayouts populates layoutsList and layouts count', () => {
    const rpc = createRpcServer();
    rpc.setLayouts([
      { name: 'default', path: '/', filePath: '/layouts/default.vue', isDefault: true },
      { name: 'admin', path: '/admin', filePath: '/layouts/admin.vue', isDefault: false }
    ]);
    const info = rpc.getInfo();
    expect(info.layouts).toBe(2);
    expect(info.layoutsList).toHaveLength(2);
    expect(info.layoutsList![0].name).toBe('default');
    expect(info.layoutsList![0].isDefault).toBe(true);
    expect(info.layoutsList![1].name).toBe('admin');
  });

  it('setConfig populates config object', () => {
    const rpc = createRpcServer();
    rpc.setConfig({ preset: 'standard', rootDir: '/project', srcDir: '/project/src' });
    const info = rpc.getInfo();
    expect(info.config).toEqual({ preset: 'standard', rootDir: '/project', srcDir: '/project/src' });
  });

  it('handles getLayouts RPC method', async () => {
    const rpc = createRpcServer();
    rpc.setLayouts([{ name: 'default', path: '/', isDefault: true }]);
    const response = await rpc.handleRequest({ id: '1', method: 'getLayouts' });
    expect(response.error).toBeUndefined();
    const layouts = response.result as any[];
    expect(layouts).toHaveLength(1);
    expect(layouts[0].name).toBe('default');
  });

  it('setOpenAPI populates openAPI info', () => {
    const rpc = createRpcServer();
    rpc.setOpenAPI({ enabled: true, scalarPath: '/_scalar', openAPIPath: '/_openapi.json' });
    const info = rpc.getInfo();
    expect(info.openAPI).toBeDefined();
    expect(info.openAPI!.enabled).toBe(true);
    expect(info.openAPI!.scalarPath).toBe('/_scalar');
  });

  it('setDatabase populates database info', () => {
    const rpc = createRpcServer();
    rpc.setDatabase({ drizzleStudioAvailable: true, studioUrl: '/__drizzle' });
    const info = rpc.getInfo();
    expect(info.database).toBeDefined();
    expect(info.database!.drizzleStudioAvailable).toBe(true);
    expect(info.database!.studioUrl).toBe('/__drizzle');
  });

  it('default info has layouts/crons/customTabs initialized', () => {
    const rpc = createRpcServer();
    const info = rpc.getInfo();
    expect(info.layouts).toBe(0);
    expect(info.crons).toBe(0);
    expect(info.customTabs).toEqual([]);
    expect(info.layoutsList).toEqual([]);
    expect(info.cronsList).toEqual([]);
    expect(info.config).toEqual({});
    expect(info.presets).toEqual([]);
  });
});

describe('DevTools Middleware HTTP Integration', () => {
  it('injects devtools script into HTML responses', async () => {
    const app = createUbeanApp({ devtools: true });
    await app.init();

    app.hono.get('/', c => c.html('<html><head></head><body>Hello</body></html>'));

    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain(DEVTOOLS_MAGIC_KEY);
    expect(text).toContain('__ubean_devtools');
  });

  it('serves RPC endpoint and returns info', async () => {
    const app = createUbeanApp({ devtools: true });
    await app.init();

    const res = await app.fetch(
      new Request(`http://localhost${DEVTOOLS_RPC_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', method: 'getInfo' })
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBeUndefined();
    expect(data.result.version).toBe('0.0.1');
  });

  it('does not inject script into non-HTML responses', async () => {
    const app = createUbeanApp({ devtools: true });
    await app.init();

    app.hono.get('/api/data', c => c.json({ hello: 'world' }));

    const res = await app.fetch(new Request('http://localhost/api/data'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(DEVTOOLS_MAGIC_KEY);
    expect(text).toContain('hello');
  });

  it('does not inject script when devtools is disabled', async () => {
    const app = createUbeanApp({ devtools: false });
    await app.init();

    app.hono.get('/', c => c.html('<html><body>No devtools</body></html>'));

    const res = await app.fetch(new Request('http://localhost/'));
    const text = await res.text();
    expect(text).not.toContain(DEVTOOLS_MAGIC_KEY);
  });
});
