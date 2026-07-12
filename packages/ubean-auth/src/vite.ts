import type { Plugin } from 'vite';
import { consola } from 'consola';
import { resolveAuthOptions } from './core';
import type { UbeanAuthOptions, ResolvedAuthOptions } from './types';

const VIRTUAL_AUTH_CLIENT_ID = 'virtual:ubean-auth/client';
const RESOLVED_VIRTUAL_AUTH_CLIENT_ID = `\0${VIRTUAL_AUTH_CLIENT_ID}`;

export function ubeanAuthPlugin(userOptions: UbeanAuthOptions = {}): Plugin {
  const options: ResolvedAuthOptions = resolveAuthOptions(userOptions);

  return {
    name: 'ubean:auth',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_AUTH_CLIENT_ID) return RESOLVED_VIRTUAL_AUTH_CLIENT_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_AUTH_CLIENT_ID) {
        return generateClientCode(options);
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
            const { createAuthHandler } = await import('./core');
            const { handler } = createAuthHandler(userOptions);

            const protocol = server.config.server.https ? 'https' : 'http';
            const host = req.headers.host || 'localhost';
            const fullUrl = `${protocol}://${host}${url}`;

            const request = new Request(fullUrl, {
              method: req.method,
              headers: new Headers(req.headers as Record<string, string>),
              body: req.method !== 'GET' && req.method !== 'HEAD' ? (req as any) : undefined,
              duplex: 'half'
            } as RequestInit);

            const response = await handler(request);

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

function createApiClient() {
  async function fetchApi(path, init = {}) {
    try {
      const res = await fetch(BASE_URL + '/' + path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init.headers || {})
        },
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: data };
      }
      return { data };
    } catch (err) {
      return { error: { message: err.message } };
    }
  }

  return {
    signIn(email, password, opts) {
      return fetchApi('sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password, callbackURL: opts?.callbackURL })
      });
    },
    signUp(email, password, name, opts) {
      return fetchApi('sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, callbackURL: opts?.callbackURL })
      });
    },
    async signOut() {
      return fetchApi('sign-out', { method: 'POST' });
    },
    async getSession() {
      const result = await fetchApi('session');
      return result.data || null;
    },
    signInSocial(provider) {
      if (typeof window !== 'undefined') {
        window.location.href = BASE_URL + '/sign-in/social/' + provider;
      }
    },
    async updateUser(data) {
      return fetchApi('update-user', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
  };
}

export const authClient = createApiClient();
export default authClient;
`;
}

export function defineAuthConfig(options: UbeanAuthOptions): UbeanAuthOptions {
  return options;
}

export default ubeanAuthPlugin;
