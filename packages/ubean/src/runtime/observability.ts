const REQUEST_ID_HEADER = 'x-request-id';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface RequestIdOptions {
  headerName?: string;
  setResponseHeader?: boolean;
  generator?: () => string;
}

export function getRequestId(c: { get: (key: string) => unknown; req?: { header?: (name: string) => string | undefined } }): string | undefined {
  return c.get('requestId') as string | undefined;
}

export function createRequestIdMiddleware(options: RequestIdOptions = {}) {
  const headerName = options.headerName || REQUEST_ID_HEADER;
  const setResponseHeader = options.setResponseHeader !== false;
  const generator = options.generator || generateRequestId;

  return async function requestIdMiddleware(c: any, next: any) {
    const incomingId = c.req.header?.(headerName);
    const requestId = incomingId || generator();

    c.set('requestId', requestId);

    await next();

    if (setResponseHeader) {
      c.header(headerName, requestId);
    }
  };
}

export { generateRequestId, REQUEST_ID_HEADER };
