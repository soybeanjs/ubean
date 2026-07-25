import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

export interface CorsOptions {
  origin?:
    | string
    | string[]
    | boolean
    | ((origin: string, c: Context<UbeanEnv>) => boolean | string | undefined | Promise<boolean | string | undefined>);
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
}

const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'];

function isPreflight(c: Context): boolean {
  return c.req.method === 'OPTIONS' && !!c.req.header('origin') && !!c.req.header('access-control-request-method');
}

function configureOrigin(c: Context, option: CorsOptions['origin'], requestOrigin: string): string | undefined | null {
  if (option === true || option === undefined || option === '*') {
    return '*';
  }

  if (option === false) {
    return null;
  }

  if (typeof option === 'string') {
    return option;
  }

  if (Array.isArray(option)) {
    if (option.includes(requestOrigin) || option.includes('*')) {
      return requestOrigin;
    }
    return null;
  }

  if (typeof option === 'function') {
    return null;
  }

  return null;
}

export function createCorsMiddleware(options: CorsOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    origin = '*',
    allowMethods = DEFAULT_METHODS,
    allowHeaders,
    exposeHeaders = [],
    credentials = false,
    maxAge,
    preflightContinue = false
  } = options;

  const resolvedAllowHeaders = allowHeaders?.length ? allowHeaders : DEFAULT_HEADERS;

  return async function corsMiddleware(c: Context<UbeanEnv>, next: Next) {
    const requestOrigin = c.req.header('origin') || '';
    let originValue: string | null | undefined = null;

    if (typeof origin === 'function') {
      const result = await origin(requestOrigin, c);
      if (result === true || result === undefined) {
        originValue = requestOrigin;
      } else if (result === false) {
        originValue = null;
      } else if (typeof result === 'string') {
        originValue = result;
      }
    } else {
      originValue = configureOrigin(c, origin, requestOrigin);
    }

    if (originValue) {
      c.header('Access-Control-Allow-Origin', originValue);

      if (originValue !== '*' || credentials) {
        c.header('Vary', 'Origin');
      }
    }

    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    if (exposeHeaders.length > 0) {
      c.header('Access-Control-Expose-Headers', exposeHeaders.join(', '));
    }

    if (isPreflight(c)) {
      const preflightHeaders: Record<string, string> = {};

      if (originValue) preflightHeaders['Access-Control-Allow-Origin'] = originValue;
      if (credentials) preflightHeaders['Access-Control-Allow-Credentials'] = 'true';
      preflightHeaders['Access-Control-Allow-Methods'] = allowMethods.join(', ');
      preflightHeaders['Access-Control-Allow-Headers'] = resolvedAllowHeaders.join(', ');
      if (maxAge != null) preflightHeaders['Access-Control-Max-Age'] = String(maxAge);
      if (originValue && originValue !== '*') preflightHeaders['Vary'] = 'Origin';

      if (!preflightContinue) {
        return new Response(null, { status: 204, headers: preflightHeaders });
      }
    }

    await next();
  };
}

export function defineCors(options: CorsOptions): MiddlewareHandler<UbeanEnv> {
  return createCorsMiddleware(options);
}
