import { describe, it, expect } from 'vitest';
import { defineConfig } from '../src/core/config';
import { UbeanError, createError, isUbeanError, errorToResponse } from '../src/runtime/error';
import { defineHandler, defineMeta, defineValidator } from '../src/runtime/handler';

describe('UbeanError', () => {
  it('should create error with status code', () => {
    const err = new UbeanError(404);
    expect(err.statusCode).toBe(404);
    expect(err.statusMessage).toBe('Not Found');
    expect(isUbeanError(err)).toBe(true);
  });

  it('should create error with custom status message', () => {
    const err = new UbeanError(500, 'Internal Server Error');
    expect(err.statusMessage).toBe('Internal Server Error');
    expect(err.data).toBeUndefined();
  });

  it('should create error with data', () => {
    const err = new UbeanError(400, 'Bad Request', { field: 'email' });
    expect(err.data).toEqual({ field: 'email' });
  });

  it('createError should support shorthand', () => {
    const err = createError({ statusCode: 403, message: 'Forbidden' });
    expect(err).toBeInstanceOf(UbeanError);
    expect(err.statusCode).toBe(403);
    expect(err.statusMessage).toBe('Forbidden');
  });

  it('should convert error to response', async () => {
    const err = new UbeanError(404);
    const res = errorToResponse(err);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
  });
});

describe('defineMeta', () => {
  it('should return a meta middleware with public flag', () => {
    const meta = defineMeta({ public: true });
    expect(typeof meta).toBe('function');
    expect((meta as any).meta.public).toBe(true);
    expect((meta as any).__brand).toBe('meta');
  });

  it('should return meta with openapi', () => {
    const meta = defineMeta({
      public: false,
      openapi: {
        tags: ['users'],
        summary: 'Get user',
        description: 'Get a user by ID'
      }
    });
    expect((meta as any).meta.openapi?.tags).toEqual(['users']);
    expect((meta as any).meta.openapi?.summary).toBe('Get user');
  });
});

describe('defineValidator', () => {
  it('should return a validator middleware function', () => {
    const v = defineValidator({});
    expect(v).toBeDefined();
    expect(typeof v).toBe('function');
    expect((v as any).__brand).toBe('validator');
  });
});

describe('defineHandler', () => {
  it('should create handler with single function', () => {
    const handler = defineHandler(() => new Response('ok'));
    expect(handler).toBeInstanceOf(Function);
    expect((handler as any).__ubeanHandler).toBe(true);
  });

  it('should compose multiple handlers', () => {
    const handler = defineHandler(
      async (c, next) => {
        c.set('user', { id: 1 });
        await next();
      },
      c => {
        const user = c.get('user') as { id: number };
        return new Response(`User: ${user.id}`);
      }
    );
    expect(handler).toBeInstanceOf(Function);
    expect((handler as any).__ubeanHandler).toBe(true);
  });

  it('should merge meta from defineMeta', () => {
    const handler = defineHandler(defineMeta({ public: false }), () => new Response('ok'));
    expect((handler as any).__meta.public).toBe(false);
  });

  it('should default meta.public to true', () => {
    const handler = defineHandler(() => new Response('ok'));
    expect((handler as any).__meta.public).toBe(true);
  });

  it('should throw when no handlers provided', () => {
    expect(() => (defineHandler as any)()).toThrow('defineHandler requires at least one handler');
  });
});

describe('defineConfig', () => {
  it('should return config as-is', () => {
    const config = defineConfig({
      srcDir: 'src',
      build: {
        preset: 'node'
      }
    });
    expect(config.build?.preset).toBe('node');
    expect(config.srcDir).toBe('src');
  });
});
