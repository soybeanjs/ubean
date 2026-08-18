/**
 * 安全头中间件 (P9-13)
 *
 * 对齐 Astro 6 CSP / Next.js headers,提供可配置的安全响应头:
 * - Content-Security-Policy (CSP)
 * - Strict-Transport-Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
 * - Cross-Origin-* headers
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';

export interface ContentSecurityPolicyDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'media-src'?: string[];
  'object-src'?: string[];
  'frame-src'?: string[];
  'child-src'?: string[];
  'worker-src'?: string[];
  'manifest-src'?: string[];
  'base-uri'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'navigate-to'?: string[];
  'plugin-types'?: string[];
  'require-trusted-types-for'?: string[];
  'trusted-types'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
  'report-uri'?: string[];
  'report-to'?: string[];
  [key: string]: string[] | boolean | undefined;
}

export interface SecurityHeadersOptions {
  /** Content-Security-Policy 指令,设为 false 禁用 */
  contentSecurityPolicy?: ContentSecurityPolicyDirectives | false;
  /** 仅报告不拦截(report-only 模式) */
  contentSecurityPolicyReportOnly?: boolean;
  /** Strict-Transport-Security 配置,设为 false 禁用 */
  strictTransportSecurity?: { maxAge?: number; includeSubDomains?: boolean; preload?: boolean } | false;
  /** X-Frame-Options: 'DENY' | 'SAMEORIGIN' | false 禁用 */
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  /** X-Content-Type-Options,默认 'nosniff',设为 false 禁用 */
  xContentTypeOptions?: 'nosniff' | false;
  /** Referrer-Policy,默认 'strict-origin-when-cross-origin',设为 false 禁用 */
  referrerPolicy?: string | false;
  /** Permissions-Policy 配置 */
  permissionsPolicy?: Record<string, string[]> | false;
  /** Cross-Origin-Opener-Policy,默认 'same-origin',设为 false 禁用 */
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;
  /** Cross-Origin-Embedder-Policy,设为 false 禁用 */
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | 'unsafe-none' | false;
  /** Cross-Origin-Resource-Policy,默认 'same-origin',设为 false 禁用 */
  crossOriginResourcePolicy?: 'same-site' | 'same-origin' | 'cross-origin' | false;
  /** 跳过的路径前缀 */
  exclude?: string[];
  /** 自定义额外 header */
  extraHeaders?: Record<string, string>;
}

/**
 * 将 CSP 指令对象序列化为 header 值
 */
export function serializeCsp(directives: ContentSecurityPolicyDirectives): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(directives)) {
    if (value === undefined || value === null) continue;
    if (value === true) {
      parts.push(key);
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        parts.push(`${key} ${value.join(' ')}`);
      }
    }
  }
  return parts.join('; ');
}

/**
 * 将 Permissions-Policy 对象序列化为 header 值
 */
function serializePermissionsPolicy(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([feature, values]) => {
      if (values.length === 0) return `${feature}=()`;
      return `${feature}=(${values.join(' ')})`;
    })
    .join(', ');
}

const DEFAULT_CSP: ContentSecurityPolicyDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'upgrade-insecure-requests': true
};

/**
 * 创建安全头中间件
 *
 * @example
 * ```typescript
 * // 使用默认安全头
 * app.use('*', createSecurityHeadersMiddleware());
 *
 * // 自定义 CSP
 * app.use('*', createSecurityHeadersMiddleware({
 *   contentSecurityPolicy: {
 *     'default-src': ["'self'"],
 *     'script-src': ["'self'", 'https://cdn.example.com'],
 *     'style-src': ["'self'", "'unsafe-inline'"],
 *     'img-src': ["'self'", 'data:', 'https:']
 *   }
 * }));
 *
 * // 禁用某些头
 * app.use('*', createSecurityHeadersMiddleware({
 *   xFrameOptions: false,
 *   contentSecurityPolicy: false
 * }));
 * ```
 */
export function createSecurityHeadersMiddleware(options: SecurityHeadersOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    contentSecurityPolicy = DEFAULT_CSP,
    contentSecurityPolicyReportOnly = false,
    strictTransportSecurity = { maxAge: 15552000, includeSubDomains: true },
    xFrameOptions = 'SAMEORIGIN',
    xContentTypeOptions = 'nosniff',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = false,
    crossOriginOpenerPolicy = 'same-origin',
    crossOriginEmbedderPolicy = false,
    crossOriginResourcePolicy = 'same-origin',
    exclude = [],
    extraHeaders = {}
  } = options;

  // 预计算 header 值(避免每次请求重新计算)
  const headers: Record<string, string> = {};

  if (contentSecurityPolicy !== false) {
    const cspValue = serializeCsp(contentSecurityPolicy);
    if (cspValue) {
      const headerName = contentSecurityPolicyReportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
      headers[headerName] = cspValue;
    }
  }

  if (strictTransportSecurity !== false) {
    const sts = strictTransportSecurity;
    let stsValue = `max-age=${sts.maxAge ?? 15552000}`;
    if (sts.includeSubDomains) stsValue += '; includeSubDomains';
    if (sts.preload) stsValue += '; preload';
    headers['Strict-Transport-Security'] = stsValue;
  }

  if (xFrameOptions !== false) {
    headers['X-Frame-Options'] = xFrameOptions;
  }

  if (xContentTypeOptions !== false) {
    headers['X-Content-Type-Options'] = xContentTypeOptions;
  }

  if (referrerPolicy !== false) {
    headers['Referrer-Policy'] = referrerPolicy;
  }

  if (permissionsPolicy !== false) {
    const ppValue = serializePermissionsPolicy(permissionsPolicy);
    if (ppValue) {
      headers['Permissions-Policy'] = ppValue;
    }
  }

  if (crossOriginOpenerPolicy !== false) {
    headers['Cross-Origin-Opener-Policy'] = crossOriginOpenerPolicy;
  }

  if (crossOriginEmbedderPolicy !== false) {
    headers['Cross-Origin-Embedder-Policy'] = crossOriginEmbedderPolicy;
  }

  if (crossOriginResourcePolicy !== false) {
    headers['Cross-Origin-Resource-Policy'] = crossOriginResourcePolicy;
  }

  Object.assign(headers, extraHeaders);

  return async function securityHeadersMiddleware(c: Context<UbeanEnv>, next: Next) {
    // 跳过排除路径
    if (exclude.length > 0) {
      const path = c.req.path;
      const shouldSkip = exclude.some(pattern => path.startsWith(pattern));
      if (shouldSkip) {
        await next();
        return;
      }
    }

    // 设置安全头
    for (const [name, value] of Object.entries(headers)) {
      c.header(name, value);
    }

    await next();
  };
}

export function defineSecurityHeaders(options: SecurityHeadersOptions): MiddlewareHandler<UbeanEnv> {
  return createSecurityHeadersMiddleware(options);
}
