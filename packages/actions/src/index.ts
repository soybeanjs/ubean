/**
 * @ubean/actions — Server Actions / Form Actions (P9-02)
 *
 * Public API for defining and dispatching server actions.
 *
 * ## Quick start
 *
 * Define a server action with `defineAction`:
 *
 * ```ts
 * // src/actions/auth.ts
 * import { defineAction } from 'ubean';
 *
 * export const ping = defineAction(async (input, ctx) => {
 *   return { ok: true, echo: input };
 * });
 * ```
 *
 * Invoke it from the client with `useAction`:
 *
 * ```vue
 * <script setup>
 * import { useAction } from 'ubean/runtime/vue';
 * import { ping } from '~/actions/auth';
 *
 * const { submit, pending, data, error } = useAction(ping);
 * </script>
 *
 * <template>
 *   <button :disabled="pending" @click="submit({ foo: 'bar' })">
 *     {{ pending ? 'Loading…' : 'Ping' }}
 *   </button>
 *   <pre v-if="data">{{ data }}</pre>
 * </template>
 * ```
 *
 * ## Form actions (SvelteKit-style)
 *
 * Page modules can export an `actions` map for progressive enhancement:
 *
 * ```vue
 * <!-- src/pages/login.vue -->
 * <script setup>
 * import { defineAction } from 'ubean';
 *
 * export const actions = {
 *   default: defineAction(async (input, ctx) => {
 *     return { ok: true };
 *   }),
 *   login: defineAction(async (input, ctx) => {
 *     return { user: input.email };
 *   })
 * };
 * </script>
 *
 * <template>
 *   <form method="POST" action="?/login">
 *     <input name="email" type="email" />
 *     <button type="submit">Login</button>
 *   </form>
 * </template>
 * ```
 */

// Core defineAction API
export {
  defineAction,
  parseActionInput,
  validateActionInput,
  normalizeActionResult,
  buildActionContext
} from './define';
export type { DefineActionOptions } from './define';

// Re-export common types and helpers from @ubean/types
export {
  ActionError,
  fail,
  isActionFailure,
  isServerAction,
  ACTION_BRAND
} from '@ubean/types';
export type {
  ActionContext,
  ActionFailure,
  ActionHandler,
  ActionSchema,
  ActionResult,
  ServerAction,
  ActionId
} from '@ubean/types';

// Action ID generation
export { createActionId, isValidActionId } from './id';

// Registry
export {
  registerAction,
  registerActions,
  getAction,
  hasAction,
  listActions,
  clearActions
} from './registry';

// Dispatcher
export { dispatchAction, runAction, runPageAction } from './dispatch';

// Hono middleware (POST /__actions endpoint)
export {
  createActionsMiddleware,
  isActionsRequest,
  isActionResponse,
  ACTIONS_ENDPOINT,
  ACTION_RESPONSE_HEADER
} from './middleware';

// Form action URL parsing
export { parseFormActionName, buildFormActionUrl, hasFormAction } from './form-action';
