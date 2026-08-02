import { describe, expect, it } from 'vitest';
import { api } from '../pages/base.page';

/**
 * Spec 11: DevTools + OpenAPI
 *
 * Covers:
 * - DevTools panel (/_devtools) — served in dev mode
 * - OpenAPI spec (/_openapi.json) — auto-generated from describeRoute
 * - Scalar API docs (/_scalar) — OpenAPI UI
 * - describeRoute metadata in API routes
 */
describe('DevTools & OpenAPI', () => {
  describe('OpenAPI spec (/_openapi.json)', () => {
    it('returns 200 for /_openapi.json', async () => {
      const res = await api.get('/_openapi.json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('returns a valid OpenAPI document', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec).toHaveProperty('openapi');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');
    });

    it('includes /api/hello in paths', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths).toHaveProperty('/api/hello');
    });

    it('includes /api/users in paths', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths).toHaveProperty('/api/users');
    });

    it('includes /api/users/{id} in paths', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths).toHaveProperty('/api/users/{id}');
    });

    it('includes GET method for /api/hello', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths['/api/hello']).toHaveProperty('get');
    });

    it('includes POST method for /api/hello', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths['/api/hello']).toHaveProperty('post');
    });

    it('includes summary from describeRoute', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths['/api/hello'].get).toHaveProperty('summary');
    });

    it('includes tags from describeRoute', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      expect(spec.paths['/api/hello'].get).toHaveProperty('tags');
      expect(spec.paths['/api/hello'].get.tags).toContain('Demo');
    });
  });

  describe('Scalar API docs (/_scalar)', () => {
    it('returns 200 for /_scalar', async () => {
      const res = await api.get('/_scalar');
      expect(res.status).toBe(200);
    });

    it('returns HTML content', async () => {
      const res = await api.get('/_scalar');
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('contains Scalar branding', async () => {
      const res = await api.get('/_scalar');
      // Scalar UI includes some identifiable content
      expect(res.body.toLowerCase()).toContain('scalar');
    });
  });

  describe('DevTools panel (/_devtools)', () => {
    it('redirects /_devtools to the devtools UI (302)', async () => {
      const res = await api.get('/_devtools');
      // DevTools is enabled in ubean.config.ts — /_devtools redirects to /__devtools/
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('devtools');
    });

    it('returns HTML content for the devtools UI', async () => {
      const res = await api.get('/__devtools/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('OpenAPI metadata (describeRoute)', () => {
    it('includes response schemas for /api/users', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      const getUsersOp = spec.paths['/api/users']?.get;
      expect(getUsersOp).toBeTruthy();
      expect(getUsersOp.responses).toHaveProperty('200');
    });

    it('includes 201 response for POST /api/users', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      const createUserOp = spec.paths['/api/users']?.post;
      expect(createUserOp).toBeTruthy();
      expect(createUserOp.responses).toHaveProperty('201');
    });

    it('includes 404 response for /api/users/{id}', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      const getUserOp = spec.paths['/api/users/{id}']?.get;
      expect(getUserOp).toBeTruthy();
      expect(getUserOp.responses).toHaveProperty('404');
    });

    it('includes text/plain response for /api/text', async () => {
      const res = await api.get('/_openapi.json');
      const spec = res.json as any;
      const textOp = spec.paths['/api/text']?.get;
      expect(textOp).toBeTruthy();
      expect(textOp.responses['200'].content).toHaveProperty('text/plain');
    });
  });
});
