import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, MiddlewareHandler } from 'hono';
import { defu } from 'defu';
import { getLogger } from '@ubean/logger';
import type { BetterAuthOptions, Session, User } from 'better-auth';
import type {
  AuthClient,
  AuthError,
  AuthSession,
  AuthState,
  AuthUser,
  ResolvedAuthOptions,
  UbeanAuthOptions
} from './types';

const logger = getLogger('auth');

const AUTH_CONTEXT_SYMBOL = Symbol.for('ubean.authContext.v1');

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
}

function getAuthAsyncLocalStorage(): AsyncLocalStorage<AuthStore> {
  const g = globalThis as typeof globalThis & {
    [AUTH_CONTEXT_SYMBOL]?: AsyncLocalStorage<AuthStore>;
  };
  if (!g[AUTH_CONTEXT_SYMBOL]) {
    g[AUTH_CONTEXT_SYMBOL] = new AsyncLocalStorage<AuthStore>();
  }
  return g[AUTH_CONTEXT_SYMBOL]!;
}

const authContext = getAuthAsyncLocalStorage();

const authInstance: {
  handler: ((req: Request) => Promise<Response>) | null;
  api: Record<string, (...args: unknown[]) => Promise<unknown>> | null;
  options: ResolvedAuthOptions | null;
} = {
  handler: null,
  api: null,
  options: null
};

function resetAuthInstance() {
  authInstance.handler = null;
  authInstance.api = null;
  authInstance.options = null;
}

function resolveAuthOptions(options: UbeanAuthOptions = {}): ResolvedAuthOptions {
  return defu(options, {
    enabled: true,
    basePath: '/api/auth',
    baseURL: '',
    secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || 'ubean-dev-secret-change-me',
    clientOptions: {
      fetchOptions: {},
      plugins: []
    },
    redirectTo: {
      login: '/login',
      signup: '/signup',
      callback: '/'
    },
    session: {
      cookieName: 'ubean_session',
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    }
  }) as ResolvedAuthOptions;
}

function defineAuth(
  config: UbeanAuthOptions | ((ctx: { defaults: BetterAuthOptions }) => UbeanAuthOptions)
): UbeanAuthOptions {
  if (typeof config === 'function') {
    const defaults: BetterAuthOptions = {
      basePath: '/api/auth',
      emailAndPassword: { enabled: true }
    };
    return config({ defaults });
  }
  return config;
}

function createFallbackAuth(resolved: ResolvedAuthOptions) {
  logger.warn('[auth] better-auth not installed, using minimal fallback auth implementation');
  logger.warn('[auth] Install better-auth with: pnpm add better-auth');

  const users = new Map<string, { id: string; email: string; password: string; name: string; createdAt: Date }>();
  const sessions = new Map<string, { userId: string; token: string; expiresAt: Date }>();

  function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  function hashPassword(password: string): string {
    return Buffer.from(password).toString('base64');
  }

  function createSession(userId: string): { token: string; expiresAt: Date } {
    const token = generateId();
    const expiresAt = new Date(Date.now() + resolved.session.expiresIn * 1000);
    sessions.set(token, { userId, token, expiresAt });
    return { token, expiresAt };
  }

  function findSessionByToken(token: string | undefined) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  const fallbackHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(resolved.basePath, '');
    const method = request.method;

    const setSessionCookie = (token: string | null, expiresAt?: Date) => {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (token) {
        headers.append(
          'set-cookie',
          `${resolved.session.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt?.toUTCString()}`
        );
      } else {
        headers.append('set-cookie', `${resolved.session.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      }
      return headers;
    };

    const getTokenFromCookie = (req: Request) => {
      const cookie = req.headers.get('cookie') || '';
      const match = cookie.match(new RegExp(`${resolved.session.cookieName}=([^;]+)`));
      return match?.[1];
    };

    try {
      if (path === '/sign-up/email' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { email, password, name } = body as { email: string; password: string; name: string };
        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
        for (const [, u] of users) {
          if (u.email === email) {
            return new Response(JSON.stringify({ error: 'User already exists' }), {
              status: 400,
              headers: { 'content-type': 'application/json' }
            });
          }
        }
        const id = generateId();
        users.set(id, {
          id,
          email,
          password: hashPassword(password),
          name: name || email.split('@')[0],
          createdAt: new Date()
        });
        const { token, expiresAt } = createSession(id);
        const user = users.get(id)!;
        return new Response(
          JSON.stringify({
            token,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: false,
              createdAt: user.createdAt,
              updatedAt: user.createdAt
            }
          }),
          { status: 200, headers: setSessionCookie(token, expiresAt) }
        );
      }

      if (path === '/sign-in/email' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { email, password } = body as { email: string; password: string };
        let foundUser: { id: string; email: string; password: string; name: string; createdAt: Date } | null = null;
        for (const [, u] of users) {
          if (u.email === email && u.password === hashPassword(password)) {
            foundUser = u;
            break;
          }
        }
        if (!foundUser) {
          return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
          });
        }
        const { token, expiresAt } = createSession(foundUser.id);
        return new Response(
          JSON.stringify({
            token,
            user: {
              id: foundUser.id,
              email: foundUser.email,
              name: foundUser.name,
              emailVerified: false,
              createdAt: foundUser.createdAt,
              updatedAt: foundUser.createdAt
            }
          }),
          { status: 200, headers: setSessionCookie(token, expiresAt) }
        );
      }

      if (path === '/sign-out' && method === 'POST') {
        const token = getTokenFromCookie(request);
        if (token) sessions.delete(token);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: setSessionCookie(null)
        });
      }

      if (path === '/get-session' && method === 'GET') {
        const token = getTokenFromCookie(request);
        const session = findSessionByToken(token);
        if (!session) {
          return new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const u = users.get(session.userId)!;
        return new Response(
          JSON.stringify({
            session: {
              id: session.token,
              userId: u.id,
              token: session.token,
              expiresAt: session.expiresAt,
              createdAt: new Date(),
              updatedAt: new Date()
            },
            user: {
              id: u.id,
              email: u.email,
              name: u.name,
              emailVerified: false,
              createdAt: u.createdAt,
              updatedAt: u.createdAt
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  };

  authInstance.handler = fallbackHandler;
  authInstance.api = {
    getSession: (async (headersInput: unknown) => {
      const headers = headersInput instanceof Headers ? headersInput : new Headers(headersInput as HeadersInit);
      const cookie = headers.get('cookie') || '';
      const match = cookie.match(new RegExp(`${resolved.session.cookieName}=([^;]+)`));
      const session = findSessionByToken(match?.[1]);
      if (!session) return null;
      const u = users.get(session.userId);
      if (!u) return null;
      return {
        session: {
          id: session.token,
          userId: u.id,
          token: session.token,
          expiresAt: session.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          emailVerified: false,
          createdAt: u.createdAt,
          updatedAt: u.createdAt
        }
      };
    }) as (...args: unknown[]) => Promise<unknown>
  };
  return { handler: fallbackHandler, api: authInstance.api };
}

export function createAuthHandler(options: UbeanAuthOptions = {}): {
  handler: (request: Request) => Promise<Response>;
  resolveAuth: () => Promise<unknown>;
  getOptions: () => ResolvedAuthOptions;
} {
  const resolved = resolveAuthOptions(options);
  resetAuthInstance();
  authInstance.options = resolved;

  const hasBetterAuthConfig =
    !!(resolved.betterAuth && Object.keys(resolved.betterAuth).length > 0) || !!resolved.database;

  async function initBetterAuth() {
    if (!hasBetterAuthConfig) {
      return createFallbackAuth(resolved);
    }
    try {
      const { betterAuth } = await import('better-auth');

      const defaults: BetterAuthOptions = {
        baseURL: resolved.baseURL || undefined,
        basePath: resolved.basePath,
        secret: resolved.secret,
        trustedOrigins: resolved.baseURL ? [resolved.baseURL] : [],
        database: resolved.database,
        session: {
          expiresIn: resolved.session.expiresIn,
          updateAge: resolved.session.updateAge
        } as BetterAuthOptions['session'],
        emailAndPassword: {
          enabled: true
        }
      };

      let betterAuthOpts: BetterAuthOptions;
      if (typeof options.betterAuth === 'function') {
        betterAuthOpts = options.betterAuth({ defaults });
      } else {
        betterAuthOpts = defu(options.betterAuth, defaults);
      }

      const auth = betterAuth(betterAuthOpts);
      authInstance.handler = auth.handler as unknown as (req: Request) => Promise<Response>;
      authInstance.api = auth.api as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return auth;
    } catch {
      return createFallbackAuth(resolved);
    }
  }

  let initPromise: Promise<unknown> | null = null;

  async function resolveAuth() {
    if (!initPromise) {
      initPromise = initBetterAuth();
    }
    return initPromise;
  }

  async function handler(request: Request): Promise<Response> {
    await resolveAuth();
    if (authInstance.handler) {
      return authInstance.handler(request);
    }
    return new Response(JSON.stringify({ error: 'Auth handler not initialized' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  return { handler, resolveAuth, getOptions: () => resolved };
}

export function authMiddleware(): MiddlewareHandler {
  return async (c: Context, next) => {
    const opts = authInstance.options || resolveAuthOptions();
    try {
      const request = c.req.raw;
      const cookie = request.headers.get('cookie') || '';
      const sessionCookieMatch = cookie.match(new RegExp(`${opts.session.cookieName}=([^;]+)`));
      const authHeader = request.headers.get('authorization') || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = sessionCookieMatch?.[1] || bearerMatch?.[1];

      let user: AuthUser | null = null;
      let session: Session | null = null;

      await (authInstance.handler
        ? Promise.resolve()
        : Promise.resolve(createAuthHandler(opts)).then(({ resolveAuth }) => resolveAuth()));

      if (authInstance.api?.getSession && token) {
        try {
          const headers = new Headers({ cookie: `${opts.session.cookieName}=${token}` });
          const result = (await authInstance.api.getSession(headers)) as AuthSession | null;
          if (result) {
            session = result.session;
            user = result.user as unknown as AuthUser;
          }
        } catch {
          // silent
        }
      }

      if (user) c.set('user', user);
      if (session) c.set('session', session);

      await authContext.run({ user, session }, next);
    } catch {
      await next();
    }
  };
}

export function getUser(): AuthUser | null {
  return authContext.getStore()?.user ?? null;
}

export function getSession(): AuthState | null {
  const store = authContext.getStore();
  if (!store?.user || !store?.session) return null;
  return { user: store.user, session: store.session };
}

export function requireAuth(c?: Context): AuthUser {
  if (c) {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      const err = new Error('Unauthorized');
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    return user;
  }
  const user = getUser();
  if (!user) {
    const err = new Error('Unauthorized');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return user;
}

function createAuthClient(basePath: string = '/api/auth'): AuthClient {
  async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${basePath}${path}`, {
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init?.headers },
      ...init
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ message: res.statusText }))) as AuthError;
      throw err;
    }
    return (await res.json().catch(() => null)) as T;
  }

  function buildFetchOptions(body?: unknown): RequestInit {
    return {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    };
  }

  return {
    signIn: {
      email: async ({ email, password, callbackURL, rememberMe }) => {
        try {
          const data = await authFetch<AuthSession>(
            '/sign-in/email',
            buildFetchOptions({ email, password, rememberMe })
          );
          if (callbackURL && typeof window !== 'undefined') {
            window.location.href = callbackURL;
          }
          return { data };
        } catch (error) {
          return { error: error as AuthError };
        }
      },
      social: (provider: string, opts?: { callbackURL?: string }) => {
        if (typeof window === 'undefined') return Promise.resolve();
        const redirect = opts?.callbackURL || window.location.href;
        window.location.href = `${basePath}/sign-in/social/${provider}?callbackURL=${encodeURIComponent(redirect)}`;
        return Promise.resolve();
      }
    },
    signUp: {
      email: async ({ email, password, name, callbackURL }) => {
        try {
          const data = await authFetch<AuthSession>('/sign-up/email', buildFetchOptions({ email, password, name }));
          if (callbackURL && typeof window !== 'undefined') {
            window.location.href = callbackURL;
          }
          return { data };
        } catch (error) {
          return { error: error as AuthError };
        }
      }
    },
    signOut: async () => {
      try {
        const data = await authFetch<{ success: boolean }>('/sign-out', buildFetchOptions());
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    getSession: async () => {
      try {
        return await authFetch<AuthSession>('/get-session');
      } catch {
        return null;
      }
    },
    sendVerificationEmail: async (email, opts) => {
      try {
        const data = await authFetch<{ status: boolean }>(
          '/send-verification-email',
          buildFetchOptions({ email, ...opts })
        );
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    resetPassword: async (newPassword, token) => {
      try {
        const data = await authFetch<{ status: boolean }>('/reset-password', buildFetchOptions({ newPassword, token }));
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    forgetPassword: async (email, opts) => {
      try {
        const data = await authFetch<{ status: boolean }>('/forget-password', buildFetchOptions({ email, ...opts }));
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    updateUser: async data => {
      try {
        const result = await authFetch<{ user: User }>('/update-user', buildFetchOptions(data));
        return { data: result.user };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    changeEmail: async (newEmail, callbackURL) => {
      try {
        const data = await authFetch<{ status: boolean }>(
          '/change-email',
          buildFetchOptions({ newEmail, callbackURL })
        );
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    changePassword: async (currentPassword, newPassword, revokeOtherSessions) => {
      try {
        const data = await authFetch<{ status: boolean }>(
          '/change-password',
          buildFetchOptions({ currentPassword, newPassword, revokeOtherSessions })
        );
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    listSessions: async () => {
      try {
        const data = await authFetch<{ sessions: Session[] }>('/list-sessions');
        return { data: data.sessions };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    revokeSession: async sessionId => {
      try {
        const data = await authFetch<{ status: boolean }>('/revoke-session', buildFetchOptions({ sessionId }));
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    revokeSessions: async () => {
      try {
        const data = await authFetch<{ status: boolean }>('/revoke-sessions', buildFetchOptions());
        return { data };
      } catch (error) {
        return { error: error as AuthError };
      }
    },
    $fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { credentials: 'include', ...init })
  };
}

export async function getServerSession(req?: Request): Promise<AuthSession | null> {
  if (!authInstance.handler) {
    createAuthHandler();
  }
  await new Promise<void>(resolve => {
    if (authInstance.handler) {
      resolve();
    } else {
      setTimeout(() => resolve(), 100);
    }
  });
  const current = authContext.getStore();
  if (current?.user && current?.session) {
    return { session: current.session, user: current.user as unknown as User };
  }
  if (req && authInstance.api?.getSession) {
    try {
      const result = (await authInstance.api.getSession(req.headers)) as AuthSession | null;
      return result;
    } catch {
      return null;
    }
  }
  return null;
}

export { defineAuth, createAuthClient, resolveAuthOptions };
export type { AuthUser, AuthState, AuthSession, AuthClient, AuthError };
