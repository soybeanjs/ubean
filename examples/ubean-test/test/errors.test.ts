import { describe, it, expect } from 'vitest';
import { createError, UbeanError, isUbeanError, errorToResponse } from 'ubean';
import { api, getJson } from './helper';

describe('Error handling - createError / UbeanError', () => {
  describe('createError()', () => {
    it('creates error with statusCode and statusMessage', () => {
      const err = createError({ statusCode: 400, statusMessage: 'Bad Request' });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(UbeanError);
      expect(err.statusCode).toBe(400);
      expect(err.statusMessage).toBe('Bad Request');
    });

    it('creates error with data', () => {
      const err = createError({
        statusCode: 422,
        statusMessage: 'Validation Failed',
        data: { field: 'email', reason: 'invalid' }
      });
      expect(err.statusCode).toBe(422);
      expect(err.data).toEqual({ field: 'email', reason: 'invalid' });
    });

    it('uses default statusMessage based on statusCode', () => {
      const err = createError({ statusCode: 404 });
      expect(err.statusCode).toBe(404);
      expect(err.statusMessage).toBe('Not Found');
    });

    it('preserves Error stack trace', () => {
      const err = createError({ statusCode: 500, statusMessage: 'Server Error' });
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('Server Error');
    });
  });

  describe('UbeanError class', () => {
    it('can be constructed with positional args', () => {
      const err = new UbeanError(404, 'Not Found', { resource: 'user', id: 42 });
      expect(err.statusCode).toBe(404);
      expect(err.statusMessage).toBe('Not Found');
      expect(err.data).toEqual({ resource: 'user', id: 42 });
      expect(err.name).toBe('UbeanError');
    });

    it('is instanceof Error', () => {
      const err = new UbeanError(500, 'Internal');
      expect(err).toBeInstanceOf(Error);
    });

    it('has statusCode/statusMessage/data properties', () => {
      const err = new UbeanError(403, 'Forbidden', { reason: 'insufficient permissions' });
      expect(err).toHaveProperty('statusCode', 403);
      expect(err).toHaveProperty('statusMessage', 'Forbidden');
      expect(err).toHaveProperty('data');
    });

    it('defaults statusMessage from statusCode', () => {
      const err = new UbeanError(400);
      expect(err.statusMessage).toBe('Bad Request');
    });
  });

  describe('isUbeanError()', () => {
    it('returns true for UbeanError instances', () => {
      const err = new UbeanError(400, 'Bad');
      expect(isUbeanError(err)).toBe(true);
    });

    it('returns true for createError() results', () => {
      const err = createError({ statusCode: 500, statusMessage: 'fail' });
      expect(isUbeanError(err)).toBe(true);
    });

    it('returns false for regular Errors', () => {
      const err = new Error('regular');
      expect(isUbeanError(err)).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isUbeanError(null)).toBe(false);
      expect(isUbeanError(undefined)).toBe(false);
      expect(isUbeanError('string')).toBe(false);
      expect(isUbeanError({ statusCode: 500 })).toBe(false);
    });
  });

  describe('errorToResponse()', () => {
    it('converts UbeanError to a Response', async () => {
      const err = new UbeanError(418, "I'm a teapot", { detail: 'short and stout' });
      const res = errorToResponse(null, err);
      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(418);
      const body = await res.json();
      expect(body.statusCode).toBe(418);
      expect(body.error).toBe("I'm a teapot");
    });

    it('includes data in response body', async () => {
      const err = new UbeanError(400, 'Bad Request', { field: 'name' });
      const res = errorToResponse(null, err);
      const body = await res.json();
      expect(body.data).toEqual({ field: 'name' });
    });
  });

  describe('HTTP integration - /api/create-error', () => {
    it('returns 400 for generic createError', async () => {
      const res = await getJson('/api/create-error?type=generic');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('statusCode', 400);
      expect(res.data).toHaveProperty('error', 'Bad Request');
      expect(res.data).toHaveProperty('data');
    });

    it('returns 418 for UbeanError', async () => {
      const res = await getJson('/api/create-error?type=ubean-error');
      expect(res.status).toBe(418);
      expect(res.data).toHaveProperty('statusCode', 418);
      expect(res.data).toHaveProperty('error', "I'm a teapot");
    });

    it('isUbeanError check works via API', async () => {
      const res = await getJson('/api/create-error?type=is-check');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('isUbeanError', true);
      expect(res.data).toHaveProperty('statusCode', 403);
    });
  });

  describe('HTTP integration - /api/error (global onError)', () => {
    it('returns 500 for thrown error', async () => {
      const res = await getJson('/api/error');
      expect(res.status).toBe(500);
      expect(res.data).toHaveProperty('statusCode', 500);
      expect(res.data).toHaveProperty('error');
      expect(res.data).toHaveProperty('data');
    });

    it('404 fallback for unknown routes', async () => {
      const res = await getJson('/api/nonexistent-route-xyz');
      expect(res.status).toBe(404);
      expect(res.data).toHaveProperty('error');
    });
  });
});
