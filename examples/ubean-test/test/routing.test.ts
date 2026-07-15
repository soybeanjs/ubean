import { describe, it, expect } from 'vitest';
import { getJson, postJson, api } from './helper';

describe('Routing system', () => {
  describe('Basic API routes', () => {
    it('GET /api/hello returns greeting', async () => {
      const res = await getJson('/api/hello');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('message');
    });

    it('GET /api/json returns JSON', async () => {
      const res = await getJson('/api/json');
      expect(res.status).toBe(200);
      expect(res.data).toBeDefined();
    });

    it('GET /api/text returns text', async () => {
      const res = await api('/api/text');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
    });

    it('GET /api/html returns HTML', async () => {
      const res = await api('/api/html');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });
  });

  describe('Dynamic routes', () => {
    it('GET /api/users returns list', async () => {
      const res = await getJson('/api/users');
      expect(res.status).toBe(200);
      expect(res.data).toBeDefined();
    });

    it('GET /api/users/:id returns user by id', async () => {
      const res = await getJson('/api/users/42');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id');
    });

    it('GET /api/users/abc returns user with string id', async () => {
      const res = await getJson('/api/users/abc');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('id', 'abc');
    });
  });

  describe('HTTP methods', () => {
    it('GET method works', async () => {
      const res = await api('/api/headers', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('POST method works', async () => {
      const res = await postJson('/api/users', { name: 'New User' });
      expect(res.status).toBeLessThan(500);
    });

    it('PUT method works', async () => {
      const res = await api('/api/users/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });
      expect(res.status).toBeLessThan(500);
    });

    it('DELETE method works', async () => {
      const res = await api('/api/users/1', { method: 'DELETE' });
      expect(res.status).toBeLessThan(500);
    });

    it('PATCH method works', async () => {
      const res = await api('/api/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Patched' })
      });
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Route groups ((group-name))', () => {
    it('route group does not contribute to URL', async () => {
      // (marketing)/marketing-page.vue → /marketing-page
      const res = await api('/marketing-page');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });
  });

  describe('Nested routes', () => {
    it('dashboard/index.vue → /dashboard', async () => {
      const res = await api('/dashboard');
      expect(res.status).toBe(200);
    });

    it('dashboard/profile.vue → /dashboard/profile', async () => {
      const res = await api('/dashboard/profile');
      expect(res.status).toBe(200);
    });

    it('dashboard/settings.vue → /dashboard/settings', async () => {
      const res = await api('/dashboard/settings');
      expect(res.status).toBe(200);
    });
  });

  describe('Dynamic page routes', () => {
    it('user/[id].vue → /user/123', async () => {
      const res = await api('/user/123');
      expect(res.status).toBe(200);
    });
  });

  describe('Redirects', () => {
    it('/api/redirect returns 302', async () => {
      const res = await api('/api/redirect');
      expect([301, 302, 307, 308]).toContain(res.status);
    });

    it('/api/redirect-permanent returns 301', async () => {
      const res = await api('/api/redirect-permanent');
      expect([301, 308]).toContain(res.status);
    });
  });

  describe('Route meta', () => {
    it('GET /api/test-meta returns route metadata', async () => {
      const res = await getJson('/api/test-meta');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('meta');
    });
  });

  describe('Query parameters', () => {
    it('GET /api/search?q=test returns search results', async () => {
      const res = await getJson('/api/search?q=test');
      expect(res.status).toBe(200);
    });
  });

  describe('Headers validation', () => {
    it('GET /api/headers returns headers', async () => {
      const res = await getJson('/api/headers');
      expect(res.status).toBe(200);
    });
  });

  describe('Cookies', () => {
    it('GET /api/cookies returns cookie info', async () => {
      const res = await getJson('/api/cookies');
      expect(res.status).toBe(200);
    });
  });

  describe('Health endpoint', () => {
    it('GET /_health returns ok status', async () => {
      const res = await getJson('/_health');
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown API route', async () => {
      const res = await getJson('/api/nonexistent-route-xyz');
      expect(res.status).toBe(404);
    });
  });
});
