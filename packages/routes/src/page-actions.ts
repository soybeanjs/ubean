/**
 * Page-level form action helpers (P9-02).
 *
 * Thin adapter over Server Actions primitives — the duplicated inline
 * implementation (body parsing / schema validation / result normalization)
 * was removed in favor of `runAction`, which now also supports `Response`
 * passthrough for redirects. Only the pages-router-specific contract lives
 * here: `{ data, errors, response }` shape and redirect→JSON conversion.
 */
import type { Context } from 'hono';
import type { UbeanEnv, ServerAction } from '@ubean/shared';
import { runAction } from './actions';

export { parseFormActionName } from './actions';

/**
 * Shared redirect/non-redirect Response handling for both the legacy
 * `mod.action(c)` path and the `mod.actions` map path.
 *
 * Returns a `Response` to return to the client, or `null` to fall through
 * (caller leaves `actionResult` as the Response for downstream handling).
 */
export function handleActionResponse(
  c: Context<UbeanEnv>,
  response: Response,
  isPagesReq: (c: Context<UbeanEnv>) => boolean
): Response | null {
  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = response.headers.get('Location');
    if (redirectUrl) {
      if (isPagesReq(c)) {
        return c.json({ redirect: redirectUrl }, { status: 200, headers: { 'X-Ubean-Redirect': redirectUrl } });
      }
      return response;
    }
  }
  if (isPagesReq(c)) {
    return response;
  }
  return null;
}

/**
 * Run a `ServerAction` (from a page module's `actions` map) against the
 * current Hono context via `runAction`.
 *
 * Returns one of:
 *  - `{ response }` — handler returned/threw a `Response` (redirect)
 *  - `{ errors }` — validation failure, `fail()` from the handler, or a
 *    thrown error (mapped to `{ _error: message }`)
 *  - `{ data }` — successful return value (merged into page props)
 */
export async function runServerAction(
  action: ServerAction,
  c: Context<UbeanEnv>
): Promise<{ data?: unknown; errors?: Record<string, string>; response?: Response }> {
  const result = await runAction(action, c);
  if (result.response) {
    return { response: result.response };
  }
  if (result.errors) {
    return { errors: result.errors ?? {} };
  }
  if (result.error) {
    return { errors: { _error: result.error.message } };
  }
  return { data: result.data };
}
