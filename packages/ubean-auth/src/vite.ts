import type { Plugin } from 'vite';
import { consola } from 'consola';
import { resolveAuthOptions } from './core';
import type { UbeanAuthOptions, ResolvedAuthOptions } from './types';

const VIRTUAL_AUTH_CLIENT_ID = 'virtual:ubean-auth/client';
const RESOLVED_VIRTUAL_AUTH_CLIENT_ID = `\0${VIRTUAL_AUTH_CLIENT_ID}`;
const VIRTUAL_AUTH_SERVER_ID = 'virtual:ubean-auth/server';
const RESOLVED_VIRTUAL_AUTH_SERVER_ID = `\0${VIRTUAL_AUTH_SERVER_ID}`;

export function ubeanAuthPlugin(userOptions: UbeanAuthOptions = {}): Plugin {
  const options: ResolvedAuthOptions = resolveAuthOptions(userOptions);
  let authHandlerInstance: ReturnType<typeof import('./core').createAuthHandler> | null = null;

  return {
    name: 'ubean:auth',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_AUTH_CLIENT_ID) return RESOLVED_VIRTUAL_AUTH_CLIENT_ID;
      if (id === VIRTUAL_AUTH_SERVER_ID) return RESOLVED_VIRTUAL_AUTH_SERVER_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_AUTH_CLIENT_ID) {
        return generateClientCode(options);
      }
      if (id === RESOLVED_VIRTUAL_AUTH_SERVER_ID) {
        return generateServerCode(options);
      }
      return null;
    },

    configureServer(server) {
      if (!options.enabled) return;

      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith(options.basePath)) return next();

        Promise.resolve()
          .then(async () => {
            if (!authHandlerInstance) {
              const { createAuthHandler } = await import('./core');
              authHandlerInstance = createAuthHandler(userOptions);
              await authHandlerInstance.resolveAuth();
            }

            const protocol = server.config.server.https ? 'https' : 'http';
            const host = req.headers.host || 'localhost';
            const fullUrl = `${protocol}://${host}${url}`;

            const request = new Request(fullUrl, {
              method: req.method,
              headers: new Headers(req.headers as Record<string, string>),
              body: req.method !== 'GET' && req.method !== 'HEAD' ? (req as unknown as BodyInit) : undefined,
              duplex: 'half'
            } as RequestInit);

            const response = await authHandlerInstance.handler(request);

            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            const text = await response.text();
            res.end(text);
          })
          .catch(error => {
            consola.error('[auth] Error handling auth request:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal auth error' }));
          });
      });

      consola.success(`[auth] Better Auth routes mounted at ${options.basePath}/*`);
    }
  };
}

function generateClientCode(options: ResolvedAuthOptions): string {
  return `
const BASE_URL = ${JSON.stringify(options.basePath)};

async function authFetch(path, init = {}) {
  const res = await fetch(BASE_URL + path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init
  });
  if (!res.ok) {
    let err = { message: res.statusText };
    try { err = await res.json(); } catch (_) {}
    throw err;
  }
  return res.json().catch(() => null);
}

function buildBody(body) {
  return { method: 'POST', body: body ? JSON.stringify(body) : undefined };
}

export const authClient = {
  signIn: {
    email: async ({ email, password, callbackURL, rememberMe }) => {
      try {
        const data = await authFetch('/sign-in/email', buildBody({ email, password, rememberMe }));
        if (callbackURL && typeof window !== 'undefined') window.location.href = callbackURL;
        return { data };
      } catch (error) { return { error }; }
    },
    social: (provider, opts) => {
      if (typeof window === 'undefined') return Promise.resolve();
      const redirect = opts?.callbackURL || window.location.href;
      window.location.href = BASE_URL + '/sign-in/social/' + provider + '?callbackURL=' + encodeURIComponent(redirect);
      return Promise.resolve();
    }
  },
  signUp: {
    email: async ({ email, password, name, callbackURL }) => {
      try {
        const data = await authFetch('/sign-up/email', buildBody({ email, password, name }));
        if (callbackURL && typeof window !== 'undefined') window.location.href = callbackURL;
        return { data };
      } catch (error) { return { error }; }
    }
  },
  signOut: async () => {
    try { const data = await authFetch('/sign-out', buildBody()); return { data }; }
    catch (error) { return { error }; }
  },
  getSession: async () => {
    try { return await authFetch('/get-session'); } catch (_) { return null; }
  },
  forgetPassword: async (email, opts) => {
    try { const data = await authFetch('/forget-password', buildBody({ email, ...opts })); return { data }; }
    catch (error) { return { error }; }
  },
  resetPassword: async (newPassword, token) => {
    try { const data = await authFetch('/reset-password', buildBody({ newPassword, token })); return { data }; }
    catch (error) { return { error }; }
  },
  updateUser: async (data) => {
    try { const r = await authFetch('/update-user', buildBody(data)); return { data: r.user }; }
    catch (error) { return { error }; }
  },
  changePassword: async (currentPassword, newPassword, revokeOtherSessions) => {
    try { const data = await authFetch('/change-password', buildBody({ currentPassword, newPassword, revokeOtherSessions })); return { data }; }
    catch (error) { return { error }; }
  },
  listSessions: async () => {
    try { const d = await authFetch('/list-sessions'); return { data: d.sessions }; }
    catch (error) { return { error }; }
  },
  revokeSession: async (sessionId) => {
    try { const data = await authFetch('/revoke-session', buildBody({ sessionId })); return { data }; }
    catch (error) { return { error }; }
  },
  revokeSessions: async () => {
    try { const data = await authFetch('/revoke-sessions', buildBody()); return { data }; }
    catch (error) { return { error }; }
  },
  $fetch: (input, init) => fetch(input, { credentials: 'include', ...init })
};
export default authClient;
`;
}

function generateServerCode(_options: ResolvedAuthOptions): string {
  return `
export { createAuthHandler, authMiddleware, getUser, getSession, requireAuth, getServerSession, defineAuth } from 'ubean-auth/core';
`;
}

export function defineAuthConfig(options: UbeanAuthOptions): UbeanAuthOptions {
  return options;
}

export default ubeanAuthPlugin;
