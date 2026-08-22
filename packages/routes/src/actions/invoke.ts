/**
 * Isomorphic invocation for `defineAction` / `defineServerFn`.
 *
 * Same ID and `/__actions` RPC as Server Actions — not a second protocol.
 * Server with ALS: call the real handler. Otherwise (client stub or no
 * request scope): call `handler`, which on the client is the Vite RPC stub.
 */
import { ActionError, isActionFailure } from '@ubean/shared';
import type { ActionResult, ServerAction } from '@ubean/shared';
import { validateActionInput } from './define';
import { createDetachedActionContext, getActionContext } from './request-context';

export function unwrapActionResult<T>(result: ActionResult<T>): T {
  if (result.error) {
    throw new ActionError(result.error.message, { code: result.error.code, status: result.status });
  }
  if (result.errors) {
    const first = Object.values(result.errors)[0] || 'Validation failed';
    throw new ActionError(first, { status: result.status || 400 });
  }
  if (result.response) {
    throw result.response;
  }
  return result.data as T;
}

function isActionResultShape(value: unknown): value is ActionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    ('data' in value || 'error' in value || 'errors' in value || 'response' in value)
  );
}

export async function unwrapServerFnResult<T>(value: unknown): Promise<T> {
  if (isActionFailure(value)) {
    const first = Object.values(value.errors as Record<string, string>)[0] || 'Validation failed';
    throw new ActionError(first, { status: value.status });
  }
  if (isActionResultShape(value)) {
    return unwrapActionResult(value) as T;
  }
  return value as T;
}

/**
 * Call a server function from a loader, `useAsyncData`, or the client.
 *
 * Reuses the action ID / `POST /__actions` envelope. Does not invent RPC.
 */
export async function invokeServerFn<TInput = unknown, TOutput = unknown>(
  fn: ServerAction<TInput, TOutput>,
  input?: TInput
): Promise<TOutput> {
  let data = input as TInput;
  if (fn.schema) {
    const validated = validateActionInput<TInput>(fn.schema as never, input);
    if (!validated.success) {
      const first = Object.values(validated.errors)[0] || 'Validation failed';
      throw new ActionError(first, { status: 400 });
    }
    data = validated.data;
  }
  const ctx = getActionContext() ?? createDetachedActionContext();
  const value = await fn.handler(data, ctx);
  return unwrapServerFnResult<TOutput>(value);
}
