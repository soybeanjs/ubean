/**
 * 通用 Sessions API (P9-11)
 *
 * 对齐 Astro 5.7+ `Astro.session` / SvelteKit locals.session,
 * 提供框架级通用 session 原语(与 auth session 解耦)。
 *
 * 支持 signed cookie + 服务端存储两种模式:
 * - cookie 模式:session 数据直接存储在 signed/encrypted cookie 中(≤4KB)
 * - storage 模式:session ID 存 cookie,数据存服务端 storage(KV/Redis/内存)
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';
import { useStorage } from './storage';
import type { UbeanStorage } from './storage';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

export type SessionData = Record<string, unknown>;

export interface Session<T extends SessionData = SessionData> {
  /** 读取 session 值 */
  get<K extends keyof T>(key: K): T[K] | undefined;
  /** 设置 session 值 */
  set<K extends keyof T>(key: K, value: T[K]): void;
  /** 删除 session 值 */
  delete(key: string): void;
  /** 检查 key 是否存在 */
  has(key: string): boolean;
  /** 获取所有 session 数据 */
  all(): SessionData;
  /** 保存 session(写入存储/cookie) */
  save(): Promise<void>;
  /** 销毁 session */
  destroy(): Promise<void>;
  /** session ID */
  readonly id: string;
  /** 是否已修改 */
  readonly isDirty: boolean;
  /** 是否已销毁 */
  readonly isDestroyed: boolean;
}

export interface SessionStore {
  get(id: string): Promise<SessionData | null>;
  set(id: string, data: SessionData, ttl?: number): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SessionOptions {
  /** session cookie 名称,默认 'ubean_session' */
  cookieName?: string;
  /** session 有效期(秒),默认 7 天 */
  ttl?: number;
  /** cookie 选项 */
  cookie?: {
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
  };
  /** 自定义 session store(storage 模式),不传则用 cookie 模式 */
  store?: SessionStore;
  /** 自定义 session ID 生成函数 */
  generateId?: () => string;
  /** 自定义签名密钥(cookie 模式用于签名) */
  secret?: string;
  /** 跳过路径 */
  exclude?: string[];
}

/* -------------------------------------------------------------------------- */
/* Session 实现                                                                 */
/* -------------------------------------------------------------------------- */

class SessionImpl<T extends SessionData = SessionData> implements Session<T> {
  private _data: SessionData;
  private _dirty = false;
  private _destroyed = false;

  constructor(
    public readonly id: string,
    initialData: SessionData,
    private readonly _store: SessionStore | null,
    private readonly _ttl: number,
    private readonly _onSave?: (id: string, data: SessionData) => Promise<void>,
    private readonly _onDestroy?: (id: string) => Promise<void>
  ) {
    this._data = { ...initialData };
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    if (this._destroyed) return undefined;
    return this._data[key as string] as T[K];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    if (this._destroyed) return;
    this._data[key as string] = value;
    this._dirty = true;
  }

  delete(key: string): void {
    if (this._destroyed) return;
    if (key in this._data) {
      delete this._data[key];
      this._dirty = true;
    }
  }

  has(key: string): boolean {
    if (this._destroyed) return false;
    return key in this._data;
  }

  all(): SessionData {
    return { ...this._data };
  }

  get isDirty(): boolean {
    return this._dirty;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  async save(): Promise<void> {
    if (this._destroyed) return;
    if (this._onSave) {
      await this._onSave(this.id, this._data);
    } else if (this._store) {
      await this._store.set(this.id, this._data, this._ttl);
    }
    this._dirty = false;
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    if (this._onDestroy) {
      await this._onDestroy(this.id);
    } else if (this._store) {
      await this._store.delete(this.id);
    }
    this._data = {};
    this._destroyed = true;
    this._dirty = false;
  }
}

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                     */
/* -------------------------------------------------------------------------- */

function defaultGenerateId(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Buffer.from(bytes).toString('hex');
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

function serializeCookie(name: string, value: string, opts: NonNullable<SessionOptions['cookie']>): string {
  const parts = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push('Secure');
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join('; ');
}

/**
 * 简单签名/验证(cookie 模式用,非加密级别安全)
 * 生产环境建议使用 storage 模式或提供更强的 secret
 */
function sign(value: string, secret: string): string {
  // 简单签名:hash(secret + value)
  // 生产环境建议使用 storage 模式或提供更强的签名机制
  let hash = 0;
  const str = secret + value;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `${value}.${Math.abs(hash).toString(36)}`;
}

function verify(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value, secret);
  return signed === expected ? value : null;
}

function isExcluded(path: string, exclude: string[] | undefined): boolean {
  if (!exclude || exclude.length === 0) return false;
  return exclude.some(p => path.startsWith(p));
}

/* -------------------------------------------------------------------------- */
/* Storage-backed Session Store                                                */
/* -------------------------------------------------------------------------- */

export function createStorageSessionStore(storage?: UbeanStorage, prefix = 'session:'): SessionStore {
  const store = storage || useStorage();
  return {
    async get(id: string): Promise<SessionData | null> {
      const data = await store.get<SessionData>(`${prefix}${id}`);
      return data;
    },
    async set(id: string, data: SessionData, ttl?: number): Promise<void> {
      await store.set(`${prefix}${id}`, data, ttl);
    },
    async delete(id: string): Promise<void> {
      await store.remove(`${prefix}${id}`);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

const SESSION_CONTEXT_KEY = '__ubean_session__';

/**
 * 创建 session 中间件
 *
 * @example
 * ```typescript
 * // cookie 模式(默认,数据存 signed cookie)
 * app.use('*', createSessionMiddleware({ secret: 'my-secret' }));
 *
 * // storage 模式(数据存服务端 KV/storage)
 * app.use('*', createSessionMiddleware({
 *   store: createStorageSessionStore()
 * }));
 * ```
 */
export function createSessionMiddleware(options: SessionOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    cookieName = 'ubean_session',
    ttl = 604800, // 7 days
    cookie: cookieOpts = {},
    store = null,
    generateId = defaultGenerateId,
    secret,
    exclude = []
  } = options;

  const cookieDefaults = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
    ...cookieOpts
  };

  return async function sessionMiddleware(c: Context<UbeanEnv>, next: Next) {
    if (isExcluded(c.req.path, exclude)) {
      await next();
      return;
    }

    // 读取现有 session ID
    const cookieHeader = c.req.header('cookie');
    let sessionId = parseCookie(cookieHeader, cookieName);

    // cookie 模式下验证签名
    let cookieData: SessionData = {};
    if (sessionId && !store && secret) {
      const verified = verify(sessionId, secret);
      if (verified) {
        try {
          cookieData = JSON.parse(Buffer.from(verified, 'base64').toString('utf-8'));
          sessionId = undefined; // cookie 模式不需要单独 ID
        } catch {
          sessionId = undefined;
        }
      } else {
        sessionId = undefined;
      }
    }

    let session: SessionImpl;

    if (store) {
      // storage 模式
      if (!sessionId) {
        sessionId = generateId();
        session = new SessionImpl(sessionId, {}, store, ttl);
      } else {
        const data = await store.get(sessionId);
        session = new SessionImpl(sessionId, data || {}, store, ttl);
      }
    } else {
      // cookie 模式
      session = new SessionImpl(sessionId || generateId(), cookieData, null, ttl);
    }

    // 注入到 context
    (c as unknown as Record<string, unknown>)[SESSION_CONTEXT_KEY] = session;

    await next();

    // 响应后处理:保存或销毁 session
    if (session.isDestroyed) {
      // 设置过期 cookie
      c.header(
        'Set-Cookie',
        `${serializeCookie(cookieName, '', { ...cookieDefaults, path: cookieDefaults.path })}; Max-Age=0`
      );
    } else if (session.isDirty) {
      if (store) {
        // storage 模式:保存到 store + 设置 cookie(ID)
        await session.save();
        c.header('Set-Cookie', serializeCookie(cookieName, session.id, cookieDefaults));
      } else if (secret) {
        // cookie 模式:签名后设置 cookie
        const json = JSON.stringify(session.all());
        const encoded = Buffer.from(json, 'utf-8').toString('base64');
        const signed = sign(encoded, secret);
        c.header('Set-Cookie', serializeCookie(cookieName, signed, cookieDefaults));
      }
    }
  };
}

/**
 * 从 Hono Context 获取 session
 */
export function useSession<T extends SessionData = SessionData>(c: Context<UbeanEnv>): Session<T> | null {
  return ((c as unknown as Record<string, unknown>)[SESSION_CONTEXT_KEY] as Session<T>) || null;
}

/**
 * 定义 session store 别名
 */
export function defineSessionStore(store: SessionStore): SessionStore {
  return store;
}
