import { describe, expect, it } from 'vitest';
import { api } from '../pages/base.page';

/**
 * Spec 02: API routes
 *
 * Covers:
 * - defineHandler (GET/POST/PUT/PATCH/DELETE)
 * - Response helpers: c.json, c.text, c.html, c.redirect
 * - Dynamic API routes (/api/users/[id])
 * - Validator (valibot query/header/cookie/json validation)
 * - describeRoute + OpenAPI metadata
 * - Error handling (createError)
 * - Redirects (302 + 301)
 */
describe('API Routes', () => {
  describe('Basic response helpers', () => {
    it('GET /api/hello returns JSON with message', async () => {
      const res = await api.get('/api/hello');
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({
        message: 'Hello from ubean API!',
        method: 'GET'
      });
      expect(res.json).toHaveProperty('timestamp');
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('POST /api/hello echoes back the body', async () => {
      const res = await api.post('/api/hello', { name: 'test' });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({
        message: 'POST received!',
        method: 'POST'
      });
      expect(res.json).toHaveProperty('received');
      expect((res.json as any).received).toMatchObject({ name: 'test' });
    });

    it('GET /api/json returns nested JSON', async () => {
      const res = await api.get('/api/json');
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({
        json: true,
        message: 'This is a JSON response'
      });
      expect((res.json as any).data.number).toBe(42);
      expect((res.json as any).data.array).toEqual([1, 2, 3]);
    });

    it('GET /api/text returns plain text', async () => {
      const res = await api.get('/api/text');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('plain text response');
    });

    it('GET /api/html returns HTML', async () => {
      const res = await api.get('/api/html');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('<!DOCTYPE html>');
      expect(res.body).toContain('HTML Response');
    });
  });

  describe('CRUD on /api/users', () => {
    it('GET /api/users returns a list of users', async () => {
      const res = await api.get('/api/users');
      expect(res.status).toBe(200);
      const body = res.json as any;
      expect(body).toHaveProperty('users');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.total).toBe(body.users.length);
      expect(body.users.length).toBeGreaterThanOrEqual(3);
    });

    it('GET /api/users/1 returns a specific user', async () => {
      const res = await api.get('/api/users/1');
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ id: 1, name: '张三' });
    });

    it('GET /api/users/999 returns fallback object for missing user', async () => {
      const res = await api.get('/api/users/999');
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ id: '999' });
    });

    it('POST /api/users creates a new user with 201', async () => {
      const newUser = { name: 'Test User', email: 'test@example.com', role: 'user' };
      const res = await api.post('/api/users', newUser);
      expect(res.status).toBe(201);
      expect(res.json).toMatchObject(newUser);
      expect((res.json as any).id).toBeGreaterThan(0);
    });

    it('POST /api/users validates body via valibot schema', async () => {
      // Missing required fields should trigger validation error (400)
      const res = await api.post('/api/users', {});
      expect(res.status).toBe(400);
    });

    it('PUT /api/users/1 updates the user', async () => {
      const res = await api.put('/api/users/1', { name: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ id: 1, name: 'Updated Name' });
    });

    it('PATCH /api/users/1 partially updates the user', async () => {
      const res = await api.patch('/api/users/1', { email: 'updated@example.com' });
      expect(res.status).toBe(200);
      expect((res.json as any).email).toBe('updated@example.com');
    });

    it('PUT /api/users/999 returns 404 for missing user', async () => {
      const res = await api.put('/api/users/999', { name: 'X' });
      expect(res.status).toBe(404);
    });

    it('DELETE /api/users/2 removes the user', async () => {
      const res = await api.delete('/api/users/2');
      expect(res.status).toBe(200);
      expect((res.json as any).deleted).toBe(true);
    });

    it('DELETE /api/users/999 returns 404 for missing user', async () => {
      const res = await api.delete('/api/users/999');
      expect(res.status).toBe(404);
    });
  });

  describe('Redirects', () => {
    it('GET /api/redirect returns 302 to /api/hello', async () => {
      const res = await api.get('/api/redirect');
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/api/hello');
    });

    it('GET /api/redirect-permanent returns 301 to /api/hello', async () => {
      const res = await api.get('/api/redirect-permanent');
      expect(res.status).toBe(301);
      expect(res.headers['location']).toContain('/api/hello');
    });
  });

  describe('Error handling', () => {
    it('GET /api/error returns 500 with error data', async () => {
      const res = await api.get('/api/error');
      expect(res.status).toBe(500);
      expect(res.json).toHaveProperty('statusCode', 500);
      expect(res.json).toHaveProperty('error');
    });
  });

  describe('Health check', () => {
    it('GET /api/health returns ok status', async () => {
      const res = await api.get('/api/health');
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ status: 'ok' });
      expect((res.json as any).uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Environment variables', () => {
    it('GET /api/env returns env info', async () => {
      const res = await api.get('/api/env');
      expect(res.status).toBe(200);
      expect((res.json as any).env).toHaveProperty('NODE_ENV');
    });
  });

  describe('CORS status', () => {
    it('GET /api/cors-status returns cors info', async () => {
      const res = await api.get('/api/cors-status');
      expect(res.status).toBe(200);
      expect(res.json).toHaveProperty('cors');
    });
  });

  describe('File download', () => {
    it('GET /api/download returns binary with Content-Disposition', async () => {
      const res = await api.get('/api/download?filename=test.txt&contentType=text/plain');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('test.txt');
      expect(res.body).toContain('File content for test.txt');
    });
  });
});
