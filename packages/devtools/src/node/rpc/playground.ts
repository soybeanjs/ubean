/**
 * Playground RPC function — `ubean:playground:invoke`.
 *
 * Forwards an HTTP request to the Hono app in-process (no network
 * round-trip), mirroring the `internalFetch` / `callInternal` pattern
 * used elsewhere in ubean.
 */
import { defineRpcFunction } from '@vitejs/devtools-kit';

export interface PlaygroundInvokeParams {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface PlaygroundInvokeResult {
  status: number;
  statusText: string;
  body: unknown;
  headers: Record<string, string>;
}

export function createPlaygroundRpcFunctions(opts: {
  getApp?: () => { fetch: (req: Request) => Response | Promise<Response> } | undefined;
}) {
  const playgroundInvoke = defineRpcFunction({
    name: 'ubean:playground:invoke',
    type: 'action',
    setup: () => ({
      handler: async (params: PlaygroundInvokeParams): Promise<PlaygroundInvokeResult> => {
        const app = opts.getApp?.();
        if (!app) {
          return {
            status: 503,
            statusText: 'Service Unavailable',
            body: { error: 'App not available' },
            headers: {}
          };
        }

        const url = `http://localhost${params.path}`;
        const headers = new Headers(params.headers || { 'Content-Type': 'application/json' });
        const hasBody = params.body !== undefined && params.method !== 'GET' && params.method !== 'HEAD';
        const req = new Request(url, {
          method: params.method,
          headers,
          ...(hasBody ? { body: JSON.stringify(params.body) } : {})
        });

        const res = await app.fetch(req);
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });

        const contentType = res.headers.get('content-type') || '';
        let body: unknown;
        if (contentType.includes('application/json')) {
          body = await res.json();
        } else {
          body = await res.text();
        }

        return {
          status: res.status,
          statusText: res.statusText,
          body,
          headers: resHeaders
        };
      }
    })
  });

  return [playgroundInvoke];
}
