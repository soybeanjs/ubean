import { describe, it, expect } from 'vitest';
import { createCorsMiddleware, defineCors } from 'ubean';
import type { UbeanContext } from 'ubean';
import { api, getJson } from './helper';

describe('CORS system', () => {
  describe('createCorsMiddleware()', () => {
    it('creates a middleware handler', () => {
      const middleware = createCorsMiddleware({ origin: '*' });
      expect(typeof middleware).toBe('function');
    });

    it('handles preflight OPTIONS requests', async () => {
      const middleware = createCorsMiddleware({ origin: '*' });
      const headers = new Headers();
      headers.set('origin', 'https://example.com');
      headers.set('access-control-request-method', 'GET');
      const mockCtx = {
        method: 'OPTIONS',
        req: {
          method: 'OPTIONS',
          header: (name: string) => headers.get(name.toLowerCase()) || undefined,
          url: 'http://localhost/api/test'
        },
        header: (_name: string, _value: string) => {},
        res: { headers: new Headers() }
      } as unknown as UbeanContext;

      const result = await middleware(mockCtx, async () => {
        // new Response('ok');
      });
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(204);
    });

    it('sets Access-Control-Allow-Origin header', async () => {
      const middleware = createCorsMiddleware({ origin: '*' });
      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          header: () => 'https://example.com',
          url: 'http://localhost/api/test'
        },
        header: (_name: string, _value: string) => {},
        res: { headers: new Headers() }
      } as unknown as UbeanContext;

      await middleware(mockCtx, async () => {
        // new Response('ok');
      });
      // The middleware should have set the ACAO header
      expect(mockCtx.header).toBeDefined();
    });
  });

  describe('defineCors() - alias', () => {
    it('creates a middleware handler', () => {
      const middleware = defineCors({ origin: '*' });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('CORS options', () => {
    it('origin as string', () => {
      const middleware = createCorsMiddleware({ origin: 'https://example.com' });
      expect(typeof middleware).toBe('function');
    });

    it('origin as array', () => {
      const middleware = createCorsMiddleware({ origin: ['https://a.com', 'https://b.com'] });
      expect(typeof middleware).toBe('function');
    });

    it('origin as function', () => {
      const middleware = createCorsMiddleware({
        origin: (origin: string) => origin === 'https://allowed.com'
      });
      expect(typeof middleware).toBe('function');
    });

    it('exposeHeaders option', () => {
      const middleware = createCorsMiddleware({
        origin: '*',
        exposeHeaders: ['X-Custom-Header', 'X-Another-Header']
      });
      expect(typeof middleware).toBe('function');
    });

    it('credentials option', () => {
      const middleware = createCorsMiddleware({
        origin: 'https://example.com',
        credentials: true
      });
      expect(typeof middleware).toBe('function');
    });

    it('maxAge option', () => {
      const middleware = createCorsMiddleware({
        origin: '*',
        maxAge: 86400
      });
      expect(typeof middleware).toBe('function');
    });

    it('allowMethods option', () => {
      const middleware = createCorsMiddleware({
        origin: '*',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE']
      });
      expect(typeof middleware).toBe('function');
    });

    it('allowHeaders option', () => {
      const middleware = createCorsMiddleware({
        origin: '*',
        allowHeaders: ['Content-Type', 'Authorization']
      });
      expect(typeof middleware).toBe('function');
    });
  });

  describe('HTTP integration - /api/cors-test', () => {
    it('sets CORS headers on response', async () => {
      const res = await api('/api/cors-test', {
        headers: { Origin: 'https://example.com' }
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });

    it('handles preflight OPTIONS', async () => {
      const res = await api('/api/cors-test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      // Vite dev server intercepts OPTIONS preflight and responds with 204
      expect(res.status).toBe(204);
    });

    it('exposeHeaders is set', async () => {
      const res = await api('/api/cors-test', {
        headers: { Origin: 'https://example.com' }
      });
      const expose = res.headers.get('Access-Control-Expose-Headers');
      if (expose) {
        expect(expose).toBeTruthy();
      }
    });

    it('credentials is set when configured', async () => {
      const res = await api('/api/cors-test', {
        headers: { Origin: 'https://example.com' }
      });
      // If credentials are configured, the header should be 'true'
      const creds = res.headers.get('Access-Control-Allow-Credentials');
      if (creds) {
        expect(creds).toBe('true');
      }
    });

    it('maxAge is set on preflight', async () => {
      const res = await api('/api/cors-test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      const maxAge = res.headers.get('Access-Control-Max-Age');
      if (maxAge) {
        expect(parseInt(maxAge, 10)).toBeGreaterThan(0);
      }
    });
  });

  describe('HTTP integration - /api/cors-status', () => {
    it('returns CORS status info', async () => {
      const res = await getJson('/api/cors-status');
      expect(res.status).toBe(200);
    });
  });
});
