/**
 * P9-12 CSRF 保护中间件 & P9-13 安全头中间件 —— 单元测试
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  createCsrfMiddleware,
  defineCsrf,
  generateCsrfToken,
  createSecurityHeadersMiddleware,
  defineSecurityHeaders,
  serializeCsp
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* 工具：创建测试 app 并发请求                                                  */
/* -------------------------------------------------------------------------- */

function createTestApp(middleware: any) {
  const app = new Hono();
  app.use('*', middleware);
  app.get('/', c => c.json({ ok: true }));
  app.post('/', c => c.json({ ok: true, method: 'POST' }));
  return app;
}

function extractSetCookie(headers: Headers): string | null {
  return headers.get('set-cookie');
}

function parseCookieValue(setCookie: string | undefined, name: string): string | undefined {
  if (!setCookie) return undefined;
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

/* -------------------------------------------------------------------------- */
/* P9-12: CSRF 保护中间件                                                      */
/* -------------------------------------------------------------------------- */

describe('P9-12: CSRF Protection Middleware', () => {
  describe('generateCsrfToken', () => {
    it('generates a non-empty string', () => {
      const token = generateCsrfToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCsrfToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('respects length parameter', () => {
      const short = generateCsrfToken(16);
      const long = generateCsrfToken(64);
      expect(short.length).toBeLessThan(long.length);
    });
  });

  describe('createCsrfMiddleware - token mode (default)', () => {
    it('sets CSRF cookie on safe methods (GET)', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
      const setCookie = extractSetCookie(res.headers);
      expect(setCookie).toContain('ubean_csrf=');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('SameSite=lax');
    });

    it('does not set cookie if already present', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const res = await app.request('http://example.com/', {
        headers: { cookie: 'ubean_csrf=existing-token' }
      });
      expect(res.status).toBe(200);
      expect(extractSetCookie(res.headers)).toBeNull();
    });

    it('blocks POST without token', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const res = await app.request('http://example.com/', {
        method: 'POST'
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('CSRF Token Invalid');
    });

    it('blocks POST with mismatched token', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          cookie: 'ubean_csrf=cookie-token',
          'x-csrf-token': 'different-header-token'
        }
      });
      expect(res.status).toBe(403);
    });

    it('allows POST with matching token (header)', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const token = 'matching-token';
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          cookie: `ubean_csrf=${token}`,
          'x-csrf-token': token
        }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.method).toBe('POST');
    });

    it('allows POST with matching token (form body)', async () => {
      const app = createTestApp(createCsrfMiddleware());
      const token = 'form-token';
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          cookie: `ubean_csrf=${token}`,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: `csrfToken=${token}&data=test`
      });
      expect(res.status).toBe(200);
    });

    it('uses custom header name', async () => {
      const app = createTestApp(createCsrfMiddleware({ headerName: 'x-xsrf-token' }));
      const token = 'custom-token';
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          cookie: `ubean_csrf=${token}`,
          'x-xsrf-token': token
        }
      });
      expect(res.status).toBe(200);
    });

    it('uses custom cookie name', async () => {
      const app = createTestApp(createCsrfMiddleware({ cookieName: 'my_csrf' }));
      const res = await app.request('http://example.com/');
      const setCookie = extractSetCookie(res.headers);
      expect(setCookie).toContain('my_csrf=');

      const token = parseCookieValue(setCookie, 'my_csrf');
      const postRes = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          cookie: `my_csrf=${token}`,
          'x-csrf-token': token!
        }
      });
      expect(postRes.status).toBe(200);
    });

    it('respects exclude paths', async () => {
      const appWithRoute = new Hono();
      appWithRoute.use('*', createCsrfMiddleware({ exclude: ['/api/webhook/**'] }));
      appWithRoute.post('/api/webhook/test', c => c.json({ ok: true }));

      const res = await appWithRoute.request('http://example.com/api/webhook/test', {
        method: 'POST'
      });
      expect(res.status).toBe(200);
    });

    it('supports custom error handler', async () => {
      const app = createTestApp(
        createCsrfMiddleware({
          handler: c => c.json({ custom: 'error' }, 418)
        })
      );
      const res = await app.request('http://example.com/', { method: 'POST' });
      expect(res.status).toBe(418);
      const body = await res.json();
      expect(body.custom).toBe('error');
    });

    it('supports custom token generator', async () => {
      const customGen = vi.fn(() => 'custom-generated-token');
      const app = createTestApp(createCsrfMiddleware({ generateToken: customGen }));
      const res = await app.request('http://example.com/');
      expect(customGen).toHaveBeenCalled();
      const setCookie = extractSetCookie(res.headers);
      expect(setCookie).toContain('custom-generated-token');
    });

    it('supports secure cookie options', async () => {
      const app = createTestApp(
        createCsrfMiddleware({ cookie: { secure: true, sameSite: 'strict', domain: 'example.com' } })
      );
      const res = await app.request('http://example.com/');
      const setCookie = extractSetCookie(res.headers);
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=strict');
      expect(setCookie).toContain('Domain=example.com');
    });
  });

  describe('createCsrfMiddleware - origin mode', () => {
    it('allows same-origin POST', async () => {
      const app = createTestApp(createCsrfMiddleware({ mode: 'origin' }));
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          origin: 'http://example.com',
          host: 'example.com'
        }
      });
      expect(res.status).toBe(200);
    });

    it('blocks cross-origin POST', async () => {
      const app = createTestApp(createCsrfMiddleware({ mode: 'origin' }));
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          origin: 'http://evil.com',
          host: 'example.com'
        }
      });
      expect(res.status).toBe(403);
    });

    it('allows same-origin via referer', async () => {
      const app = createTestApp(createCsrfMiddleware({ mode: 'origin' }));
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          referer: 'http://example.com/form',
          host: 'example.com'
        }
      });
      expect(res.status).toBe(200);
    });

    it('allows POST without origin/referer (same-site)', async () => {
      const app = createTestApp(createCsrfMiddleware({ mode: 'origin' }));
      const res = await app.request('http://example.com/', {
        method: 'POST',
        headers: { host: 'example.com' }
      });
      expect(res.status).toBe(200);
    });
  });

  describe('createCsrfMiddleware - both mode', () => {
    it('requires both origin and token validation', async () => {
      const app = createTestApp(createCsrfMiddleware({ mode: 'both' }));
      const token = 'test-token';
      // Valid origin but no token -> blocked
      const res1 = await app.request('http://example.com/', {
        method: 'POST',
        headers: { origin: 'http://example.com', host: 'example.com' }
      });
      expect(res1.status).toBe(403);

      // Valid origin + valid token -> allowed
      const res2 = await app.request('http://example.com/', {
        method: 'POST',
        headers: {
          origin: 'http://example.com',
          host: 'example.com',
          cookie: `ubean_csrf=${token}`,
          'x-csrf-token': token
        }
      });
      expect(res2.status).toBe(200);
    });
  });

  describe('defineCsrf', () => {
    it('is an alias for createCsrfMiddleware', () => {
      const mw1 = createCsrfMiddleware();
      const mw2 = defineCsrf({});
      expect(typeof mw1).toBe('function');
      expect(typeof mw2).toBe('function');
    });
  });
});

/* -------------------------------------------------------------------------- */
/* P9-13: 安全头中间件                                                         */
/* -------------------------------------------------------------------------- */

describe('P9-13: Security Headers Middleware', () => {
  describe('serializeCsp', () => {
    it('serializes directives correctly', () => {
      const csp = serializeCsp({
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://cdn.example.com'],
        'img-src': ["'self'", 'data:']
      });
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' https://cdn.example.com");
      expect(csp).toContain("img-src 'self' data:");
    });

    it('handles boolean directives', () => {
      const csp = serializeCsp({ 'upgrade-insecure-requests': true });
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).not.toContain('upgrade-insecure-requests ');
    });

    it('skips undefined/null values', () => {
      const csp = serializeCsp({
        'default-src': ["'self'"],
        'script-src': undefined
      });
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain('script-src');
    });

    it('skips empty arrays', () => {
      const csp = serializeCsp({
        'default-src': ["'self'"],
        'script-src': []
      });
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain('script-src');
    });
  });

  describe('createSecurityHeadersMiddleware - defaults', () => {
    it('sets all default security headers', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware());
      const res = await app.request('http://example.com/');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    });

    it('default CSP contains essential directives', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware());
      const res = await app.request('http://example.com/');
      const csp = res.headers.get('Content-Security-Policy')!;
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('createSecurityHeadersMiddleware - custom CSP', () => {
    it('uses custom CSP directives', async () => {
      const app = createTestApp(
        createSecurityHeadersMiddleware({
          contentSecurityPolicy: {
            'default-src': ["'self'"],
            'script-src': ["'self'", 'https://cdn.example.com'],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:']
          }
        })
      );
      const res = await app.request('http://example.com/');
      const csp = res.headers.get('Content-Security-Policy')!;
      expect(csp).toContain("script-src 'self' https://cdn.example.com");
      expect(csp).toContain("img-src 'self' data: https:");
    });

    it('supports report-only mode', async () => {
      const app = createTestApp(
        createSecurityHeadersMiddleware({
          contentSecurityPolicyReportOnly: true,
          contentSecurityPolicy: { 'default-src': ["'self'"] }
        })
      );
      const res = await app.request('http://example.com/');
      expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeTruthy();
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });

    it('can disable CSP', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware({ contentSecurityPolicy: false }));
      const res = await app.request('http://example.com/');
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });
  });

  describe('createSecurityHeadersMiddleware - HSTS', () => {
    it('sets HSTS with custom maxAge', async () => {
      const app = createTestApp(
        createSecurityHeadersMiddleware({
          strictTransportSecurity: { maxAge: 86400, includeSubDomains: true, preload: true }
        })
      );
      const res = await app.request('http://example.com/');
      const sts = res.headers.get('Strict-Transport-Security')!;
      expect(sts).toContain('max-age=86400');
      expect(sts).toContain('includeSubDomains');
      expect(sts).toContain('preload');
    });

    it('can disable HSTS', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware({ strictTransportSecurity: false }));
      const res = await app.request('http://example.com/');
      expect(res.headers.get('Strict-Transport-Security')).toBeNull();
    });
  });

  describe('createSecurityHeadersMiddleware - X-Frame-Options', () => {
    it('supports DENY', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware({ xFrameOptions: 'DENY' }));
      const res = await app.request('http://example.com/');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('can be disabled', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware({ xFrameOptions: false }));
      const res = await app.request('http://example.com/');
      expect(res.headers.get('X-Frame-Options')).toBeNull();
    });
  });

  describe('createSecurityHeadersMiddleware - Permissions-Policy', () => {
    it('sets permissions policy', async () => {
      const app = createTestApp(
        createSecurityHeadersMiddleware({
          permissionsPolicy: {
            camera: [],
            geolocation: ["'self'"],
            microphone: ["'self'", 'https://example.com']
          }
        })
      );
      const res = await app.request('http://example.com/');
      const pp = res.headers.get('Permissions-Policy')!;
      expect(pp).toContain('camera=()');
      expect(pp).toContain("geolocation=('self')");
      expect(pp).toContain("microphone=('self' https://example.com)");
    });
  });

  describe('createSecurityHeadersMiddleware - Cross-Origin headers', () => {
    it('sets COEP', async () => {
      const app = createTestApp(createSecurityHeadersMiddleware({ crossOriginEmbedderPolicy: 'require-corp' }));
      const res = await app.request('http://example.com/');
      expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    });
  });

  describe('createSecurityHeadersMiddleware - extra headers', () => {
    it('sets extra custom headers', async () => {
      const app = createTestApp(
        createSecurityHeadersMiddleware({
          extraHeaders: { 'X-Custom-Header': 'custom-value' }
        })
      );
      const res = await app.request('http://example.com/');
      expect(res.headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('createSecurityHeadersMiddleware - exclude', () => {
    it('skips excluded paths', async () => {
      const app = new Hono();
      app.use('*', createSecurityHeadersMiddleware({ exclude: ['/api'] }));
      app.get('/api/test', c => c.json({ ok: true }));
      app.get('/', c => c.json({ ok: true }));

      const apiRes = await app.request('http://example.com/api/test');
      expect(apiRes.headers.get('X-Frame-Options')).toBeNull();

      const homeRes = await app.request('http://example.com/');
      expect(homeRes.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    });
  });

  describe('defineSecurityHeaders', () => {
    it('is an alias for createSecurityHeadersMiddleware', () => {
      const mw = defineSecurityHeaders({});
      expect(typeof mw).toBe('function');
    });
  });
});
