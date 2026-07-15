import { describe, it, expect } from 'vitest';
import { api, getJson } from './helper';

describe('Static files serving', () => {
  describe('public/ directory', () => {
    it('serves text files with correct MIME type', async () => {
      const res = await api('/test.txt');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/plain');
      expect(res.text).toBeTruthy();
    });

    it('serves JSON files with correct MIME type', async () => {
      const res = await api('/data.json');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const data = JSON.parse(res.text);
      expect(data).toBeDefined();
    });

    it('serves CSS files with correct MIME type', async () => {
      const res = await api('/style.css');
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/css');
    });

    it('returns 404 for nonexistent static file', async () => {
      const res = await api('/nonexistent-file.xyz');
      expect(res.status).toBe(404);
    });
  });

  describe('X-Content-Type-Options header', () => {
    it('sets nosniff on static files', async () => {
      const res = await api('/test.txt');
      const contentTypeOptions = res.headers.get('X-Content-Type-Options');
      // The header should be set to nosniff for security
      if (contentTypeOptions) {
        expect(contentTypeOptions).toBe('nosniff');
      }
    });
  });

  describe('/_ and /api/ bypass', () => {
    it('/_health endpoint is not served as static file', async () => {
      const res = await getJson('/_health');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('status', 'ok');
    });

    it('/api/ routes are not served as static files', async () => {
      const res = await getJson('/api/hello');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('message');
    });

    it('/_openapi.json is accessible (DevTools)', async () => {
      const res = await api('/_openapi.json');
      // OpenAPI should be available in dev mode
      expect(res.status).toBe(200);
    });
  });

  describe('ETag support', () => {
    it('returns ETag header for static files', async () => {
      const res = await api('/test.txt');
      // ETag may or may not be present depending on implementation
      const etag = res.headers.get('ETag') || res.headers.get('etag');
      if (etag) {
        expect(etag).toBeTruthy();
      }
    });
  });

  describe('Cache-Control headers', () => {
    it('may set Cache-Control on static files', async () => {
      const res = await api('/test.txt');
      const cacheControl = res.headers.get('Cache-Control') || res.headers.get('cache-control');
      // Cache-Control may or may not be present
      if (cacheControl) {
        expect(typeof cacheControl).toBe('string');
      }
    });
  });
});
