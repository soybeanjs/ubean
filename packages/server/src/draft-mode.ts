import { createHmac, timingSafeEqual } from 'node:crypto';
/**
 * Draft/Preview Mode (P9-23)
 *
 * 对齐 Next.js `draftMode()` 与 Astro draft mode。
 * 通过签名 cookie 启用草稿预览模式,用于预览未发布内容。
 *
 * 工作原理:
 * 1. 中间件读取请求中的 draft cookie,验证 HMAC-SHA256 签名
 * 2. 验证通过且未过期 → 在 context 上标记 draft mode 已启用
 * 3. `enableDraftMode(c)` 生成带过期时间的签名 token 并设置 cookie
 * 4. `disableDraftMode(c)` 清除 cookie
 *
 * 安全:cookie 值为 `expiry.signature`,签名使用 HMAC-SHA256 + 时序安全比较,
 * 客户端无法伪造或延长有效期。
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

export interface DraftModeOptions {
  /** cookie 名称,默认 'ubean_draft' */
  cookieName?: string;
  /** 签名密钥(必填,用于防止 cookie 篡改) */
  secret: string;
  /** cookie 有效期(秒),默认 3600(1 小时) */
  ttl?: number;
  /** cookie 选项 */
  cookie?: {
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
  };
  /** 跳过中间件的路径前缀 */
  exclude?: string[];
}

export interface DraftMode {
  /** 是否已启用 draft mode */
  readonly isEnabled: boolean;
  /** 启用 draft mode(设置签名 cookie) */
  enable: () => void;
  /** 禁用 draft mode(清除 cookie) */
  disable: () => void;
}

/* -------------------------------------------------------------------------- */
/* 签名工具(HMAC-SHA256)                                                       */
/* -------------------------------------------------------------------------- */

function sign(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function verify(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const signature = signed.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  // 时序安全比较,防止 timing attack
  if (signature.length !== expected.length) return null;
  try {
    if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Cookie 工具函数                                                              */
/* -------------------------------------------------------------------------- */

interface ResolvedCookieOpts {
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

function serializeCookie(name: string, value: string, opts: ResolvedCookieOpts, maxAge?: number): string {
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push('Secure');
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function isExcluded(path: string, exclude: string[] | undefined): boolean {
  if (!exclude || exclude.length === 0) return false;
  return exclude.some(p => path.startsWith(p));
}

/* -------------------------------------------------------------------------- */
/* DraftModeController(注入到 context)                                          */
/* -------------------------------------------------------------------------- */

const DRAFT_MODE_CONTEXT_KEY = '__ubean_draft_mode__';

type PendingAction = 'none' | 'enable' | 'disable';

class DraftModeController implements DraftMode {
  private _enabled: boolean;
  private _pendingAction: PendingAction = 'none';

  constructor(initialEnabled: boolean) {
    this._enabled = initialEnabled;
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  get pendingAction(): PendingAction {
    return this._pendingAction;
  }

  enable(): void {
    this._enabled = true;
    this._pendingAction = 'enable';
  }

  disable(): void {
    this._enabled = false;
    this._pendingAction = 'disable';
  }
}

function getController(c: Context<UbeanEnv>): DraftModeController | null {
  return ((c as unknown as Record<string, unknown>)[DRAFT_MODE_CONTEXT_KEY] as DraftModeController) || null;
}

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 创建 draft mode 中间件
 *
 * 中间件读取请求中的签名 cookie,验证签名与过期时间后在 context 上
 * 标记 draft mode 状态。响应阶段根据 controller 的 pendingAction
 * 设置或清除 cookie。
 *
 * @example
 * ```typescript
 * // 启用 draft mode(默认 1 小时有效)
 * app.use('*', createDraftModeMiddleware({ secret: 'my-secret' }));
 *
 * // 自定义 cookie 名称与 TTL
 * app.use('*', createDraftModeMiddleware({
 *   secret: 'my-secret',
 *   cookieName: 'preview',
 *   ttl: 86400
 * }));
 * ```
 */
export function createDraftModeMiddleware(options: DraftModeOptions): MiddlewareHandler<UbeanEnv> {
  if (!options.secret) {
    throw new Error('[ubean] createDraftModeMiddleware requires a `secret` option');
  }

  const { cookieName = 'ubean_draft', ttl = 3600, cookie: cookieOpts = {}, exclude = [] } = options;

  const cookieDefaults: ResolvedCookieOpts = {
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    ...cookieOpts
  };

  return async function draftModeMiddleware(c: Context<UbeanEnv>, next: Next) {
    if (isExcluded(c.req.path, exclude)) {
      await next();
      return;
    }

    // 读取并验证 draft cookie
    const cookieHeader = c.req.header('cookie');
    const cookieValue = parseCookie(cookieHeader, cookieName);

    let enabled = false;
    if (cookieValue) {
      const verified = verify(cookieValue, options.secret);
      if (verified !== null) {
        // 验证通过,检查是否过期
        const expiry = Number(verified);
        if (!Number.isNaN(expiry) && expiry > Date.now()) {
          enabled = true;
        }
      }
    }

    const controller = new DraftModeController(enabled);
    (c as unknown as Record<string, unknown>)[DRAFT_MODE_CONTEXT_KEY] = controller;

    await next();

    // 响应后处理:根据 pendingAction 设置/清除 cookie
    if (controller.pendingAction === 'enable') {
      const expiry = Date.now() + ttl * 1000;
      const token = sign(String(expiry), options.secret);
      c.header('Set-Cookie', serializeCookie(cookieName, token, cookieDefaults, ttl));
    } else if (controller.pendingAction === 'disable') {
      c.header('Set-Cookie', serializeCookie(cookieName, '', cookieDefaults, 0));
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 启用 draft mode(设置签名 cookie)
 *
 * 在路由处理函数中调用,中间件会在响应阶段设置 cookie。
 *
 * @example
 * ```typescript
 * app.get('/api/preview/enable', c => {
 *   enableDraftMode(c);
 *   return c.json({ ok: true });
 * });
 * ```
 */
export function enableDraftMode(c: Context<UbeanEnv>): void {
  const controller = getController(c);
  if (!controller) {
    throw new Error('[ubean] enableDraftMode() requires createDraftModeMiddleware to be registered on this app');
  }
  controller.enable();
}

/**
 * 禁用 draft mode(清除 cookie)
 *
 * @example
 * ```typescript
 * app.get('/api/preview/disable', c => {
 *   disableDraftMode(c);
 *   return c.json({ ok: true });
 * });
 * ```
 */
export function disableDraftMode(c: Context<UbeanEnv>): void {
  const controller = getController(c);
  if (!controller) {
    throw new Error('[ubean] disableDraftMode() requires createDraftModeMiddleware to be registered on this app');
  }
  controller.disable();
}

/**
 * 检查 draft mode 是否已启用(从 context 读取)
 *
 * 未注册中间件时返回 false。
 */
export function isDraftMode(c: Context<UbeanEnv>): boolean {
  const controller = getController(c);
  return controller?.isEnabled ?? false;
}

/**
 * 获取 draft mode 组合式 API
 *
 * 返回 `{ isEnabled, enable, disable }`,在路由处理函数中使用。
 *
 * @example
 * ```typescript
 * app.get('*', c => {
 *   const draft = useDraftMode(c);
 *   if (draft.isEnabled) {
 *     // 返回草稿内容
 *   }
 *   return c.json({ draft: draft.isEnabled });
 * });
 * ```
 */
export function useDraftMode(c: Context<UbeanEnv>): DraftMode {
  const controller = getController(c);
  if (controller) {
    return controller;
  }
  // 中间件未注册时的安全回退
  return {
    isEnabled: false,
    enable: () => {
      throw new Error(
        '[ubean] useDraftMode().enable() requires createDraftModeMiddleware to be registered on this app'
      );
    },
    disable: () => {
      throw new Error(
        '[ubean] useDraftMode().disable() requires createDraftModeMiddleware to be registered on this app'
      );
    }
  };
}

/**
 * 定义 draft mode 中间件(别名,与 defineCsrf / defineCors 风格一致)
 */
export function defineDraftMode(options: DraftModeOptions): MiddlewareHandler<UbeanEnv> {
  return createDraftModeMiddleware(options);
}
