import type { Context } from 'hono';
/**
 * Server-side action dispatcher (P9-02).
 *
 * The dispatcher runs a registered `ServerAction` by ID, handling:
 *  - Input parsing (JSON or FormData)
 *  - Schema validation (when `action.schema` is defined)
 *  - Handler invocation with `ActionContext`
 *  - Result normalization into `ActionResult`
 *  - `ActionError` / generic error handling
 *
 * Two entry points:
 *  - `dispatchAction(id, ctx)` — invoked by the `/__actions` middleware for
 *    RPC-style action calls (client `useAction()` / `callAction()`).
 *  - `runPageAction(action, ctx, input)` — invoked by `handlePageRequest`
 *    for SvelteKit-style form actions exported from page modules.
 *
 * Both produce a serializable `ActionResult` consumed by the client.
 */
import type { ActionResult, ActionContext, ServerAction, UbeanEnv } from '@ubean/shared';
import { buildActionContext, normalizeActionResult, parseActionInput, validateActionInput } from './define';
import { getAction } from './registry';

/**
 * Dispatch a registered server action by ID.
 *
 * Used by the `/__actions` POST endpoint (RPC-style invocation from the
 * client). The action ID is looked up in the global registry; the request
 * body is parsed as JSON or FormData depending on `Content-Type`.
 *
 * When `preParsedInput` is provided (RPC path — the middleware has already
 * read the body to extract the `{ id, args }` envelope), body parsing is
 * skipped and `preParsedInput` is used as the handler input directly.
 *
 * Returns an `ActionResult` (serializable). When the action ID is unknown
 * or invalid, returns a 404 error result without throwing.
 */
export async function dispatchAction(
  actionId: string,
  c: Context<UbeanEnv>,
  preParsedInput?: unknown
): Promise<ActionResult> {
  const action = getAction(actionId);
  if (!action) {
    return { error: { message: `Action not found: ${actionId}` }, status: 404 };
  }
  return runAction(action, c, preParsedInput);
}

/**
 * Run an arbitrary `ServerAction` against the given Hono context.
 *
 * Used internally by `dispatchAction` and by `handlePageRequest` for
 * page-level form actions (which are not in the global registry but
 * are exported from the page module's `actions` map).
 *
 * When `preParsedInput` is provided, body parsing is skipped (the caller
 * has already read the request body — e.g. the RPC middleware extracting
 * the `{ id, args }` envelope).
 */
export async function runAction<TInput, TOutput>(
  action: ServerAction<TInput, TOutput>,
  c: Context<UbeanEnv>,
  preParsedInput?: unknown
): Promise<ActionResult<TOutput>> {
  const ctx: ActionContext = buildActionContext(c);
  const rawInput = preParsedInput !== undefined ? preParsedInput : await parseActionInput(c.req.raw);

  // Schema validation (if defined)
  let input: unknown = rawInput;
  if (action.schema) {
    const validation = validateActionInput<unknown>(action.schema as never, rawInput);
    if (!validation.success) {
      return {
        errors: validation.errors,
        status: 400
      };
    }
    input = validation.data;
  }

  // Handler invocation
  let result: unknown;
  let error: unknown;
  try {
    result = await action.handler(input as TInput, ctx);
  } catch (err) {
    // Response passthrough: handlers may throw a Response (e.g. redirect).
    if (err instanceof Response) {
      return { response: err, status: err.status };
    }
    error = err;
  }

  // Response passthrough: handlers may return a Response (e.g. redirect).
  if (result instanceof Response) {
    return { response: result, status: result.status };
  }

  const normalized = normalizeActionResult(result, error);
  return normalized as ActionResult<TOutput>;
}

/**
 * Run a page-level form action by name (SvelteKit-style `?/name` convention).
 *
 * Page modules may export an `actions` map:
 *
 * ```ts
 * export const actions = {
 *   default: defineAction(async (input, ctx) => { ... }),
 *   login: defineAction(async (input, ctx) => { ... }),
 *   register: defineAction(async (input, ctx) => { ... })
 * };
 * ```
 *
 * - `POST /page` (no `?/`) → `actions.default`
 * - `POST /page?/login` → `actions.login`
 * - `POST /page?/register` → `actions.register`
 *
 * Returns `null` when:
 *  - No `actions` export exists (caller should fall back to `mod.action`).
 *  - The named action doesn't exist (caller should return 404).
 *
 * The caller (`handlePageRequest`) is responsible for converting the
 * `ActionResult` into an HTTP response (HTML for browser navigation,
 * JSON for SPA `submit()` calls).
 */
export async function runPageAction(
  actions: Record<string, ServerAction>,
  actionName: string,
  c: Context<UbeanEnv>
): Promise<ActionResult | null> {
  const action = actions[actionName];
  if (!action) {
    return null;
  }
  return runAction(action, c);
}
