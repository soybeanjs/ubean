import type { Hono } from 'hono';
import { defu } from 'defu';
import type { UbeanAuthOptions, ResolvedAuthOptions, AuthSession, AuthClient, AuthError } from './types';

export const DEFAULT_AUTH_OPTIONS: ResolvedAuthOptions = {
  enabled: true,
  basePath: '/api/auth',
  baseURL: '',
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
    cookieName: 'ubean-auth-session',
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24
  },
  betterAuth: {}
};

export function resolveAuthOptions(options: UbeanAuthOptions = {}): ResolvedAuthOptions {
  return defu(
    {
      ...options,
      clientOptions: options.clientOptions || {},
      redirectTo: options.redirectTo || {},
      session: options.session || {}
    },
    DEFAULT_AUTH_OPTIONS
  ) as ResolvedAuthOptions;
}

let authInstance: {
  handler: ((req: Request) => Promise<Response>) | null;
  api: Record<string, (...args: unknown[]) => Promise<unknown>> | null;
  options: ResolvedAuthOptions | null;
} = {
  handler: null,
  api: null,
  options: null
};

function resetAuthInstance() {
  authInstance = { handler: null, api: null, options: null };
}

export function createAuthHandler(options: UbeanAuthOptions = {}): {
  handler: (request: Request) => Promise<Response>;
  resolveAuth: () => Promise<unknown>;
  getOptions: () => ResolvedAuthOptions;
} {
  const resolved = resolveAuthOptions(options);
  resetAuthInstance();
  authInstance.options = resolved;

  const hasBetterAuthConfig = !!(resolved.betterAuth && Object.keys(resolved.betterAuth).length > 0);

  async function initBetterAuth() {
    if (!hasBetterAuthConfig) {
      return createFallbackAuth(resolved);
    }
    try {
      const { betterAuth } = await import('better-auth');

      const betterAuthOpts = defu(resolved.betterAuth, {
        baseURL: resolved.baseURL || undefined,
        basePath: resolved.basePath,
        trustedOrigins: resolved.baseURL ? [resolved.baseURL] : [],
        session: {
          cookieName: resolved.session.cookieName,
          expiresIn: resolved.session.expiresIn,
          updateAge: resolved.session.updateAge
        },
        emailAndPassword: {
          enabled: true
        }
      });

      const auth = betterAuth(betterAuthOpts as any);
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

function createFallbackAuth(options: ResolvedAuthOptions) {
  const sessions = new Map<string, { userId: string; user: Record<string, unknown>; expiresAt: number }>();
  const users = new Map<string, Record<string, unknown>>();
  const basePath = options.basePath;

  function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
    return req.json().catch(() => ({}) as T);
  }

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  }

  function generateSessionToken(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function generateId(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  authInstance.handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (!pathname.startsWith(basePath)) {
      return new Response('Not found', { status: 404 });
    }

    const action = pathname.slice(basePath.length + 1);
    const method = req.method;

    if (action === 'sign-in/email' && method === 'POST') {
      const body = await parseBody<{ email: string; password: string }>(req);
      const user = Array.from(users.values()).find((u: any) => u.email === body.email);
      if (!user) return json({ message: 'Invalid credentials' }, 401);
      if ((user as any).password !== body.password) return json({ message: 'Invalid credentials' }, 401);
      const token = generateSessionToken();
      const session = { userId: user.id as string, user, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      sessions.set(token, session);
      return json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
        redirect: options.redirectTo.callback
      });
    }

    if (action === 'sign-up/email' && method === 'POST') {
      const body = await parseBody<{ email: string; password: string; name: string }>(req);
      const existing = Array.from(users.values()).find((u: any) => u.email === body.email);
      if (existing) return json({ message: 'User already exists' }, 400);
      const id = generateId();
      const user = {
        id,
        email: body.email,
        name: body.name,
        password: body.password,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.set(id, user);
      const token = generateSessionToken();
      sessions.set(token, { userId: id, user, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      return json({ token, user: { id, email: body.email, name: body.name }, redirect: options.redirectTo.callback });
    }

    if (action === 'sign-out' && method === 'POST') {
      const cookie = req.headers.get('cookie') || '';
      const token = cookie
        .split(';')
        .find(c => c.trim().startsWith(`${options.session.cookieName}=`))
        ?.split('=')[1];
      if (token) sessions.delete(token);
      return json({ success: true });
    }

    if (action === 'session' && method === 'GET') {
      const cookie = req.headers.get('cookie') || '';
      const authHeader = req.headers.get('authorization');
      let token = cookie
        .split(';')
        .find(c => c.trim().startsWith(`${options.session.cookieName}=`))
        ?.split('=')[1];
      if (!token && authHeader?.startsWith('Bearer ')) token = authHeader.slice(7);
      if (!token) return json({ session: null, user: null });
      const s = sessions.get(token);
      if (!s || s.expiresAt < Date.now()) {
        sessions.delete(token);
        return json({ session: null, user: null });
      }
      return json({
        session: { token, userId: s.userId, expiresAt: new Date(s.expiresAt).toISOString() },
        user: { id: s.user.id, email: (s.user as any).email, name: (s.user as any).name }
      });
    }

    if (action.startsWith('sign-in/social/')) {
      const provider = action.slice('sign-in/social/'.length);
      return json({ url: `${basePath}/callback/${provider}`, redirect: true });
    }

    if (action === 'update-user' && method === 'POST') {
      await parseBody(req);
      return json({ status: true });
    }

    if (action === 'ok') {
      return json({ ok: true });
    }

    return json({ message: 'Not found' }, 404);
  };

  return {
    handler: authInstance.handler,
    api: {
      async getSession({ headers }: { headers: Headers }) {
        const cookie = headers.get('cookie') || '';
        const token = cookie
          .split(';')
          .find(c => c.trim().startsWith(`${options.session.cookieName}=`))
          ?.split('=')[1];
        if (!token) return null;
        const s = sessions.get(token);
        if (!s || s.expiresAt < Date.now()) return null;
        return { session: { token }, user: s.user };
      }
    }
  };
}

export function registerAuthRoutes(app: Hono, authOptions: UbeanAuthOptions = {}) {
  const { handler, getOptions } = createAuthHandler(authOptions);
  const opts = getOptions();

  app.all(`${opts.basePath}/*`, async c => {
    const request = c.req.raw;
    const response = await handler(request);
    return response;
  });

  return { handler, getOptions };
}

export function createAuthClient(baseURL: string = '/api/auth'): AuthClient {
  async function fetchAPI<T = unknown>(path: string, init: RequestInit = {}): Promise<{ data?: T; error?: AuthError }> {
    try {
      const res = await fetch(`${baseURL}/${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...init.headers
        },
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: data as AuthError };
      }
      return { data: data as T };
    } catch (error) {
      return { error: { message: (error as Error).message } };
    }
  }

  return {
    async signIn(email: string, password: string, _opts?: { callbackURL?: string }) {
      return fetchAPI<AuthSession>('sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
    },
    async signUp(email: string, password: string, name: string, _opts?: { callbackURL?: string }) {
      return fetchAPI<AuthSession>('sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
      });
    },
    async signOut() {
      return fetchAPI<{ success: boolean }>('sign-out', { method: 'POST' });
    },
    async getSession() {
      const result = await fetchAPI<AuthSession>('session');
      return result.data || null;
    },
    async signInSocial(provider: string) {
      window.location.href = `${baseURL}/sign-in/social/${provider}`;
    },
    async sendVerificationEmail(email: string, _opts?: { callbackURL?: string }) {
      return fetchAPI<{ status: boolean }>('send-verification-email', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async resetPassword(newPassword: string, token: string) {
      return fetchAPI<{ status: boolean }>('reset-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, token })
      });
    },
    async forgetPassword(email: string, _opts?: { redirectTo?: string }) {
      return fetchAPI<{ status: boolean }>('forget-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async updateUser(data: Record<string, unknown>) {
      return fetchAPI<any>('update-user', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    async changeEmail(newEmail: string, _callbackURL?: string) {
      return fetchAPI<{ status: boolean }>('change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail })
      });
    },
    async changePassword(currentPassword: string, newPassword: string, _revokeOtherSessions?: boolean) {
      return fetchAPI<{ status: boolean }>('change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
    },
    async listSessions() {
      return fetchAPI<any[]>('list-sessions');
    },
    async revokeSession(sessionId: string) {
      return fetchAPI<{ status: boolean }>('revoke-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      });
    },
    async revokeSessions() {
      return fetchAPI<{ status: boolean }>('revoke-sessions', { method: 'POST' });
    }
  };
}

export function getServerSession(request: Request, authOptions: UbeanAuthOptions = {}): Promise<AuthSession | null> {
  const basePath = authOptions.basePath || DEFAULT_AUTH_OPTIONS.basePath;
  const url = new URL(request.url);
  const sessionURL = new URL(`${basePath}/session`, url.origin);
  return fetch(sessionURL, {
    headers: { cookie: request.headers.get('cookie') || '' }
  })
    .then(r => r.json())
    .then(data => {
      if (data?.session && data?.user) return data as AuthSession;
      return null;
    })
    .catch(() => null);
}
