/**
 * Request-scoped ActionContext without importing `node:async_hooks`.
 *
 * The Hono app binds an AsyncLocalStorage runner at boot; SSR / loaders
 * then read it via `getActionContext()`. Client bundles never bind storage.
 */
import type { ActionContext } from '@ubean/shared';

const STORAGE_KEY = '__UBEAN_ACTION_CTX_STORAGE__' as const;

export interface ActionContextStorage {
  getStore(): ActionContext | undefined;
  run<T>(ctx: ActionContext, fn: () => T): T;
}

type GlobalWithStorage = typeof globalThis & {
  [STORAGE_KEY]?: ActionContextStorage;
};

export function bindActionContextStorage(storage: ActionContextStorage): void {
  (globalThis as GlobalWithStorage)[STORAGE_KEY] = storage;
}

export function getActionContext(): ActionContext | undefined {
  return (globalThis as GlobalWithStorage)[STORAGE_KEY]?.getStore();
}

export function runWithActionContext<T>(ctx: ActionContext, fn: () => T): T {
  const storage = (globalThis as GlobalWithStorage)[STORAGE_KEY];
  if (storage) return storage.run(ctx, fn);
  return fn();
}

export function createDetachedActionContext(request?: Request): ActionContext {
  const req = request ?? new Request('http://ubean.local/__actions');
  const params: Record<string, string> = {};
  const context = {
    req: {
      raw: req,
      param: () => params,
      path: new URL(req.url).pathname,
      method: req.method,
      header: (name: string) => req.headers.get(name) ?? undefined
    },
    get: () => undefined,
    set: () => undefined
  };
  return {
    request: req,
    context: context as unknown as ActionContext['context'],
    params
  };
}
