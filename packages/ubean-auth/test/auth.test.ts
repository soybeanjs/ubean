import { describe, it, expect } from 'vitest';
import { resolveAuthOptions, DEFAULT_AUTH_OPTIONS, createAuthHandler, createAuthClient } from '../src/core';
import type { UbeanAuthOptions } from '../src/types';

describe('ubean-auth core', () => {
  describe('resolveAuthOptions', () => {
    it('returns defaults when no options provided', () => {
      const opts = resolveAuthOptions();
      expect(opts.enabled).toBe(true);
      expect(opts.basePath).toBe('/api/auth');
      expect(opts.redirectTo.login).toBe('/login');
      expect(opts.redirectTo.signup).toBe('/signup');
      expect(opts.session.cookieName).toBe('ubean-auth-session');
      expect(opts.session.expiresIn).toBe(60 * 60 * 24 * 7);
    });

    it('merges custom options with defaults', () => {
      const custom: UbeanAuthOptions = {
        basePath: '/auth',
        baseURL: 'https://example.com',
        redirectTo: {
          login: '/signin',
          callback: '/dashboard'
        },
        session: {
          cookieName: 'my-session',
          expiresIn: 3600
        }
      };
      const opts = resolveAuthOptions(custom);
      expect(opts.basePath).toBe('/auth');
      expect(opts.baseURL).toBe('https://example.com');
      expect(opts.redirectTo.login).toBe('/signin');
      expect(opts.redirectTo.signup).toBe('/signup');
      expect(opts.redirectTo.callback).toBe('/dashboard');
      expect(opts.session.cookieName).toBe('my-session');
      expect(opts.session.expiresIn).toBe(3600);
    });

    it('disables auth when enabled is false', () => {
      const opts = resolveAuthOptions({ enabled: false });
      expect(opts.enabled).toBe(false);
    });
  });

  describe('DEFAULT_AUTH_OPTIONS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_AUTH_OPTIONS.basePath).toBe('/api/auth');
      expect(DEFAULT_AUTH_OPTIONS.enabled).toBe(true);
      expect(DEFAULT_AUTH_OPTIONS.session.expiresIn).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('createAuthHandler', () => {
    it('creates handler with fallback implementation', async () => {
      const { handler, getOptions } = createAuthHandler();
      expect(typeof handler).toBe('function');
      expect(getOptions().basePath).toBe('/api/auth');
    });

    it('handles sign-up and sign-in via fallback', async () => {
      const { handler } = createAuthHandler({ basePath: '/api/auth' });

      const signUpReq = new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'secret123', name: 'Test User' })
      });

      const signUpRes = await handler(signUpReq);
      expect(signUpRes.status).toBe(200);
      const signUpData = await signUpRes.json();
      expect(signUpData.token).toBeDefined();
      expect(signUpData.user.email).toBe('test@example.com');
      expect(signUpData.user.name).toBe('Test User');

      const signInReq = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'secret123' })
      });

      const signInRes = await handler(signInReq);
      expect(signInRes.status).toBe(200);
      const signInData = await signInRes.json();
      expect(signInData.token).toBeDefined();
      expect(signInData.user.email).toBe('test@example.com');
    });

    it('returns 401 for invalid credentials', async () => {
      const { handler } = createAuthHandler();

      const req = new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nope@example.com', password: 'wrong' })
      });

      const res = await handler(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 for duplicate sign-up', async () => {
      const { handler } = createAuthHandler();

      const firstReq = new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'dup@example.com', password: 'pass', name: 'Dup' })
      });
      await handler(firstReq);

      const secondReq = new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'dup@example.com', password: 'pass', name: 'Dup' })
      });
      const res = await handler(secondReq);
      expect(res.status).toBe(400);
    });

    it('handles session endpoint returning null when not authenticated', async () => {
      const { handler } = createAuthHandler();

      const req = new Request('http://localhost/api/auth/session');
      const res = await handler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session).toBeNull();
      expect(data.user).toBeNull();
    });

    it('handles sign-out', async () => {
      const { handler } = createAuthHandler();

      const signUpReq = new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'logout@example.com', password: 'pass', name: 'Logout' })
      });
      await handler(signUpReq);

      const signOutReq = new Request('http://localhost/api/auth/sign-out', {
        method: 'POST'
      });
      const res = await handler(signOutReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns ok for health check', async () => {
      const { handler } = createAuthHandler();
      const req = new Request('http://localhost/api/auth/ok');
      const res = await handler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('returns 404 for unknown routes', async () => {
      const { handler } = createAuthHandler();
      const req = new Request('http://localhost/api/auth/unknown');
      const res = await handler(req);
      expect(res.status).toBe(404);
    });
  });

  describe('createAuthClient', () => {
    it('creates a client with auth methods', () => {
      const client = createAuthClient('/api/auth');
      expect(typeof client.signIn).toBe('function');
      expect(typeof client.signUp).toBe('function');
      expect(typeof client.signOut).toBe('function');
      expect(typeof client.getSession).toBe('function');
      expect(typeof client.signInSocial).toBe('function');
      expect(typeof client.updateUser).toBe('function');
      expect(typeof client.forgetPassword).toBe('function');
      expect(typeof client.resetPassword).toBe('function');
      expect(typeof client.listSessions).toBe('function');
      expect(typeof client.revokeSession).toBe('function');
      expect(typeof client.revokeSessions).toBe('function');
    });
  });
});
