/**
 * Server Action Registry (P9-02).
 *
 * A module-level `Map<ActionId, ServerAction>` that holds all registered
 * server actions. Actions are registered:
 *
 *  1. Implicitly — by `defineAction()` returning a `ServerAction` whose
 *     `id` is auto-generated. The action is registered when called.
 *  2. Explicitly — by `registerAction(action)` (called by the Vite plugin
 *     for `'use server'` modules).
 *
 * The dispatcher (`dispatchAction`) looks up actions by ID from this
 * registry. The middleware (`createActionsMiddleware`) exposes the
 * registry via `POST /__actions`.
 *
 * Registry is global (module-level singleton) so that the Vite plugin's
 * virtual module and the runtime middleware share the same store without
 * passing references through user code.
 */
import type { ActionId, ServerAction } from '@ubean/types';

const _registry = new Map<ActionId, ServerAction>();

/**
 * Register a server action in the global registry.
 *
 * Called by `defineAction` (implicitly) and by the Vite plugin's virtual
 * module (explicitly) for `'use server'` modules.
 *
 * If an action with the same ID is already registered, the call is a
 * no-op (HMR-safe: re-registering the same action on hot reload doesn't
 * throw).
 */
export function registerAction(action: ServerAction): void {
  if (!_registry.has(action.id)) {
    _registry.set(action.id, action);
  }
}

/**
 * Look up a registered server action by ID.
 */
export function getAction(id: ActionId): ServerAction | undefined {
  return _registry.get(id);
}

/**
 * Check whether an action with the given ID is registered.
 */
export function hasAction(id: ActionId): boolean {
  return _registry.has(id);
}

/**
 * List all registered actions (for debugging / DevTools).
 */
export function listActions(): ServerAction[] {
  return [..._registry.values()];
}

/**
 * Clear the registry (for tests).
 *
 * Not intended for application code — actions are registered once at
 * module load and remain for the lifetime of the process.
 */
export function clearActions(): void {
  _registry.clear();
}

/**
 * Register a map of actions at once (bulk registration helper for the
 * Vite plugin's virtual module).
 */
export function registerActions(actions: ServerAction[]): void {
  for (const action of actions) {
    registerAction(action);
  }
}
