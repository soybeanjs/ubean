export type DataKey = string | symbol;

export interface DataCacheEntry<T = unknown> {
  key: DataKey;
  data: T;
  timestamp: number;
  ttl?: number;
  tags?: string[];
}

type DataFetcher<T> = () => T | Promise<T>;

interface DataRegistry {
  entries: Map<DataKey, DataCacheEntry>;
  tagIndex: Map<string, Set<DataKey>>;
}

function createRegistry(): DataRegistry {
  return {
    entries: new Map(),
    tagIndex: new Map()
  };
}

const globalRegistry = createRegistry();

const contextRegistry = new WeakMap<object, DataRegistry>();

function getRegistry(context?: object): DataRegistry {
  if (context) {
    let reg = contextRegistry.get(context);
    if (!reg) {
      reg = createRegistry();
      contextRegistry.set(context, reg);
    }
    return reg;
  }
  return globalRegistry;
}

export function defineDataKey(key: string): symbol {
  return Symbol.for(`ubean:data:${key}`);
}

export interface UseDataOptions<T> {
  key?: DataKey;
  tags?: string[];
  ttl?: number;
  staleWhileRevalidate?: boolean;
  fetcher: DataFetcher<T>;
}

export interface DataResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  timestamp: number | undefined;
  invalidate: () => void;
}

export async function useData<T>(options: UseDataOptions<T>, context?: object): Promise<DataResult<T>> {
  const registry = getRegistry(context);
  const key = options.key || Symbol();

  const invalidate = () => {
    invalidateData(key, context);
  };

  try {
    const cached = registry.entries.get(key) as DataCacheEntry<T> | undefined;

    if (cached) {
      const isExpired = cached.ttl !== undefined && Date.now() - cached.timestamp > cached.ttl;
      if (!isExpired) {
        return {
          data: cached.data,
          error: null,
          loading: false,
          timestamp: cached.timestamp,
          invalidate
        };
      }
    }

    const data = await options.fetcher();
    const entry: DataCacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: options.ttl,
      tags: options.tags
    };

    registry.entries.set(key, entry);

    if (options.tags) {
      for (const tag of options.tags) {
        let tagSet = registry.tagIndex.get(tag);
        if (!tagSet) {
          tagSet = new Set();
          registry.tagIndex.set(tag, tagSet);
        }
        tagSet.add(key);
      }
    }

    return {
      data,
      error: null,
      loading: false,
      timestamp: entry.timestamp,
      invalidate
    };
  } catch (err) {
    return {
      data: undefined,
      error: err instanceof Error ? err : new Error(String(err)),
      loading: false,
      timestamp: undefined,
      invalidate
    };
  }
}

export function invalidateData(keyOrTag: DataKey | string, context?: object): number {
  const registry = getRegistry(context);
  let count = 0;

  if (typeof keyOrTag === 'string') {
    const tagSet = registry.tagIndex.get(keyOrTag);
    if (tagSet) {
      for (const key of tagSet) {
        const entry = registry.entries.get(key);
        if (entry) {
          if (entry.tags) {
            for (const t of entry.tags) {
              const tSet = registry.tagIndex.get(t);
              if (tSet) tSet.delete(key);
            }
          }
          registry.entries.delete(key);
          count++;
        }
      }
      registry.tagIndex.delete(keyOrTag);
    }
  } else {
    const entry = registry.entries.get(keyOrTag);
    if (entry) {
      if (entry.tags) {
        for (const t of entry.tags) {
          const tSet = registry.tagIndex.get(t);
          if (tSet) tSet.delete(keyOrTag);
        }
      }
      registry.entries.delete(keyOrTag);
      count = 1;
    }
  }

  return count;
}

export function invalidateAll(context?: object): void {
  const registry = getRegistry(context);
  registry.entries.clear();
  registry.tagIndex.clear();
}

export function clearDataCache(context?: object): void {
  invalidateAll(context);
}

export function hasData(key: DataKey, context?: object): boolean {
  return getRegistry(context).entries.has(key);
}

export interface DependencyDeclaration {
  keys: DataKey[];
  tags?: string[];
}

export function declareDependencies(deps: DependencyDeclaration): DependencyDeclaration {
  return deps;
}

export function withDependencies<T>(fn: () => T | Promise<T>, deps: DependencyDeclaration): () => Promise<T> {
  return async () => {
    return fn();
  };
}

export function getInvalidatedKeysForAction(
  actionName: string,
  invalidationMap: Record<string, Array<DataKey | string>>,
  context?: object
): number {
  const toInvalidate = invalidationMap[actionName];
  if (!toInvalidate) return 0;

  let count = 0;
  for (const key of toInvalidate) {
    count += invalidateData(key, context);
  }
  return count;
}

export interface InternalFetchOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  forwardHeaders?: string[];
}

const FORWARD_HEADER_DEFAULTS = [
  'cookie',
  'authorization',
  'x-request-id',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'accept-language',
  'user-agent',
  'referer'
];

export function createInternalFetch(c: {
  req: {
    raw?: Request;
    header?: (name: string) => string | undefined;
    url?: string;
  };
}, options: InternalFetchOptions = {}): typeof fetch {
  const forwardHeaders = options.forwardHeaders || FORWARD_HEADER_DEFAULTS;
  const incomingHeaders = new Headers();

  for (const headerName of forwardHeaders) {
    const value = c.req.header?.(headerName);
    if (value) {
      incomingHeaders.set(headerName, value);
    }
  }

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      incomingHeaders.set(k, v);
    }
  }

  const baseURL = options.baseURL || '';

  return async function internalFetch(input: string | { url: string } | URL, init?: RequestInit & { headers?: unknown }): Promise<Response> {
    let url: string;
    if (typeof input === 'string') {
      url = input.startsWith('http') ? input : `${baseURL}${input.startsWith('/') ? '' : '/'}${input}`;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = (input as { url: string }).url;
    }

    const mergedInit: RequestInit = {
      ...init,
      headers: mergeHeaders(incomingHeaders, init?.headers as ConstructorParameters<typeof Headers>[0] | undefined)
    };

    return fetch(url, mergedInit);
  };
}

function mergeHeaders(base: Headers, extra?: ConstructorParameters<typeof Headers>[0]): Headers {
  const result = new Headers(base);
  if (!extra) return result;

  if (extra instanceof Headers) {
    extra.forEach((value, key) => result.set(key, value));
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      result.set(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) result.set(key, String(value));
    }
  }

  return result;
}

export interface StreamHelper {
  enqueue: (chunk: unknown) => void;
  close: () => void;
  error: (err: Error) => void;
  response: Response;
}

export function createStreamResponse(
  init?: ResponseInit,
  onStart?: (stream: StreamHelper) => void | Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const helper: StreamHelper = {
        enqueue(chunk: unknown) {
          const data = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(data));
        },
        close() {
          controller.close();
        },
        error(err: Error) {
          controller.error(err);
        },
        response: null as unknown as Response
      };

      try {
        await onStart?.(helper);
      } catch (err) {
        controller.error(err);
      }
    }
  });

  const response = new Response(stream, {
    ...init,
    headers: {
      'Content-Type': init?.headers ?
        (init.headers as Record<string, string>)['Content-Type'] || 'text/event-stream'
        : 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(init?.headers as Record<string, string> | undefined)
    }
  });

  return response;
}

export function createSseStream(onStart?: (stream: StreamHelper) => void | Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const helper: StreamHelper = {
        enqueue(chunk: unknown) {
          let text: string;
          if (typeof chunk === 'string') {
            text = `data: ${chunk}\n\n`;
          } else {
            text = `data: ${JSON.stringify(chunk)}\n\n`;
          }
          controller.enqueue(encoder.encode(text));
        },
        close() {
          controller.close();
        },
        error(err: Error) {
          controller.error(err);
        },
        response: null as unknown as Response
      };

      controller.enqueue(encoder.encode(': connected\n\n'));

      try {
        await onStart?.(helper);
      } catch (err) {
        controller.error(err);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
