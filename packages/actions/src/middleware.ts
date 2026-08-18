/**
 * Hono middleware for the `/__actions` endpoint (P9-02).
 *
 * Mounts a single `POST /__actions` route that dispatches registered
 * server actions by ID. The action ID is read from the request body
 * (`{ id, args }`) or query string (`?id=<actionId>`).
 *
 * The middleware returns a JSON response in the `ActionResult` shape:
 *
 * ```ts
 * // Success:
 * { data: ..., status: 200 }
 *
 * // Validation failure:
 * { errors: { email: 'Invalid email' }, status: 400 }
 *
 * // Action error:
 * { error: { message: 'Invalid credentials', code: 'AUTH_FAILED' }, status: 401 }
 * ```
 *
 * The client `callAction()` helper posts to this endpoint and parses the
 * response back into a typed `ActionResult`.
 */
import type { MiddlewareHandler } from 'hono';
import type { UbeanEnv, ActionResult } from '@ubean/shared';
import { dispatchAction } from './dispatch';

/**
 * The URL path where the actions middleware is mounted.
 */
export const ACTIONS_ENDPOINT = '/__actions';

/**
 * Header set on action responses so the client can distinguish them from
 * regular API responses. Without this, `callAction()` couldn't tell
 * whether a response was a successful action result or an error page.
 */
export const ACTION_RESPONSE_HEADER = 'x-ubean-action';

/**
 * Create the actions middleware — a Hono handler that mounts the
 * `/__actions` POST endpoint.
 *
 * Usage:
 *
 * ```ts
 * import { createUbeanApp } from 'ubean/runtime/app';
 * import { createActionsMiddleware } from '@ubean/actions';
 *
 * const app = createUbeanApp();
 * app.on('POST', '/__actions', createActionsMiddleware());
 * ```
 *
 * The middleware is auto-registered by ubean's dev server / production
 * server setup — users don't need to mount it manually.
 */
export function createActionsMiddleware(): MiddlewareHandler<UbeanEnv> {
  return async c => {
    // Read action ID + args from body (`{ id, args }`) or query string (`?id=`).
    let actionId: string | undefined;
    let args: unknown[] | undefined;

    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = (await c.req.json()) as { id?: string; args?: unknown[] };
        actionId = body?.id;
        args = body?.args;
      } catch {
        // Malformed JSON body — fall through to query string
      }
    }
    if (!actionId) {
      actionId = c.req.query('id');
    }

    if (!actionId) {
      return _jsonResult(c, { error: { message: 'Missing action id' }, status: 400 }, 400);
    }

    // The RPC envelope's `args` is a positional array. The action handler
    // takes a single `input` (SvelteKit-style), so pass `args[0]` as the
    // pre-parsed input. This also avoids re-reading the consumed body stream
    // inside `runAction` → `parseActionInput`.
    const preParsedInput = Array.isArray(args) && args.length > 0 ? args[0] : undefined;

    // Dispatch the action — returns an ActionResult.
    const result = await dispatchAction(actionId, c, preParsedInput);

    // Response passthrough: when the handler returned/threw a raw Response
    // (e.g. a redirect), return it verbatim instead of JSON-serializing it.
    if (result.response) {
      return result.response;
    }

    return _jsonResult(c, result, result.status);
  };
}

/**
 * Serialize an `ActionResult` as a JSON Hono response with the action
 * response header set.
 */
function _jsonResult(c: Parameters<MiddlewareHandler<UbeanEnv>>[0], result: ActionResult, status: number) {
  return c.json(result, status as 200, {
    [ACTION_RESPONSE_HEADER]: 'true',
    'Cache-Control': 'no-store'
  });
}

/**
 * Check whether a request targets the actions endpoint.
 *
 * Used by route registrars to skip registering regular API routes for
 * the `/__actions` path.
 */
export function isActionsRequest(c: { req: { path: string; method: string } }): boolean {
  return c.req.method === 'POST' && c.req.path === ACTIONS_ENDPOINT;
}

/**
 * Check whether a response came from the actions middleware.
 *
 * Used by the client `callAction()` to validate the response shape.
 */
export function isActionResponse(response: Response): boolean {
  return response.headers.get(ACTION_RESPONSE_HEADER) === 'true';
}
