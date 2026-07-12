export interface ViewTransitionOptions {
  enabled?: boolean;
  fallback?: 'none' | 'crossfade';
  types?: string[];
}

interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

const _global = globalThis as any;

let _typesSupported: boolean | null = null;

function supportsTransitionTypes(): boolean {
  if (_typesSupported !== null) return _typesSupported;
  if (!supportsViewTransitions()) {
    _typesSupported = false;
    return false;
  }
  try {
    let calledWithObject = false;
    const doc = _global.document;
    const orig = doc.startViewTransition;
    doc.startViewTransition = function (this: any, opts: any) {
      if (opts && typeof opts === 'object' && 'update' in opts) {
        calledWithObject = true;
      }
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition() {}
      };
    };
    try {
      doc.startViewTransition({ update: () => {}, types: ['test'] });
    } catch {}
    doc.startViewTransition = orig;
    _typesSupported = calledWithObject;
  } catch {
    _typesSupported = false;
  }
  return _typesSupported;
}

export function supportsViewTransitions(): boolean {
  if (typeof _global.document === 'undefined') return false;
  return typeof _global.document.startViewTransition === 'function';
}

export async function withViewTransition<T>(
  callback: () => Promise<T> | T,
  options: ViewTransitionOptions = {}
): Promise<T> {
  const { enabled = true, types } = options;

  if (!enabled || !supportsViewTransitions()) {
    return callback();
  }

  const doc = _global.document;
  const useTypesApi = types && types.length > 0 && supportsTransitionTypes();

  let result: T | undefined;
  let callbackError: unknown;
  let callbackFailed = false;

  const updateCallback = async () => {
    try {
      result = await callback();
    } catch (e) {
      callbackFailed = true;
      callbackError = e;
      throw e;
    }
  };

  let transition: ViewTransition;
  if (useTypesApi) {
    transition = doc.startViewTransition({ update: updateCallback, types });
  } else {
    transition = doc.startViewTransition(updateCallback);
  }

  try {
    await transition.finished;
  } catch (err) {
    if (callbackFailed) {
      throw callbackError;
    }
    throw err;
  }

  if (callbackFailed) {
    throw callbackError;
  }

  return result as T;
}

export function getNavigationType(): 'traverse' | 'push' | 'replace' | 'reload' {
  try {
    const nav = _global.navigation;
    if (nav?.currentEntry && nav?.transitionType) {
      return nav.transitionType as any;
    }
  } catch {}
  return 'push';
}

export function useViewTransitionState(name: string): Record<string, string> {
  return { style: `view-transition-name: ${name};` };
}
