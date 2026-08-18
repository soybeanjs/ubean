/**
 * Browser-safe auth client (fetch-based).
 *
 * Split from `./core` so that the `@ubean/auth/runtime` entry (consumed by
 * browser bundles) does not transitively pull in `node:async_hooks`.
 * `./core` remains the server-side entry (ALS request context, better-auth
 * handler, middleware).
 */
import type { Session, User } from 'better-auth';
import type { AuthClient, AuthError, AuthSession } from './types';

export function createAuthClient(basePath: string = '/api/auth'): AuthClient {
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
