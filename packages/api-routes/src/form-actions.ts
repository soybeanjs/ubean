/**
 * Server Actions helpers (P9-02).
 *
 * Inline form-action dispatch for page modules exporting an `actions` map
 * (SvelteKit-style `?/<name>` convention). Kept self-contained so the
 * router doesn't pull `@ubean/actions` (which re-exports the Vue runtime)
 * into the server bundle.
 */
import type { Context } from 'hono';
import { isActionFailure } from '@ubean/types';
import type { UbeanEnv, ServerAction, ActionContext } from '@ubean/types';

/**
 * Extract the form action name from a URL's search query.
 *
 * - `?/login` → `login`
 * - `?/register` → `register`
 * - (no `?/<name>`) → `default`
 */
export function parseFormActionName(url: string): string {
  const searchIdx = url.indexOf('?');
  const search = searchIdx >= 0 ? url.slice(searchIdx) : '';
  const match = search.match(/[?&]\/([^&]+)/);
  return match ? match[1] : 'default';
}

/**
 * Shared redirect/non-redirect Response handling for both the legacy
 * `mod.action(c)` path and the new `mod.actions` map path.
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
 * current Hono context. Parses the request body (JSON or FormData), runs
 * schema validation when present, and invokes the handler.
 *
 * Returns one of:
 *  - `{ response }` — handler returned/threw a `Response` (redirect)
 *  - `{ errors }` — validation failure or `fail()` from the handler
 *  - `{ data }` — successful return value (merged into page props)
 */
export async function runServerAction(
  action: ServerAction,
  c: Context<UbeanEnv>
): Promise<{ data?: unknown; errors?: Record<string, string>; response?: Response }> {
  const actionCtx: ActionContext = {
    request: c.req.raw,
    context: c,
    params: c.req.param() as Record<string, string>
  };

  // Parse input from request body (JSON or FormData → plain object).
  let input: Record<string, unknown> = {};
  const contentType = c.req.header('Content-Type') || '';
  try {
    if (contentType.includes('application/json')) {
      const text = await c.req.text();
      input = text ? JSON.parse(text) : {};
    } else if (contentType.includes('form-data') || contentType.includes('urlencoded')) {
      const formData = await c.req.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') input[key] = value;
      }
    }
  } catch {
    // ignore body parse errors — handler receives empty input
  }

  // Schema validation (Standard Schema safeParse / parse).
  let validated = input;
  if (action.schema?.safeParse) {
    const result = action.schema.safeParse(input);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error?.issues || []) {
        const msg = issue.message || 'Invalid value';
        errors[msg] = msg;
      }
      return { errors };
    }
    validated = (result.data as Record<string, unknown>) ?? input;
  } else if (action.schema?.parse) {
    try {
      validated = action.schema.parse(input) as Record<string, unknown>;
    } catch (err) {
      return { errors: { _error: err instanceof Error ? err.message : String(err) } };
    }
  }

  // Invoke handler.
  try {
    const result = await action.handler(validated, actionCtx);
    if (result instanceof Response) return { response: result };
    if (isActionFailure(result)) {
      return { errors: result.errors as Record<string, string> };
    }
    return { data: result };
  } catch (err) {
    if (err instanceof Response) return { response: err };
    return { errors: { _error: err instanceof Error ? err.message : String(err) } };
  }
}
