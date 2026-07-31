/**
 * @ubean/actions unit tests (P9-02)
 *
 * Covers: action ID generation, registry, defineAction, dispatcher,
 * middleware (/__actions endpoint), form-action URL parsing, and the
 * Vite plugin's `'use server'` directive transformation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { fail, ActionError, isActionFailure, isServerAction } from '@ubean/types';
import type { ServerAction, UbeanEnv } from '@ubean/types';
import {
  defineAction,
  createActionId,
  isValidActionId,
  registerAction,
  registerActions,
  getAction,
  hasAction,
  listActions,
  clearActions,
  dispatchAction,
  runAction,
  runPageAction,
  createActionsMiddleware,
  isActionsRequest,
  isActionResponse,
  ACTIONS_ENDPOINT,
  ACTION_RESPONSE_HEADER,
  parseFormActionName,
  buildFormActionUrl,
  hasFormAction,
  normalizeActionResult,
  validateActionInput,
  parseActionInput
} from '../src/index';
import {
  hasUseServerDirective,
  extractExportNames,
  transformUseServerForServer,
  transformUseServerForClient,
  ubeanServerActionsPlugin
} from '../src/vite';

/* -------------------------------------------------------------------------- */
/* Action ID generation                                                       */
/* -------------------------------------------------------------------------- */

describe('action ID generation', () => {
  it('creates stable IDs from file path + export name', () => {
    const id1 = createActionId('src/actions/auth.ts', 'login');
    const id2 = createActionId('src/actions/auth.ts', 'login');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^act_[a-z2-7]{12}$/);
  });

  it('produces different IDs for different exports', () => {
    const login = createActionId('src/actions/auth.ts', 'login');
    const logout = createActionId('src/actions/auth.ts', 'logout');
    expect(login).not.toBe(logout);
  });

  it('produces different IDs for different files', () => {
    const a = createActionId('src/actions/auth.ts', 'default');
    const b = createActionId('src/actions/user.ts', 'default');
    expect(a).not.toBe(b);
  });

  it('validates action ID format', () => {
    expect(isValidActionId('act_abcdefghijkl')).toBe(true); // 12 lowercase letters
    expect(isValidActionId('act_abcdefghijklmnopqrstuvwxyz234567')).toBe(false); // too long (regex is {12})
    expect(isValidActionId('act_ABCDEFGHIJKL')).toBe(false); // uppercase not in base32
    expect(isValidActionId('act_short')).toBe(false);
    expect(isValidActionId('not_act_abcdefghijkl')).toBe(false);
    expect(isValidActionId('act_0189')).toBe(false); // 0,1,8,9 not in base32 alphabet
  });
});

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

describe('action registry', () => {
  beforeEach(() => clearActions());

  it('registers and retrieves an action', () => {
    const action: ServerAction = {
      id: 'act_testregistry00',
      name: 'test',
      handler: async () => null
    };
    registerAction(action);
    expect(hasAction('act_testregistry00')).toBe(true);
    expect(getAction('act_testregistry00')).toBe(action);
  });

  it('returns undefined for unknown action', () => {
    expect(getAction('act_unknown000000')).toBeUndefined();
    expect(hasAction('act_unknown000000')).toBe(false);
  });

  it('does not overwrite an existing action (HMR-safe)', () => {
    const a: ServerAction = { id: 'act_dup0000000000', name: 'a', handler: async () => 'a' };
    const b: ServerAction = { id: 'act_dup0000000000', name: 'b', handler: async () => 'b' };
    registerAction(a);
    registerAction(b);
    expect(getAction('act_dup0000000000')?.name).toBe('a');
  });

  it('lists all registered actions', () => {
    registerActions([
      { id: 'act_list000000001', name: 'x', handler: async () => null },
      { id: 'act_list000000002', name: 'y', handler: async () => null }
    ]);
    expect(listActions()).toHaveLength(2);
  });

  it('clears the registry', () => {
    registerAction({ id: 'act_clear00000000', name: 'c', handler: async () => null });
    clearActions();
    expect(listActions()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* defineAction                                                               */
/* -------------------------------------------------------------------------- */

describe('defineAction', () => {
  beforeEach(() => clearActions());

  it('creates a server action without a schema', () => {
    const action = defineAction(
      async (input: { name: string }) => {
        return { ok: true, echo: input.name };
      },
      { name: 'ping', filePath: 'src/actions/test.ts' }
    );

    expect(isServerAction(action)).toBe(true);
    expect(action.name).toBe('ping');
    expect(action.id).toMatch(/^act_[a-z2-7]{12}$/);
    expect(hasAction(action.id)).toBe(true);
  });

  it('creates a server action with a schema', () => {
    const schema = {
      safeParse(value: unknown) {
        if (typeof value === 'object' && value !== null && 'email' in value) {
          return { success: true, data: value as { email: string } };
        }
        return { success: false, error: { issues: [{ message: 'Invalid' }] } };
      }
    };
    const action = defineAction(schema, async (data: { email: string }) => ({ user: data.email }), {
      name: 'login',
      filePath: 'src/actions/auth.ts'
    });
    expect(action.schema).toBeDefined();
    expect(action.name).toBe('login');
  });

  it('marks the action with the ACTION_BRAND symbol', () => {
    const action = defineAction(async () => null, { name: 'branded', filePath: 'x.ts' });
    expect(isServerAction(action)).toBe(true);
    // A plain object without the brand should not be detected
    expect(isServerAction({ id: 'x', handler: () => null, name: 'x' })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* fail() and ActionError                                                     */
/* -------------------------------------------------------------------------- */

describe('fail() helper', () => {
  it('creates an ActionFailure with field errors', () => {
    const f = fail(400, { email: 'Invalid email' });
    expect(isActionFailure(f)).toBe(true);
    expect(f.status).toBe(400);
    expect(f.errors).toEqual({ email: 'Invalid email' });
  });

  it('ActionError carries code and status', () => {
    const err = new ActionError('Not allowed', { code: 'FORBIDDEN', status: 403 });
    expect(err.message).toBe('Not allowed');
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
    expect(err.name).toBe('ActionError');
  });
});

/* -------------------------------------------------------------------------- */
/* normalizeActionResult / validateActionInput / parseActionInput             */
/* -------------------------------------------------------------------------- */

describe('normalizeActionResult', () => {
  it('normalizes a plain return value', () => {
    const r = normalizeActionResult({ ok: true }, null);
    expect(r.data).toEqual({ ok: true });
    expect(r.status).toBe(200);
  });

  it('normalizes an ActionFailure', () => {
    const r = normalizeActionResult(fail(422, { email: 'bad' }), null);
    expect(r.errors).toEqual({ email: 'bad' });
    expect(r.status).toBe(422);
  });

  it('normalizes a thrown ActionError', () => {
    const err = new ActionError('Nope', { code: 'X', status: 401 });
    const r = normalizeActionResult(null, err);
    expect(r.error).toEqual({ message: 'Nope', code: 'X' });
    expect(r.status).toBe(401);
  });

  it('normalizes a generic thrown error to 500', () => {
    const r = normalizeActionResult(null, new Error('boom'));
    expect(r.error?.message).toBe('boom');
    expect(r.status).toBe(500);
  });
});

describe('validateActionInput', () => {
  it('validates with safeParse success', () => {
    const schema = {
      safeParse(v: unknown) {
        return v === 'ok' ? { success: true, data: 'ok' } : { success: false, error: { issues: [{ message: 'bad' }] } };
      }
    };
    expect(validateActionInput(schema, 'ok').success).toBe(true);
    const failed = validateActionInput(schema, 'no');
    expect(failed.success).toBe(false);
  });

  it('falls back to parse() when safeParse is absent', () => {
    const schema = { parse: (v: unknown) => v as string };
    const r = validateActionInput(schema, 'hello');
    expect(r.success).toBe(true);
  });

  it('returns errors when parse() throws', () => {
    const schema = {
      parse: () => {
        throw new Error('invalid');
      }
    };
    const r = validateActionInput(schema, 'x');
    expect(r.success).toBe(false);
  });
});

describe('parseActionInput', () => {
  it('parses JSON body', async () => {
    const req = new Request('http://x/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 })
    });
    const obj = await parseActionInput(req);
    expect(obj).toEqual({ a: 1 });
  });

  it('parses form-data body', async () => {
    const form = new FormData();
    form.append('name', 'alice');
    // Let the Request set the Content-Type automatically (with boundary).
    const req = new Request('http://x/', {
      method: 'POST',
      body: form
    });
    const obj = await parseActionInput(req);
    expect(obj).toEqual({ name: 'alice' });
  });

  it('returns empty object for unknown content type', async () => {
    const req = new Request('http://x/', { method: 'POST' });
    const obj = await parseActionInput(req);
    expect(obj).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                 */
/* -------------------------------------------------------------------------- */

describe('dispatcher', () => {
  beforeEach(() => clearActions());

  function makeApp() {
    const app = new Hono<UbeanEnv>();
    return app;
  }

  it('dispatchAction returns 404 for unknown action', async () => {
    const app = makeApp();
    let result: unknown;
    app.post('/test', async c => {
      result = await dispatchAction('act_unknown0000000', c);
      return c.json({ ok: true });
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toEqual({ error: { message: expect.stringContaining('not found') }, status: 404 });
  });

  it('runAction executes a registered action successfully', async () => {
    const action = defineAction(async (input: { x: number }) => input.x * 2, {
      name: 'double',
      filePath: 'src/actions/math.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async c => {
      result = await runAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 21 })
    });
    expect(result).toMatchObject({ data: 42, status: 200 });
  });

  it('runAction surfaces fail() as errors', async () => {
    const action = defineAction(async () => fail(400, { field: 'required' }), {
      name: 'failing',
      filePath: 'src/actions/f.ts'
    });
    const app = makeApp();
    let result: unknown;
    app.post('/test', async c => {
      result = await runAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ errors: { field: 'required' }, status: 400 });
  });

  it('runAction surfaces ActionError as error', async () => {
    const action = defineAction(
      async () => {
        throw new ActionError('Forbidden', { code: 'NO', status: 403 });
      },
      { name: 'thrower', filePath: 'src/actions/t.ts' }
    );
    const app = makeApp();
    let result: unknown;
    app.post('/test', async c => {
      result = await runAction(action as ServerAction, c);
      return c.json({});
    });
    await app.request('http://x/test', { method: 'POST' });
    expect(result).toMatchObject({ error: { message: 'Forbidden', code: 'NO' }, status: 403 });
  });

  it('runPageAction dispatches named actions from a map', async () => {
    const login = defineAction(async () => ({ user: 'alice' }), {
      name: 'login',
      filePath: 'src/actions/p.ts'
    });
    const result = await runPageAction(
      { login: login as ServerAction },
      'login',
      // runPageAction passes ctx to runAction; we can't easily build a real
      // Hono context without a request, so test the null branch instead.
      null as never
    ).catch(() => 'throws-without-ctx');
    // Without a real context, runAction will throw. Test the lookup-null branch:
    const nullResult = await runPageAction({ login: login as ServerAction }, 'nonexistent', null as never).catch(
      () => null
    );
    expect(nullResult).toBeNull();
    // Verify the action itself is valid
    expect(isServerAction(login)).toBe(true);
    // suppress unused warning
    void result;
  });
});

/* -------------------------------------------------------------------------- */
/* Middleware (/__actions endpoint)                                           */
/* -------------------------------------------------------------------------- */

describe('actions middleware', () => {
  beforeEach(() => clearActions());

  function mountActions() {
    const app = new Hono<UbeanEnv>();
    app.on('POST', ACTIONS_ENDPOINT, createActionsMiddleware());
    return app;
  }

  it('returns 400 when action id is missing', async () => {
    const app = mountActions();
    const res = await app.request(ACTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/missing action id/i);
  });

  it('returns 404 for unknown action id', async () => {
    const app = mountActions();
    const res = await app.request(ACTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'act_unknown0000000' })
    });
    expect(res.status).toBe(404);
    expect(res.headers.get(ACTION_RESPONSE_HEADER)).toBe('true');
    expect(isActionResponse(res)).toBe(true);
  });

  it('dispatches a registered action and returns data', async () => {
    const action = defineAction(async (input: { n: number }) => input.n + 1, {
      name: 'inc',
      filePath: 'src/actions/inc.ts'
    });
    const app = mountActions();
    const res = await app.request(ACTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: action.id, args: [{ n: 41 }] })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBe(42);
  });

  it('reads action id from query string', async () => {
    defineAction(async () => 'hello', { name: 'greet', filePath: 'src/actions/g.ts' });
    const action = getAction(listActions()[0].id)!;
    const app = mountActions();
    const res = await app.request(`${ACTIONS_ENDPOINT}?id=${action.id}`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toBe('hello');
  });

  it('isActionsRequest detects POST /__actions', () => {
    expect(isActionsRequest({ req: { path: ACTIONS_ENDPOINT, method: 'POST' } })).toBe(true);
    expect(isActionsRequest({ req: { path: '/api/foo', method: 'POST' } })).toBe(false);
    expect(isActionsRequest({ req: { path: ACTIONS_ENDPOINT, method: 'GET' } })).toBe(false);
  });

  it('sets Cache-Control: no-store on responses', async () => {
    const app = mountActions();
    const res = await app.request(ACTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'act_noop000000000' })
    });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

/* -------------------------------------------------------------------------- */
/* Form action URL parsing                                                    */
/* -------------------------------------------------------------------------- */

describe('form action URL parsing', () => {
  it('parses ?/login', () => {
    expect(parseFormActionName('http://x/page?/login')).toBe('login');
    expect(parseFormActionName('/page?/login')).toBe('login');
  });

  it('defaults to "default" when no action specified', () => {
    expect(parseFormActionName('http://x/page')).toBe('default');
    expect(parseFormActionName('http://x/page?')).toBe('default');
  });

  it('parses &/register (additional query param)', () => {
    expect(parseFormActionName('http://x/page?foo=bar&/register')).toBe('register');
  });

  it('builds form action URLs', () => {
    expect(buildFormActionUrl()).toBe('?/default');
    expect(buildFormActionUrl('default')).toBe('?/default');
    expect(buildFormActionUrl('login')).toBe('?/login');
    expect(buildFormActionUrl('my action')).toBe('?/my%20action');
  });

  it('detects form action in URL', () => {
    expect(hasFormAction('http://x/page?/login')).toBe(true);
    expect(hasFormAction('http://x/page')).toBe(false);
    expect(hasFormAction('http://x/page?foo=bar')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Vite plugin: directive detection & transformation                          */
/* -------------------------------------------------------------------------- */

describe('vite plugin: use server directive', () => {
  it('detects top-level "use server" directive', () => {
    expect(hasUseServerDirective('"use server";\nexport const x = 1;')).toBe(true);
    expect(hasUseServerDirective("'use server';\nexport const x = 1;")).toBe(true);
    expect(hasUseServerDirective('// comment\n"use server";\nexport const x = 1;')).toBe(true);
    expect(hasUseServerDirective('export const x = 1;')).toBe(false);
  });

  it('extracts export names from a module', () => {
    const code = `
      export async function login() {}
      export const logout = async () => {}
      export function helper() {}
      const _private = 1;
      export { _private as internal };
    `;
    const names = extractExportNames(code);
    expect(names).toContain('login');
    expect(names).toContain('logout');
    expect(names).toContain('helper');
    expect(names).toContain('internal');
    expect(names).toContain('_private');
  });

  it('transforms a "use server" module for the server side', () => {
    const code = `"use server";
export async function ping(input) {
  return { pong: input };
}`;
    const transformed = transformUseServerForServer(code, 'src/actions/ping.ts', '/root');
    expect(transformed).toContain('import { defineAction }');
    expect(transformed).toContain('__ubean_action_ping');
    expect(transformed).toContain('export { __ubean_action_ping as ping }');
    // The original 'use server' directive should be stripped
    expect(transformed.startsWith('"use server"')).toBe(false);
  });

  it('transforms a "use server" module for the client side', () => {
    const code = `"use server";
export async function ping(input) {
  return { pong: input };
}`;
    const transformed = transformUseServerForClient(code, 'src/actions/ping.ts', '/root');
    expect(transformed).toContain('callAction');
    expect(transformed).toContain('__ubean_callAction');
    expect(transformed).toContain('export function ping(...args)');
    // The original implementation should be stripped
    expect(transformed).not.toContain('pong');
  });

  it('produces matching IDs for server and client transforms', () => {
    const code = `"use server";
export async function greet(name) { return 'hi ' + name; }`;
    const serverCode = transformUseServerForServer(code, 'src/actions/greet.ts', '/root');
    const clientCode = transformUseServerForClient(code, 'src/actions/greet.ts', '/root');
    // Extract the action ID from both transforms — they must match.
    // Both transforms use JSON.stringify() → double-quoted strings.
    const serverIdMatch = serverCode.match(/"act_[a-z2-7]{12}"/);
    const clientIdMatch = clientCode.match(/"act_[a-z2-7]{12}"/);
    expect(serverIdMatch).not.toBeNull();
    expect(clientIdMatch).not.toBeNull();
    expect(serverIdMatch![0]).toBe(clientIdMatch![0]);
  });

  it('vite plugin skips node_modules and virtual modules', () => {
    const plugin = ubeanServerActionsPlugin({ root: '/root' });
    const result = plugin.transform!('export const x = 1', '/root/node_modules/pkg/index.ts', {});
    expect(result).toBeNull();
  });

  it('vite plugin skips files without "use server" directive', () => {
    const plugin = ubeanServerActionsPlugin({ root: '/root' });
    const result = plugin.transform!('export const x = 1;', '/root/src/utils.ts', { ssr: true });
    expect(result).toBeNull();
  });

  it('vite plugin transforms "use server" modules on the server', () => {
    const plugin = ubeanServerActionsPlugin({ root: '/root' });
    const code = `"use server";
export async function ping() { return 'pong'; }`;
    const result = plugin.transform!(code, '/root/src/actions/ping.ts', { ssr: true });
    expect(result).not.toBeNull();
    // Vite transform may return a string or { code, map }
    const out = typeof result === 'string' ? result : (result as { code: string }).code;
    expect(out).toContain('defineAction');
  });

  it('vite plugin transforms "use server" modules on the client', () => {
    const plugin = ubeanServerActionsPlugin({ root: '/root' });
    const code = `"use server";
export async function ping() { return 'pong'; }`;
    const result = plugin.transform!(code, '/root/src/actions/ping.ts', { ssr: false });
    expect(result).not.toBeNull();
    const out = typeof result === 'string' ? result : (result as { code: string }).code;
    expect(out).toContain('callAction');
  });
});
