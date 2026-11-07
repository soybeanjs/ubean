import type { UbeanEnv } from '@ubean/shared';
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
 * 内置 Icon 组件（@iconify/vue）在线回退的 API 端点。
 *
 * 组件是框架自带的，用户没写任何 CSP 配置时也必须能取到图标；因此这条来源属于框架
 * 自身的 CSP 契约，应用配置不能把它从 `connect-src` 里覆盖掉。
 */
export const ICONIFY_API_ORIGIN = 'https://api.iconify.design';

/** CSP 生效时必须始终保留的 `connect-src` 来源（不可被应用配置覆盖）。 */
export const REQUIRED_CSP_CONNECT_SOURCES: readonly string[] = [ICONIFY_API_ORIGIN];

const CSP_HEADER_NAMES = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only'] as const;

/** 将 CSP 指令对象序列化为 header 值 */
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

/** 追加来源并去重（保留原顺序），不改动入参。 */
const mergeSources = (base: string[], origins: readonly string[]): string[] => [
  ...base,
  ...origins.filter(origin => !base.includes(origin))
];

function extendCspDirective(
  directives: ContentSecurityPolicyDirectives,
  name: string,
  origins: readonly string[]
): ContentSecurityPolicyDirectives {
  const current = directives[name];
  const base = Array.isArray(current) ? current : [];
  return { ...directives, [name]: mergeSources(base, origins) };
}

/**
 * 在 CSP 指令上追加 `script-src` 来源（去重、保留原顺序），返回新对象（不改动入参）。
 *
 * 用于框架内置页面：它们要加载框架自己写在 HTML 里的第三方脚本，而应用的 CSP 是全局的一份 ——
 * 与其放宽所有人的默认策略，不如只在该页面自己的响应上追加它真正需要的那一个来源。
 */
export function extendCspScriptSrc(
  directives: ContentSecurityPolicyDirectives,
  origins: string[]
): ContentSecurityPolicyDirectives {
  return extendCspDirective(directives, 'script-src', origins);
}

/**
 * 把框架必需的来源并入 `connect-src`（去重、不改动入参）。
 *
 * 没有显式 `connect-src` 时以 `default-src` 的来源为基底：浏览器在缺 `connect-src` 时会
 * 回退到 `default-src`，照抄它才不会把原本允许的同源连接收紧掉。两条都没有时 CSP 对连接
 * 不设限，Iconify API 本就可达，不必凭空新增一条反而收紧策略的指令。
 */
export function withRequiredCspConnectSources(
  directives: ContentSecurityPolicyDirectives
): ContentSecurityPolicyDirectives {
  const connectSrc = directives['connect-src'];
  const defaultSrc = directives['default-src'];
  const base =
    Array.isArray(connectSrc) && connectSrc.length > 0
      ? connectSrc
      : Array.isArray(defaultSrc) && defaultSrc.length > 0
        ? defaultSrc
        : undefined;
  if (!base) return directives;

  const merged = mergeSources(base, REQUIRED_CSP_CONNECT_SOURCES);
  if (Array.isArray(connectSrc) && merged.length === connectSrc.length) return directives;
  return { ...directives, 'connect-src': merged };
}

/** 解析 CSP header 值为指令对象（裸指令记成 `true`，与 `serializeCsp` 对称）。 */
function parseCsp(csp: string): ContentSecurityPolicyDirectives {
  return csp.split(';').reduce<ContentSecurityPolicyDirectives>((directives, part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) return directives;
    return { ...directives, [name]: values.length > 0 ? values : true };
  }, {});
}

/**
 * 在一条已序列化的 CSP header 值上强制保留必需来源。
 *
 * 这是 CSP 的最终出口：无论 header 来自框架默认、应用覆盖还是 `extraHeaders` 注入，
 * 只要响应真的带 CSP，就绕不过这一步。
 */
export function ensureCspConnectSources(csp: string): string {
  if (!csp.trim()) return csp;
  return serializeCsp(withRequiredCspConnectSources(parseCsp(csp)));
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

/** 需按 key 逐层合并(而非整体替换)的嵌套对象类选项 */
const NESTED_OPTION_KEYS = [
  'contentSecurityPolicy',
  'strictTransportSecurity',
  'permissionsPolicy',
  'extraHeaders'
] as const;

type NestedSecurityHeadersKey = (typeof NESTED_OPTION_KEYS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深合并两份 SecurityHeadersOptions:
 * - 顶层 key 由 override 整体替换(支持 `false` 关闭某项、`undefined` 保留默认)
 * - 嵌套对象类 key(contentSecurityPolicy / strictTransportSecurity /
 *   permissionsPolicy / extraHeaders)按 key 逐层合并 —— 用户只需覆盖单个
 *   指令(如只改 `connect-src`),其余指令保持默认值不变
 */
export function mergeSecurityHeadersOptions(
  base: SecurityHeadersOptions,
  override: SecurityHeadersOptions
): SecurityHeadersOptions {
  const merged: SecurityHeadersOptions = { ...base, ...override };
  const nested = merged as unknown as Record<NestedSecurityHeadersKey, Record<string, unknown>>;
  for (const key of NESTED_OPTION_KEYS) {
    const baseValue = base[key];
    const overrideValue = override[key];
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      nested[key] = { ...baseValue, ...overrideValue };
    }
  }
  return merged;
}

const DEFAULT_CSP: ContentSecurityPolicyDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...REQUIRED_CSP_CONNECT_SOURCES],
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

  // 内置 Icon 走 Iconify API 回退，这条来源属于框架自身的 CSP 契约：深合并覆盖 connect-src、
  // 整条指令替换、extraHeaders 注入同名 header 都不能把它抹掉。只在最终 header 值上强制，
  // 所有覆盖路径才都绕不过去；CSP 被显式关闭且应用没自行注入时，这里没有任何头可改。
  for (const [name, value] of Object.entries(headers)) {
    if (CSP_HEADER_NAMES.some(cspName => cspName.toLowerCase() === name.toLowerCase())) {
      headers[name] = ensureCspConnectSources(value);
    }
  }

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
