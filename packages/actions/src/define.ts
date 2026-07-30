import type { Context } from 'hono';
/**
 * `defineAction` — Astro-style server action creator (P9-02).
 *
 * Wraps an async function as a server action with a stable ID. The action
 * can be invoked:
 *
 *  - Server-side: call the returned function directly (typed input/output).
 *  - Client-side: the Vite plugin replaces the export with an RPC stub that
 *    POSTs to `/__actions` (transparent to the caller).
 *  - Form (progressive enhancement): use the action's `id` as a form
 *    `action` attribute, e.g. `<form method="POST" action="?/login">`.
 *
 * ## With a schema
 *
 * ```ts
 * import { defineAction } from 'ubean';
 * import { z } from 'zod';
 *
 * export const login = defineAction(
 *   z.object({ email: z.string().email(), password: z.string() }),
 *   async (data, ctx) => {
 *     // data is typed as { email: string; password: string }
 *     return { user: data.email };
 *   }
 * );
 * ```
 *
 * ## Without a schema
 *
 * ```ts
 * export const ping = defineAction(async (input, ctx) => {
 *   // input is the raw parsed body (FormData or JSON object)
 *   return { ok: true, echo: input };
 * });
 * ```
 *
 * ## Errors and validation failures
 *
 * - Throw `ActionError` to signal a user-facing error (with optional `code`).
 * - Return `fail(status, { field: 'message' })` for field-level validation
 *   errors (SvelteKit-style).
 */
import { ACTION_BRAND, ActionError, isActionFailure } from '@ubean/types';
import type { ActionContext, ActionHandler, ActionSchema, ServerAction, UbeanEnv } from '@ubean/types';
import { createActionId } from './id';
import { registerAction } from './registry';

export interface DefineActionOptions {
  /**
   * Override the auto-generated action ID.
   *
   * The Vite plugin injects this for `'use server'` modules so the client
   * and server agree on the ID. Inline `defineAction` calls use the
   * auto-generated ID derived from `import.meta.url` + the call site.
   */
  id?: string;
  /**
   * Override the action's source file path (used for ID generation and
   * debugging). Injected by the Vite plugin.
   */
  filePath?: string;
  /**
   * Override the action's export name (used for ID generation). Defaults
   * to the function's `name` property or `'anonymous'`.
   */
  name?: string;
}

/**
 * Define a server action with input schema validation.
 *
 * The handler receives the parsed/validated `data` (typed by the schema's
 * output). On validation failure, the action returns an `ActionResult`
 * with `errors` set to the schema's issue messages.
 */
export function defineAction<TOutput>(
  schema: ActionSchema<TOutput>,
  handler: ActionHandler<TOutput, unknown>,
  options?: DefineActionOptions
): ServerAction<TOutput, unknown>;

/**
 * Define a server action without a schema.
 *
 * The handler receives the raw input (FormData or parsed JSON object).
 */
export function defineAction<TInput = unknown, TOutput = unknown>(
  handler: ActionHandler<TInput, TOutput>,
  options?: DefineActionOptions
): ServerAction<TInput, TOutput>;

export function defineAction<TInput, TOutput>(
  schemaOrHandler: ActionSchema<TOutput> | ActionHandler<TInput, TOutput>,
  handlerOrOptions?: ActionHandler<TInput, TOutput> | DefineActionOptions,
  options?: DefineActionOptions
): ServerAction<TInput, TOutput> {
  let schema: ActionSchema<TOutput> | undefined;
  let handler: ActionHandler<TInput, TOutput>;
  let opts: DefineActionOptions = {};

  if (typeof schemaOrHandler === 'function') {
    // Overload 2: defineAction(handler, options?)
    handler = schemaOrHandler as ActionHandler<TInput, TOutput>;
    if (handlerOrOptions && typeof handlerOrOptions === 'object') {
      opts = handlerOrOptions as DefineActionOptions;
    }
  } else {
    // Overload 1: defineAction(schema, handler, options?)
    schema = schemaOrHandler as ActionSchema<TOutput>;
    handler = handlerOrOptions as ActionHandler<TInput, TOutput>;
    if (options) opts = options;
  }

  const name = opts.name || (handler as { name?: string }).name || 'anonymous';
  const filePath = opts.filePath || _guessCallerPath();
  const id = opts.id || createActionId(filePath, name);

  const action: ServerAction<TInput, TOutput> = {
    id,
    handler,
    schema,
    name,
    filePath
  };

  // Mark with the brand symbol so `isServerAction()` recognizes it.
  Object.defineProperty(action, ACTION_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  registerAction(action as unknown as ServerAction);
  return action;
}

/**
 * Best-effort guess of the caller's file path for action ID generation.
 *
 * Uses `Error.stack` parsing (works in Node and most browsers). Falls back
 * to `'inline'` when the stack is unavailable. The Vite plugin overrides
 * this with the actual transformed file path.
 */
function _guessCallerPath(): string {
  const stack = new Error().stack;
  if (!stack) return 'inline';
  // Skip: Error, _guessCallerPath, defineAction, caller
  const lines = stack.split('\n');
  // Find the first line that's not in this file
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line && !line.includes('/actions/src/define.ts') && !line.includes('/actions/src/id.ts')) {
      // Extract file path from `at <func> (<file>:<line>:<col>)` or `at <file>:<line>:<col>`
      const match = line.match(/\(([^)]+)\)|at\s+(https?:\/\/\S+)/);
      if (match) {
        const raw = match[1] || match[2];
        // Strip query/line/col
        return raw.replace(/[?#].*$/, '').replace(/:\d+:\d+$/, '');
      }
    }
  }
  return 'inline';
}

/**
 * Parse a Request body into a plain object suitable for action handlers.
 *
 * - `application/json` → parsed JSON object
 * - `multipart/form-data` or `application/x-www-form-urlencoded` → Object
 *   from FormData entries (string values, files skipped)
 * - Otherwise → empty object (handler can read `ctx.request` directly)
 */
export async function parseActionInput(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      const text = await request.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const formData = await request.formData();
      const obj: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) {
        // Skip File objects — handlers should use `ctx.request.formData()` directly
        // when they need file uploads.
        if (typeof value === 'string') {
          obj[key] = value;
        }
      }
      return obj;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Validate input against an action schema.
 *
 * Returns `{ success: true, data }` on success, or
 * `{ success: false, errors }` on failure (per-field messages).
 */
export function validateActionInput<T>(
  schema: ActionSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  // Prefer safeParse for non-throwing validation
  if (schema.safeParse) {
    const result = schema.safeParse(input);
    if (result.success) {
      return { success: true, data: result.data as T };
    }
    const errors: Record<string, string> = {};
    const issues = result.error?.issues || [];
    for (const issue of issues) {
      const key = issue.message ? String(issue.message) : 'Invalid';
      errors[key] = issue.message || 'Invalid value';
    }
    return { success: false, errors };
  }
  // Fallback to parse (may throw)
  try {
    if (schema.parse) {
      return { success: true, data: schema.parse(input) };
    }
    // No parse methods — accept input as-is
    return { success: true, data: input as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, errors: { _error: message } };
  }
}

/**
 * Normalize a handler return value into an `ActionResult`.
 *
 * - `ActionFailure` → `{ errors, status: failure.status }`
 * - `ActionError` (thrown) → `{ error: { message, code }, status }`
 * - Other thrown error → `{ error: { message }, status: 500 }`
 * - Plain value → `{ data: value, status: 200 }`
 */
export function normalizeActionResult(
  result: unknown,
  error: unknown,
  failureStatus = 400
): {
  data?: unknown;
  error?: { message: string; code?: string };
  errors?: Record<string, string> | null;
  status: number;
} {
  if (error) {
    if (error instanceof ActionError) {
      return {
        error: { message: error.message, code: error.code },
        status: error.status
      };
    }
    return {
      error: { message: error instanceof Error ? error.message : String(error) },
      status: 500
    };
  }
  if (isActionFailure(result)) {
    return {
      errors: result.errors as Record<string, string>,
      status: result.status || failureStatus
    };
  }
  return { data: result, status: 200 };
}

/**
 * Build an `ActionContext` from a Hono context.
 *
 * - `request`: the underlying `c.req.raw` Request
 * - `context`: the Hono context (for `c.set`, `c.get`, etc.)
 * - `params`: route params from `c.req.param()`
 */
export function buildActionContext(c: Context<UbeanEnv>): ActionContext {
  return {
    request: c.req.raw,
    context: c,
    params: c.req.param() as Record<string, string>
  };
}

// Re-export commonly used types and helpers from @ubean/types
export { ActionError, fail, isActionFailure, isServerAction } from '@ubean/types';
export type {
  ActionContext,
  ActionFailure,
  ActionHandler,
  ActionSchema,
  ActionResult,
  ServerAction,
  ActionId
} from '@ubean/types';
