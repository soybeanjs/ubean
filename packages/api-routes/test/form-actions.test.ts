/**
 * P9-02 Server Actions — form-action helpers integration tests
 *
 * Verifies the inline form-action dispatch helpers used by
 * `handlePageRequest` (in `router.ts`) for page modules exporting an
 * `actions` map (SvelteKit-style `?/<name>` convention).
 *
 * Covers:
 *  - `parseFormActionName`: URL → action name resolution
 *  - `handleActionResponse`: redirect/non-redirect handling for pages vs API
 *  - `runServerAction`: input parsing (JSON/FormData), schema validation,
 *    handler invocation, `fail()` / `ActionError` / `Response` outcomes
 *  - End-to-end dispatch through a real Hono app mimicking `handlePageRequest`'s
 *    `mod.actions` branch (named form actions)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  parseFormActionName,
  handleActionResponse,
  runServerAction
} from '../src/form-actions';
import { defineAction, fail, clearActions } from '@ubean/actions';
import type { ServerAction, UbeanEnv } from '@ubean/types';
import type { Context } from 'hono';

/* -------------------------------------------------------------------------- */
/* parseFormActionName                                                        */
/* -------------------------------------------------------------------------- */

describe('parseFormActionName', () => {
  it('extracts named action from ?/name', () => {
    expect(parseFormActionName('http://localhost/login?/login')).toBe('login');
    expect(parseFormActionName('/login?/register')).toBe('register');
  });

  it('extracts action from combined query string', () => {
    expect(parseFormActionName('http://x/page?foo=bar&/submit')).toBe('submit');
    expect(parseFormActionName('http://x/page?/submit&foo=bar')).toBe('submit');
  });

  it('returns "default" when no ?/name is present', () => {
    expect(parseFormActionName('http://localhost/login')).toBe('default');
    expect(parseFormActionName('http://localhost/login?')).toBe('default');
    expect(parseFormActionName('http://localhost/login?foo=bar')).toBe('default');
  });

  it('returns "default" for empty URL', () => {
    expect(parseFormActionName('')).toBe('default');
  });
});

/* -------------------------------------------------------------------------- */
/* handleActionResponse                                                       */
/* -------------------------------------------------------------------------- */

describe('handleActionResponse', () => {
  const isPagesRequest = () => true;
  const isNotPagesRequest = () => false;

  /**
   * Build a Hono app with a single POST route that invokes `handleActionResponse`
   * with the given response + pages-request predicate, returning the result.
   * This provides a real Hono context (needed for `c.json()`).
   */
  async function dispatch(
    response: Response,
    isPagesReq: (c: Context<UbeanEnv>) => boolean
  ): Promise<Response | null> {
    const app = new Hono<UbeanEnv>();
    let result: Response | null = null;
    app.post('/page', async (c) => {
      result = handleActionResponse(c, response, isPagesReq);
      return result ?? c.body(null);
    });
    await app.request('http://x/page', { method: 'POST' });
    return result;
  }

  it('converts 3xx redirect to JSON with X-Ubean-Redirect for pages requests', async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: '/success' }
    });
    const result = await dispatch(redirect, isPagesRequest);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(200);
    expect(result!.headers.get('X-Ubean-Redirect')).toBe('/success');
  });

  it('passes through 3xx redirect for non-pages requests', async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: '/success' }
    });
    const result = await dispatch(redirect, isNotPagesRequest);
    expect(result).toBe(redirect);
  });

  it('returns the response as-is for pages requests (non-redirect)', async () => {
    const ok = new Response('ok', { status: 200 });
    const result = await dispatch(ok, isPagesRequest);
    expect(result).toBe(ok);
  });

  it('returns null for non-pages non-redirect responses', async () => {
    const ok = new Response('ok', { status: 200 });
    const result = await dispatch(ok, isNotPagesRequest);
    expect(result).toBeNull();
  });

  it('returns the response for 3xx without Location header (pages request)', async () => {
    // 304 Not Modified — no Location header → falls through to isPagesReq branch
    const noLocation = new Response(null, { status: 304 });
    const result = await dispatch(noLocation, isPagesRequest);
    expect(result).toBe(noLocation);
  });
});

/* -------------------------------------------------------------------------- */
/* runServerAction                                                            */
/* -------------------------------------------------------------------------- */

describe('runServerAction', () => {
  function makeApp(): Hono<UbeanEnv> {
    return new Hono<UbeanEnv>();
  }

  it('parses JSON body and returns { data } on success', async () => {
    const action = defineAction(async (input: { x: number }) => input.x * 2, {
      name: 'double',
      filePath: 'src/actions/math.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 21 })
    });
    expect(result).toMatchObject({ data: 42 });
  });

  it('parses FormData body into plain object', async () => {
    const action = defineAction(async (input: { email: string }) => ({ user: input.email }), {
      name: 'login',
      filePath: 'src/actions/auth.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    const form = new FormData();
    form.append('email', 'alice@example.com');
    await app.request('http://x/test', { method: 'POST', body: form });
    expect(result).toMatchObject({ data: { user: 'alice@example.com' } });
  });

  it('parses urlencoded body', async () => {
    const action = defineAction(async (input: { name: string }) => ({ ok: true, name: input.name }), {
      name: 'submit',
      filePath: 'src/actions/f.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=bob'
    });
    expect(result).toMatchObject({ data: { ok: true, name: 'bob' } });
  });

  it('returns { errors } when handler calls fail()', async () => {
    const action = defineAction(async () => fail(400, { field: 'required' }), {
      name: 'failing',
      filePath: 'src/actions/f.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ errors: { field: 'required' } });
  });

  it('returns { errors } when handler throws a generic Error', async () => {
    const action = defineAction(async () => {
      throw new Error('boom');
    }, { name: 'thrower', filePath: 'src/actions/t.ts' });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ errors: { _error: 'boom' } });
  });

  it('returns { response } when handler returns a Response (redirect)', async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: '/done' }
    });
    const action = defineAction(async () => redirect, {
      name: 'redirector',
      filePath: 'src/actions/r.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ response: redirect });
  });

  it('returns { response } when handler throws a Response', async () => {
    const redirect = new Response(null, {
      status: 301,
      headers: { Location: '/moved' }
    });
    const action = defineAction(async () => {
      throw redirect;
    }, { name: 'throwRedirect', filePath: 'src/actions/r.ts' });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ response: redirect });
  });

  it('runs schema validation via safeParse and returns { errors } on failure', async () => {
    const schema = {
      safeParse: (input: unknown) => {
        const obj = input as { email?: string };
        if (!obj.email) {
          return {
            success: false,
            error: { issues: [{ message: 'email is required' }] }
          };
        }
        return { success: true, data: obj };
      }
    };
    const action = defineAction(
      schema as never,
      async (data: { email: string }) => ({ user: data.email }),
      { name: 'validated', filePath: 'src/actions/v.ts' }
    );
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(result).toMatchObject({ errors: { 'email is required': 'email is required' } });
  });

  it('passes validated data to handler on safeParse success', async () => {
    const schema = {
      safeParse: (input: unknown) => ({ success: true, data: { email: (input as { email: string }).email.toUpperCase() } })
    };
    const action = defineAction(
      schema as never,
      async (data: { email: string }) => ({ user: data.email }),
      { name: 'validated', filePath: 'src/actions/v.ts' }
    );
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com' })
    });
    expect(result).toMatchObject({ data: { user: 'ALICE@EXAMPLE.COM' } });
  });

  it('runs schema validation via parse and returns { errors } on throw', async () => {
    const schema = {
      parse: (input: unknown) => {
        const obj = input as { name?: string };
        if (!obj.name) throw new Error('name required');
        return obj;
      }
    };
    const action = defineAction(
      schema as never,
      async (data: { name: string }) => ({ user: data.name }),
      { name: 'parseValidate', filePath: 'src/actions/p.ts' }
    );
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(result).toMatchObject({ errors: { _error: 'name required' } });
  });

  it('returns { data: null } when handler returns null', async () => {
    const action = defineAction(async () => null, {
      name: 'nullish',
      filePath: 'src/actions/n.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ data: null });
  });

  it('ignores body parse errors and passes empty input to handler', async () => {
    const action = defineAction(async (input: Record<string, unknown>) => ({ received: input }), {
      name: 'echo',
      filePath: 'src/actions/e.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async (c) => {
      result = await runServerAction(action as ServerAction, c);
      return c.json({});
    });
    // Invalid JSON body
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json'
    });
    expect(result).toMatchObject({ data: { received: {} } });
  });
});

/* -------------------------------------------------------------------------- */
/* Integration: named form actions dispatch (mimics handlePageRequest)        */
/* -------------------------------------------------------------------------- */

describe('named form actions dispatch (handlePageRequest mod.actions branch)', () => {
  // Build an `actions` map mimicking a page module's `export const actions = { ... }`
  function buildPageActions(): Record<string, ServerAction> {
    const login = defineAction(async (input: { email: string; password: string }) => {
      if (input.password === 'wrong') {
        return fail(400, { password: 'incorrect' });
      }
      return { user: input.email, token: 'abc123' };
    }, { name: 'login', filePath: 'src/pages/login.vue' });

    const register = defineAction(async (input: { email: string }) => {
      return { registered: true, email: input.email };
    }, { name: 'register', filePath: 'src/pages/login.vue' });

    const redirectHome = defineAction(async () => {
      return new Response(null, { status: 302, headers: { Location: '/' } });
    }, { name: 'logout', filePath: 'src/pages/login.vue' });

    const defaultAction = defineAction(async () => {
      return { ok: true, from: 'default' };
    }, { name: 'default', filePath: 'src/pages/login.vue' });

    return {
      login: login as ServerAction,
      register: register as ServerAction,
      logout: redirectHome as ServerAction,
      default: defaultAction as ServerAction
    };
  }

  /**
   * Simulates the relevant slice of `handlePageRequest`'s POST branch:
   *  1. Parse action name from URL (`?/<name>`)
   *  2. Look up the action in `mod.actions`
   *  3. Run it via `runServerAction`
   *  4. Convert outcome into an HTTP response (redirect → JSON, data → JSON,
   *     errors → JSON)
   */
  function attachPageActionHandler(app: Hono<UbeanEnv>, actions: Record<string, ServerAction>) {
    app.post('/login', async (c) => {
      const actionName = parseFormActionName(c.req.url);
      const action = actions[actionName];
      if (!action) {
        return c.json({ error: `Unknown action: ${actionName}` }, 404);
      }
      const res = await runServerAction(action, c);
      if (res.response) {
        // Redirect handling for pages requests
        const handled = handleActionResponse(c, res.response, () => true);
        return handled ?? res.response;
      }
      if (res.errors) {
        return c.json({ errors: res.errors }, 400);
      }
      return c.json({ data: res.data });
    });
  }

  beforeEach(() => {
    // Clear the global action registry between tests to avoid ID collisions
    clearActions();
  });

  it('dispatches to default action when no ?/name is specified', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ data: { ok: true, from: 'default' } });
  });

  it('dispatches to named action via ?/login', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'secret' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      data: { user: 'alice@example.com', token: 'abc123' }
    });
  });

  it('dispatches to a different named action via ?/register', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.com' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      data: { registered: true, email: 'bob@example.com' }
    });
  });

  it('returns errors when action calls fail()', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'wrong' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ errors: { password: 'incorrect' } });
  });

  it('converts redirect Response into JSON with X-Ubean-Redirect for pages', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/logout', {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Ubean-Redirect')).toBe('/');
    const body = await res.json();
    expect(body).toMatchObject({ redirect: '/' });
  });

  it('returns 404 for unknown action name', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/nonexistent', {
      method: 'POST'
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: expect.stringContaining('Unknown action') });
  });

  it('dispatches FormData submissions (progressive enhancement)', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const form = new FormData();
    form.append('email', 'carol@example.com');
    form.append('password', 'secret');
    const res = await app.request('http://x/login?/login', {
      method: 'POST',
      body: form
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      data: { user: 'carol@example.com', token: 'abc123' }
    });
  });

  it('dispatches urlencoded form submissions', async () => {
    const actions = buildPageActions();
    const app = new Hono<UbeanEnv>();
    attachPageActionHandler(app, actions);

    const res = await app.request('http://x/login?/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=dave%40example.com'
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      data: { registered: true, email: 'dave@example.com' }
    });
  });
});
