/**
 * CSRF 保护中间件 (P9-12)
 *
 * 对齐 Astro 5 默认开启的 CSRF 保护,采用 double-submit cookie 模式:
 * 1. 框架在响应中设置一个 CSRF token cookie(非 HttpOnly,前端可读)
 * 2. 前端读取 cookie,在变更请求(POST/PUT/PATCH/DELETE)中通过 header 或 body 回传
 * 3. 中间件比对 cookie 中的 token 与请求中的 token,不匹配则拒绝
 *
 * 也支持 origin 校验模式(更简单,但不如 token 安全)。
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

export interface CsrfOptions {
  /** 校验模式:'token'(double-submit cookie,默认) | 'origin'(Origin/Referer 校验) | 'both' */
  mode?: 'token' | 'origin' | 'both';
  /** cookie 名称,默认 'ubean_csrf' */
  cookieName?: string;
  /** token header 名称,默认 'x-csrf-token' */
  headerName?: string;
  /** token 在 body 中的字段名,默认 'csrfToken' */
  fieldName?: string;
  /** token 长度(字节数),默认 32 */
  tokenLength?: number;
  /** cookie 选项 */
  cookie?: {
    path?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
  };
  /** 自定义 token 生成函数 */
  generateToken?: () => string;
  /** 跳过校验的路径(glob 风格前缀匹配) */
  exclude?: string[];
  /** 自定义错误处理 */
  handler?: (c: Context<UbeanEnv>) => Response | Promise<Response>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * 生成密码学安全的随机 token
 */
function defaultGenerateToken(length = 32): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(bytes).toString('base64url');
}

/**
 * 从 cookie header 中解析指定 cookie 值
 */
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

/**
 * 校验 Origin/Referer 是否与目标 host 匹配
 */
function isOriginAllowed(c: Context<UbeanEnv>): boolean {
  const origin = c.req.header('origin');
  const referer = c.req.header('referer');
  const host = c.req.header('host');

  if (!host) return false;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host === host;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  // 同源请求可能不带 Origin/Referer(如直接导航),放行
  return true;
}

function isExcluded(path: string, exclude: string[] | undefined): boolean {
  if (!exclude || exclude.length === 0) return false;
  return exclude.some(pattern => {
    if (pattern.endsWith('/**')) {
      return path.startsWith(pattern.slice(0, -3));
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix) && !path.slice(prefix.length).includes('/');
    }
    return path === pattern;
  });
}

function defaultErrorHandler(c: Context<UbeanEnv>): Response {
  return c.json(
    {
      error: 'CSRF Token Invalid',
      message: 'The CSRF token is missing or invalid.'
    },
    403
  );
}

/**
 * 创建 CSRF 保护中间件
 *
 * @example
 * ```typescript
 * // 使用默认配置(double-submit cookie 模式)
 * app.use('*', createCsrfMiddleware());
 *
 * // 仅校验 Origin
 * app.use('*', createCsrfMiddleware({ mode: 'origin' }));
 *
 * // 排除 API 路径
 * app.use('*', createCsrfMiddleware({ exclude: ['/api/webhook/**'] }));
 * ```
 */
export function createCsrfMiddleware(options: CsrfOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    mode = 'token',
    cookieName = 'ubean_csrf',
    headerName = 'x-csrf-token',
    fieldName = 'csrfToken',
    tokenLength = 32,
    cookie: cookieOpts = {},
    generateToken = () => defaultGenerateToken(tokenLength),
    exclude = [],
    handler = defaultErrorHandler
  } = options;

  const cookiePath = cookieOpts.path || '/';
  const cookieSecure = cookieOpts.secure ?? false;
  const cookieSameSite = cookieOpts.sameSite || 'lax';
  const cookieDomain = cookieOpts.domain;

  return async function csrfMiddleware(c: Context<UbeanEnv>, next: Next) {
    // 跳过排除路径
    if (isExcluded(c.req.path, exclude)) {
      await next();
      return;
    }

    const method = c.req.method.toUpperCase();

    // 对于安全方法,确保 cookie 存在然后继续
    if (SAFE_METHODS.has(method)) {
      // 确保 token cookie 已设置
      const cookieHeader = c.req.header('cookie');
      const existingToken = parseCookie(cookieHeader, cookieName);
      if (!existingToken) {
        const token = generateToken();
        const parts = [`${cookieName}=${token}`, `Path=${cookiePath}`];
        if (cookieSecure) parts.push('Secure');
        parts.push(`SameSite=${cookieSameSite}`);
        if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
        c.header('Set-Cookie', parts.join('; '));
      }
      await next();
      return;
    }

    // 不安全方法(POST/PUT/PATCH/DELETE):校验 CSRF
    const cookieHeader = c.req.header('cookie');
    const cookieToken = parseCookie(cookieHeader, cookieName);

    let originValid = true;
    if (mode === 'origin' || mode === 'both') {
      originValid = isOriginAllowed(c);
    }

    let tokenValid = true;
    if (mode === 'token' || mode === 'both') {
      const headerToken = c.req.header(headerName);
      let bodyToken: string | undefined;

      // 尝试从 form data 中提取
      if (!headerToken) {
        try {
          const contentType = c.req.header('content-type') || '';
          if (
            contentType.includes('application/x-www-form-urlencoded') ||
            contentType.includes('multipart/form-data')
          ) {
            const formData = await c.req.formData();
            bodyToken = formData.get(fieldName) as string | undefined;
          }
        } catch {
          // body 可能已被消费
        }
      }

      const requestToken = headerToken || bodyToken;

      if (!cookieToken || !requestToken) {
        tokenValid = false;
      } else if (cookieToken !== requestToken) {
        tokenValid = false;
      }
    }

    if (!originValid || !tokenValid) {
      return handler(c);
    }

    await next();
  };
}

/**
 * 生成 CSRF token(供前端使用)
 */
export function generateCsrfToken(length = 32): string {
  return defaultGenerateToken(length);
}

export function defineCsrf(options: CsrfOptions): MiddlewareHandler<UbeanEnv> {
  return createCsrfMiddleware(options);
}
