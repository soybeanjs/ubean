/**
 * Client-side runtime for server actions (P9-02).
 *
 * This module is browser-only — it MUST NOT import any Node.js APIs or
 * server-only types. The Vite plugin's RPC stubs import `callAction` from
 * here, and `useAction()` / `useFormAction()` are auto-imported from
 * `ubean/runtime/vue` (which re-exports these).
 *
 * The runtime communicates with the server via the `/__actions` POST
 * endpoint (for RPC) or via page POST (for form actions with
 * progressive enhancement).
 */
import { ref } from 'vue';
import type { Ref } from 'vue';
import type { ActionResult, ServerAction } from '@ubean/types';
import {
  ACTIONS_ENDPOINT,
  ACTION_RESPONSE_HEADER,
  buildFormActionUrl
} from './index';

/**
 * Low-level RPC: invoke a registered server action by ID.
 *
 * Used by the Vite plugin's client-side RPC stubs (generated from
 * `'use server'` modules). Application code should use `useAction()`
 * instead — `callAction` is the building block.
 *
 * @param actionId The stable action ID (e.g. `act_xxxxxxxxxxxx`)
 * @param args     Arguments to pass to the action handler (serialized as JSON)
 * @returns The `ActionResult` returned by the server
 */
export async function callAction<T = unknown>(
  actionId: string,
  args: unknown[] = []
): Promise<ActionResult<T>> {
  const res = await fetch(ACTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ACTION_RESPONSE_HEADER]: 'true'
    },
    body: JSON.stringify({ id: actionId, args }),
    redirect: 'manual'
  });

  // The server's actions middleware returns JSON in `ActionResult` shape.
  // If the response is not JSON (e.g. an error page from a proxy), return
  // a generic error result.
  const contentType = res.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return {
      error: { message: `Unexpected response (status ${res.status})` },
      status: res.status
    };
  }

  try {
    const data = (await res.json()) as ActionResult<T>;
    return data;
  } catch {
    return {
      error: { message: 'Failed to parse action response' },
      status: res.status
    };
  }
}

export interface UseActionReturn<TInput = unknown, TOutput = unknown> {
  /** Reactive flag: `true` while the action is in flight. */
  pending: Ref<boolean>;
  /** The latest `ActionResult.data` (success), or `null` on error. */
  data: Ref<TOutput | null>;
  /** The latest `ActionResult.error`, or `null` on success. */
  error: Ref<{ message: string; code?: string } | null>;
  /** The latest `ActionResult.errors` (field-level), or `null`. */
  errors: Ref<Record<string, string> | null>;
  /** The latest HTTP status code. */
  status: Ref<number>;
  /** The full `ActionResult` from the last invocation. */
  result: Ref<ActionResult<TOutput> | null>;
  /**
   * Invoke the action. Pass either:
   *  - the action's typed input (when no schema), or
   *  - the validated data shape (when schema is provided)
   *
   * For `'use server'` modules, pass arguments positionally as an array:
   * `submit(email, password)`.
   */
  submit: (...args: TInput extends unknown[] ? TInput : [TInput]) => Promise<ActionResult<TOutput>>;
  /** Reset all reactive state to initial values. */
  reset: () => void;
}

/**
 * Composable for invoking a server action reactively.
 *
 * Two usage modes:
 *
 * ## 1. Action from `defineAction()` (typed input)
 *
 * ```ts
 * import { useAction } from 'ubean/runtime/vue';
 * import { login } from '~/actions/auth';
 *
 * const { submit, pending, data, error } = useAction(login);
 * await submit({ email, password });
 * ```
 *
 * ## 2. Action ID from `'use server'` module
 *
 * ```ts
 * const { submit, pending, data, error } = useAction('act_xxxxxxxxxxxx');
 * await submit(email, password);
 * ```
 */
export function useAction<TInput = unknown, TOutput = unknown>(
  actionOrId: ServerAction<TInput, TOutput> | string
): UseActionReturn<TInput, TOutput> {
  const pending = ref(false);
  const data = ref<TOutput | null>(null) as Ref<TOutput | null>;
  const error = ref<{ message: string; code?: string } | null>(null);
  const errors = ref<Record<string, string> | null>(null);
  const status = ref(0);
  const result = ref<ActionResult<TOutput> | null>(null) as Ref<ActionResult<TOutput> | null>;

  const actionId = typeof actionOrId === 'string' ? actionOrId : actionOrId.id;

  async function submit(...args: unknown[]): Promise<ActionResult<TOutput>> {
    pending.value = true;
    error.value = null;
    errors.value = null;
    try {
      const res = await callAction<TOutput>(actionId, args);
      result.value = res;
      status.value = res.status;
      if (res.error) {
        error.value = res.error;
        data.value = null;
      } else if (res.errors) {
        errors.value = res.errors;
        data.value = null;
      } else {
        data.value = (res.data as TOutput) ?? null;
      }
      return res;
    } catch (err) {
      const fallback: ActionResult<TOutput> = {
        error: { message: err instanceof Error ? err.message : String(err) },
        status: 0
      };
      result.value = fallback;
      status.value = 0;
      error.value = fallback.error!;
      return fallback;
    } finally {
      pending.value = false;
    }
  }

  function reset() {
    pending.value = false;
    data.value = null;
    error.value = null;
    errors.value = null;
    status.value = 0;
    result.value = null;
  }

  return {
    pending,
    data,
    error,
    errors,
    status,
    result,
    submit: submit as UseActionReturn<TInput, TOutput>['submit'],
    reset
  };
}

export interface UseFormActionReturn {
  /** The form `action` attribute value (e.g. `?/login`). */
  action: string;
  /** Reactive flag: `true` while the form is submitting via SPA. */
  pending: Ref<boolean>;
  /** The latest `ActionResult.data` from a SPA submit, or `null`. */
  data: Ref<unknown | null>;
  /** The latest `ActionResult.error`, or `null`. */
  error: Ref<{ message: string; code?: string } | null>;
  /** The latest `ActionResult.errors` (field-level), or `null`. */
  errors: Ref<Record<string, string> | null>;
  /**
   * Submit a `FormData` (or HTMLFormElement) via SPA-style navigation.
   *
   * Posts to the current page URL with `?/<actionName>` and the form's
   * fields as the body. The server's `handlePageRequest` dispatches the
   * named form action and returns a `PageObject` with `errors`/`props`.
   *
   * For progressive enhancement, set this as the form's `@submit` handler:
   *
   * ```vue
   * <form method="POST" :action="formAction" @submit.prevent="formAction.onSubmit">
   *   ...
   * </form>
   * ```
   */
  onSubmit: (event: Event | FormData) => Promise<ActionResult>;
  /** Reset all reactive state. */
  reset: () => void;
}

/**
 * Composable for SvelteKit-style page-level form actions.
 *
 * Generates the form `action` attribute for progressive enhancement and
 * provides a SPA-style submit handler. The form action is invoked via
 * `POST /currentPage?/<actionName>` — the server dispatches it to the
 * page module's `actions.<name>` handler.
 *
 * ```vue
 * <script setup>
 * import { useFormAction } from 'ubean/runtime/vue';
 *
 * const login = useFormAction('login');
 * </script>
 *
 * <template>
 *   <form method="POST" :action="login.action" @submit.prevent="login.onSubmit">
 *     <input name="email" type="email" />
 *     <input name="password" type="password" />
 *     <button :disabled="login.pending.value">
 *       {{ login.pending.value ? 'Logging in…' : 'Login' }}
 *     </button>
 *   </form>
 *   <p v-if="login.error.value" class="error">{{ login.error.value.message }}</p>
 * </template>
 * ```
 *
 * Without JavaScript, the browser submits the form natively to
 * `?/login` — the server renders the result HTML, providing full
 * progressive enhancement.
 */
export function useFormAction(actionName: string = 'default'): UseFormActionReturn {
  const action = buildFormActionUrl(actionName);
  const pending = ref(false);
  const data = ref<unknown | null>(null);
  const error = ref<{ message: string; code?: string } | null>(null);
  const errors = ref<Record<string, string> | null>(null);

  async function onSubmit(event: Event | FormData): Promise<ActionResult> {
    let formData: FormData;
    if (event instanceof FormData) {
      formData = event;
    } else {
      const form = event.target as HTMLFormElement;
      formData = new FormData(form);
    }

    pending.value = true;
    error.value = null;
    errors.value = null;
    try {
      // Build the full URL: current page + `?/<actionName>`
      // The browser will resolve relative `action` attributes against the
      // current document URL.
      const url = window.location.pathname + action;
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'x-ubeanpages': 'true'
        },
        redirect: 'manual'
      });

      // The page POST handler returns either a JSON `PageObject` (SPA
      // request via `x-ubeanpages: true`) or a redirect.
      const redirectUrl = res.headers.get('X-Ubean-Redirect');
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return { data: { redirect: redirectUrl }, status: res.status };
      }

      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const json = (await res.json()) as Record<string, unknown>;
        if (json.redirect && typeof json.redirect === 'string') {
          window.location.href = json.redirect as string;
          return { data: json, status: res.status };
        }
        // PageObject response — extract errors and props
        const pageObj = json as { errors?: Record<string, string>; props?: Record<string, unknown> };
        if (pageObj.errors) {
          errors.value = pageObj.errors;
          return { errors: pageObj.errors, status: res.status };
        }
        data.value = pageObj.props ?? null;
        return { data: pageObj.props, status: res.status };
      }

      return { status: res.status };
    } catch (err) {
      const fallback: ActionResult = {
        error: { message: err instanceof Error ? err.message : String(err) },
        status: 0
      };
      error.value = fallback.error!;
      return fallback;
    } finally {
      pending.value = false;
    }
  }

  function reset() {
    pending.value = false;
    data.value = null;
    error.value = null;
    errors.value = null;
  }

  return {
    action,
    pending,
    data,
    error,
    errors,
    onSubmit,
    reset
  };
}
