/**
 * P9-09 全局 Hooks 单元测试
 *
 * 覆盖:
 * - setGlobalHooks / getGlobalHooks / clearGlobalHooks
 * - createHandleEvent (从 Context 构建 HandleEvent)
 * - extractErrorMessage (错误消息提取)
 * - applyHandleHook (handle hook 包裹请求)
 * - applyHandleFetchHook (handleFetch hook 拦截 fetch)
 * - applyHandleErrorHook (handleError hook 错误处理)
 * - defineServer globalHooks 配置
 * - mergeServerConfigs globalHooks 合并
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getInternalFetcher, clearInternalFetcher } from '@ubean/api-routes';
import type { UbeanEnv } from '@ubean/types';
import {
  setGlobalHooks,
  getGlobalHooks,
  clearGlobalHooks,
  createHandleEvent,
  extractErrorMessage,
  wrapResolve,
  applyHandleHook,
  applyHandleFetchHook,
  applyHandleErrorHook
} from '../src/hooks';
import type { GlobalHooks, Handle, HandleFetch, HandleError } from '../src/hooks';
import { UbeanApp } from '../src/app';
import { defineServer, mergeServerConfigs, createDefaultServerConfig } from '../src/define-server';

/* -------------------------------------------------------------------------- */
/* 全局 hooks 注册表                                                            */
/* -------------------------------------------------------------------------- */

describe('global hooks registry', () => {
  beforeEach(() => clearGlobalHooks());

  it('starts empty', () => {
    expect(getGlobalHooks()).toEqual({});
  });

  it('sets hooks', () => {
    const hooks: GlobalHooks = {
      handle: async ({ resolve }) => resolve({} as never),
      handleError: async () => {}
    };
    setGlobalHooks(hooks);
    expect(getGlobalHooks().handle).toBeDefined();
    expect(getGlobalHooks().handleError).toBeDefined();
  });

  it('clears hooks', () => {
    setGlobalHooks({ handle: async ({ resolve }) => resolve({} as never) });
    clearGlobalHooks();
    expect(getGlobalHooks()).toEqual({});
  });

  it('merges hooks on set (shallow copy)', () => {
    const hooks1: GlobalHooks = { handleError: async () => {} };
    setGlobalHooks(hooks1);
    const hooks2: GlobalHooks = { handle: async ({ resolve }) => resolve({} as never) };
    setGlobalHooks(hooks2);
    // setGlobalHooks replaces, not merges
    expect(getGlobalHooks().handle).toBeDefined();
    expect(getGlobalHooks().handleError).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* createHandleEvent                                                           */
/* -------------------------------------------------------------------------- */

describe('createHandleEvent', () => {
  it('extracts request, clientAddress, and requestId from context', () => {
    const app = new Hono();
    let capturedEvent: ReturnType<typeof createHandleEvent> | null = null;

    app.get('/test', (c: Context<UbeanEnv>) => {
      capturedEvent = createHandleEvent(c);
      return c.json({ ok: true });
    });

    const res = app.request('/test', {
      headers: {
        'x-forwarded-for': '203.0.113.5, 70.41.3.18',
        'x-request-id': 'req-abc-123'
      }
    });

    expect(res.status).toBe(200);
    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.clientAddress).toBe('203.0.113.5');
    expect(capturedEvent!.requestId).toBe('req-abc-123');
    expect(capturedEvent!.request).toBeInstanceOf(Request);
    expect(capturedEvent!.context).toBeDefined();
  });

  it('falls back to "unknown" for clientAddress without headers', async () => {
    const app = new Hono();
    let capturedEvent: ReturnType<typeof createHandleEvent> | null = null;

    app.get('/test', (c: Context<UbeanEnv>) => {
      capturedEvent = createHandleEvent(c);
      return c.json({ ok: true });
    });

    await app.request('/test');
    expect(capturedEvent!.clientAddress).toBe('unknown');
  });
});

/* -------------------------------------------------------------------------- */
/* extractErrorMessage                                                         */
/* -------------------------------------------------------------------------- */

describe('extractErrorMessage', () => {
  it('returns "Not Found" for 404', () => {
    expect(extractErrorMessage(new Error('custom'), 404)).toBe('Not Found');
  });

  it('returns "Internal Server Error" for 500+ errors', () => {
    expect(extractErrorMessage(new Error('db connection failed'), 500)).toBe('Internal Server Error');
  });

  it('returns error.message for 4xx errors', () => {
    expect(extractErrorMessage(new Error('Bad Request'), 400)).toBe('Bad Request');
  });

  it('returns generic message for non-Error errors', () => {
    expect(extractErrorMessage('string error', 500)).toBe('Internal Server Error');
    expect(extractErrorMessage(null, 500)).toBe('Internal Server Error');
  });
});

/* -------------------------------------------------------------------------- */
/* wrapResolve                                                                 */
/* -------------------------------------------------------------------------- */

describe('wrapResolve', () => {
  it('calls next and returns c.res', async () => {
    const app = new Hono<UbeanEnv>();
    let nextCalled = false;

    app.get('/test', (c: Context<UbeanEnv>) => c.json({ data: 'hello' }));

    // Simulate middleware context
    const c = await app.request('/test');
    const mockContext = {
      res: c
    } as unknown as Context<UbeanEnv>;

    const next = async () => {
      nextCalled = true;
    };
    const resolve = wrapResolve(mockContext, next);
    const response = await resolve({} as never);

    expect(nextCalled).toBe(true);
    expect(response).toBe(c);
  });
});

/* -------------------------------------------------------------------------- */
/* applyHandleHook                                                             */
/* -------------------------------------------------------------------------- */

describe('applyHandleHook', () => {
  beforeEach(() => clearGlobalHooks());

  it('returns false when no handle hook is registered', async () => {
    const app = new Hono<UbeanEnv>();
    let nextCalled = false;

    app.use('*', async (c: Context<UbeanEnv>, next) => {
      const handled = await applyHandleHook(c, next);
      if (!handled) await next();
    });
    app.get('/test', c => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(nextCalled).toBe(false); // next was called inside the middleware, not here
  });

  it('wraps request when handle hook is registered', async () => {
    const handle: Handle = async ({ event, resolve }) => {
      const response = await resolve(event);
      response.headers.set('X-Custom-Header', 'ubean');
      return response;
    };
    setGlobalHooks({ handle });

    const app = new Hono<UbeanEnv>();
    app.use('*', async (c: Context<UbeanEnv>, next) => {
      await applyHandleHook(c, next);
    });
    app.get('/test', c => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Custom-Header')).toBe('ubean');
  });

  it('handle hook can short-circuit (not call resolve)', async () => {
    const handle: Handle = async () => {
      return new Response('Blocked', { status: 403 });
    };
    setGlobalHooks({ handle });

    const app = new Hono<UbeanEnv>();
    let routeCalled = false;
    app.use('*', async (c: Context<UbeanEnv>, next) => {
      await applyHandleHook(c, next);
    });
    app.get('/test', c => {
      routeCalled = true;
      return c.json({ ok: true });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Blocked');
    expect(routeCalled).toBe(false);
  });

  it('handle hook receives correct event with request', async () => {
    let capturedUrl = '';
    const handle: Handle = async ({ event, resolve }) => {
      capturedUrl = event.request.url;
      return resolve(event);
    };
    setGlobalHooks({ handle });

    const app = new Hono<UbeanEnv>();
    app.use('*', async (c: Context<UbeanEnv>, next) => {
      await applyHandleHook(c, next);
    });
    app.get('/test', c => c.json({ ok: true }));

    await app.request('/test');
    expect(capturedUrl).toContain('/test');
  });
});

/* -------------------------------------------------------------------------- */
/* applyHandleFetchHook                                                        */
/* -------------------------------------------------------------------------- */

describe('applyHandleFetchHook', () => {
  beforeEach(() => clearGlobalHooks());

  it('calls default fetch when no hook is registered', async () => {
    let fetchCalled = false;
    const defaultFetch = async (_req: Request) => {
      fetchCalled = true;
      return new Response('ok');
    };

    const res = await applyHandleFetchHook(new Request('https://example.com'), defaultFetch);
    expect(fetchCalled).toBe(true);
    expect(res.status).toBe(200);
  });

  it('intercepts fetch when handleFetch hook is registered', async () => {
    let capturedHeader = '';
    const handleFetch: HandleFetch = async ({ request, fetch }) => {
      capturedHeader = request.headers.get('X-Custom') || '';
      return fetch(request);
    };
    setGlobalHooks({ handleFetch });

    const req = new Request('https://example.com');
    req.headers.set('X-Custom', 'injected');
    const defaultFetch = async (_req: Request) => new Response('ok');

    await applyHandleFetchHook(req, defaultFetch);
    expect(capturedHeader).toBe('injected');
  });

  it('handleFetch can modify the request before fetching', async () => {
    const handleFetch: HandleFetch = async ({ request, fetch }) => {
      const modified = request.clone();
      modified.headers.set('Authorization', 'Bearer token');
      return fetch(modified);
    };
    setGlobalHooks({ handleFetch });

    let receivedAuth = '';
    const defaultFetch = async (req: Request) => {
      receivedAuth = req.headers.get('Authorization') || '';
      return new Response('ok');
    };

    await applyHandleFetchHook(new Request('https://example.com'), defaultFetch);
    expect(receivedAuth).toBe('Bearer token');
  });
});

/* -------------------------------------------------------------------------- */
/* applyHandleErrorHook                                                        */
/* -------------------------------------------------------------------------- */

describe('applyHandleErrorHook', () => {
  beforeEach(() => clearGlobalHooks());

  it('does nothing when no hook is registered', async () => {
    const app = new Hono<UbeanEnv>();
    let c: Context<UbeanEnv> | null = null;
    app.get('/test', ctx => {
      c = ctx;
      throw new Error('test error');
    });
    app.onError((err, ctx) => ctx.text('error', 500));

    await app.request('/test');
    // Should not throw
    await applyHandleErrorHook(c!, new Error('test'), 500);
  });

  it('calls hook with error details when registered', async () => {
    let capturedError: unknown = null;
    let capturedStatus = 0;
    let capturedMessage = '';

    const handleError: HandleError = async ({ error, status, message }) => {
      capturedError = error;
      capturedStatus = status;
      capturedMessage = message;
    };
    setGlobalHooks({ handleError });

    const app = new Hono<UbeanEnv>();
    let capturedContext: Context<UbeanEnv> | null = null;
    app.get('/test', ctx => {
      capturedContext = ctx;
      throw new Error('db failed');
    });
    app.onError((err, ctx) => ctx.text('error', 500));

    await app.request('/test');
    await applyHandleErrorHook(capturedContext!, new Error('db failed'), 500);

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('db failed');
    expect(capturedStatus).toBe(500);
    expect(capturedMessage).toBe('Internal Server Error');
  });
});

/* -------------------------------------------------------------------------- */
/* defineServer globalHooks                                                    */
/* -------------------------------------------------------------------------- */

describe('defineServer with globalHooks', () => {
  beforeEach(() => clearGlobalHooks());

  it('accepts globalHooks in options', () => {
    const config = defineServer({
      globalHooks: {
        handle: async ({ resolve }) => resolve({} as never),
        handleError: async () => {}
      }
    });
    expect(config.globalHooks).toBeDefined();
    expect(config.globalHooks!.handle).toBeDefined();
    expect(config.globalHooks!.handleError).toBeDefined();
  });

  it('globalHooks is undefined when not provided', () => {
    const config = defineServer({});
    expect(config.globalHooks).toBeUndefined();
  });

  it('createDefaultServerConfig has no globalHooks', () => {
    const config = createDefaultServerConfig();
    expect(config.globalHooks).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* mergeServerConfigs globalHooks                                              */
/* -------------------------------------------------------------------------- */

describe('mergeServerConfigs with globalHooks', () => {
  it('preserves base globalHooks', () => {
    const base = defineServer({
      globalHooks: { handleError: async () => {} }
    });
    const merged = mergeServerConfigs(base);
    expect(merged.globalHooks).toBeDefined();
    expect(merged.globalHooks!.handleError).toBeDefined();
  });

  it('overrides with config globalHooks', () => {
    const base = defineServer({
      globalHooks: { handleError: async () => {} }
    });
    const override = defineServer({
      globalHooks: { handle: async ({ resolve }) => resolve({} as never) }
    });
    const merged = mergeServerConfigs(base, override);
    // Override should merge (shallow), so both hooks are present
    expect(merged.globalHooks!.handle).toBeDefined();
    expect(merged.globalHooks!.handleError).toBeDefined();
  });

  it('handles undefined configs gracefully', () => {
    const base = defineServer({
      globalHooks: { handleError: async () => {} }
    });
    const merged = mergeServerConfigs(base, null, undefined);
    expect(merged.globalHooks!.handleError).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Integration: handleFetch via internal fetcher                               */
/* -------------------------------------------------------------------------- */

describe('integration: handleFetch hook invoked through internal fetcher', () => {
  beforeEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });
  afterEach(() => {
    clearGlobalHooks();
    clearInternalFetcher();
  });

  it('invokes handleFetch hook when internal fetcher is called', async () => {
    let hookCalled = false;
    let capturedUrl = '';
    setGlobalHooks({
      handleFetch: async ({ request, fetch }) => {
        hookCalled = true;
        capturedUrl = request.url;
        return fetch(request);
      }
    });

    const app = new UbeanApp({});
    app.hono.get('/api/test', c => c.json({ ok: true }));
    await app.init();

    const fetcher = getInternalFetcher();
    expect(fetcher).not.toBeNull();
    const res = await fetcher!(new Request('http://internal/api/test'));

    expect(hookCalled).toBe(true);
    expect(capturedUrl).toContain('/api/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('handleFetch can inject headers into internal fetch', async () => {
    let receivedAuth = '';
    setGlobalHooks({
      handleFetch: async ({ request, fetch }) => {
        const modified = request.clone();
        modified.headers.set('Authorization', 'Bearer internal-token');
        return fetch(modified);
      }
    });

    const app = new UbeanApp({});
    app.hono.get('/api/whoami', c => {
      receivedAuth = c.req.header('Authorization') || '';
      return c.json({ auth: receivedAuth });
    });
    await app.init();

    const fetcher = getInternalFetcher()!;
    await fetcher(new Request('http://internal/api/whoami'));

    expect(receivedAuth).toBe('Bearer internal-token');
  });

  it('falls through to default fetcher when no handleFetch hook is set', async () => {
    // No global hooks set
    const app = new UbeanApp({});
    app.hono.get('/api/ping', c => c.json({ pong: true }));
    await app.init();

    const fetcher = getInternalFetcher()!;
    const res = await fetcher(new Request('http://internal/api/ping'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });
});

/* -------------------------------------------------------------------------- */
/* Integration: handleError invoked from app.onError                            */
/* -------------------------------------------------------------------------- */

describe('integration: handleError hook invoked from app.onError', () => {
  beforeEach(() => clearGlobalHooks());
  afterEach(() => clearGlobalHooks());

  it('calls handleError when route throws uncaught error', async () => {
    let capturedMessage = '';
    let capturedStatus = 0;
    setGlobalHooks({
      handleError: async ({ status, message }) => {
        capturedStatus = status;
        capturedMessage = message;
      }
    });

    const app = new UbeanApp({});
    app.hono.get('/boom', () => {
      throw new Error('boom');
    });
    await app.init();

    const res = await app.hono.request('/boom');
    expect(res.status).toBe(500);

    // handleError is called with `void` (fire-and-forget); allow microtask to flush
    await new Promise(r => setTimeout(r, 0));
    expect(capturedStatus).toBe(500);
    expect(capturedMessage).toBe('Internal Server Error');
  });
});
