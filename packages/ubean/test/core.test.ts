import { describe, it, expect } from 'vitest';
import { defineConfig } from '../src/core/config';
import {
  diagnoseCapabilities,
  requireCapability,
  createCapabilitySet,
  STANDARD_CAPABILITIES,
  NODE_CAPABILITIES,
  standardPreset,
  nodePreset
} from '../src/core/preset';
import { UbeanError, createError, isUbeanError, errorToResponse } from '../src/runtime/error';
import { defineHandler, defineMeta, defineValidator } from '../src/runtime/handler';
import { redirect, permanentRedirect } from '../src/runtime/response';

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

describe('capabilities', () => {
  it('createCapabilitySet provides defaults', () => {
    const caps = createCapabilitySet();
    expect(caps.middleware).toBe(true);
    expect(caps.bodyLimit).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.envVars).toBe(true);
    expect(caps.websocket).toBe(false);
    expect(caps.nodeCompat).toBe(false);
  });

  it('createCapabilitySet merges overrides', () => {
    const caps = createCapabilitySet({ websocket: true, nodeCompat: true });
    expect(caps.websocket).toBe(true);
    expect(caps.nodeCompat).toBe(true);
    expect(caps.middleware).toBe(true);
  });

  it('NODE_CAPABILITIES has full Node.js support', () => {
    expect(NODE_CAPABILITIES.nodeCompat).toBe(true);
    expect(NODE_CAPABILITIES.websocket).toBe(true);
    expect(NODE_CAPABILITIES.cronTriggers).toBe(true);
    expect(NODE_CAPABILITIES.queues).toBe(true);
    expect(NODE_CAPABILITIES.multipart).toBe(true);
  });

  it('STANDARD_CAPABILITIES has limited support', () => {
    expect(STANDARD_CAPABILITIES.staticServe).toBe(true);
    expect(STANDARD_CAPABILITIES.sse).toBe(true);
    expect(STANDARD_CAPABILITIES.websocket).toBe(false);
    expect(STANDARD_CAPABILITIES.nodeCompat).toBe(false);
  });

  it('diagnoseCapabilities returns valid when all requirements met', () => {
    const result = diagnoseCapabilities('node', NODE_CAPABILITIES, [
      requireCapability('middleware'),
      requireCapability('websocket'),
      requireCapability('cronTriggers')
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('diagnoseCapabilities returns errors for missing required capabilities', () => {
    const result = diagnoseCapabilities('standard', STANDARD_CAPABILITIES, [
      requireCapability('websocket', true),
      requireCapability('nodeCompat', true)
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors[0]).toContain('standard');
  });

  it('diagnoseCapabilities returns warnings for optional missing capabilities', () => {
    const result = diagnoseCapabilities('standard', STANDARD_CAPABILITIES, [requireCapability('websocket', false)]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('requireCapability creates requirement object', () => {
    const req = requireCapability('kv', true, 'KV storage required');
    expect(req.capability).toBe('kv');
    expect(req.required).toBe(true);
    expect(req.message).toBe('KV storage required');
  });

  it('diagnoseCapabilities supports custom error messages', () => {
    const result = diagnoseCapabilities('test', {}, [
      requireCapability('database', true, 'Custom database error message')
    ]);
    expect(result.errors[0]).toContain('Custom database error message');
  });

  it('standardPreset has capabilities defined', () => {
    expect(standardPreset.capabilities).toBeDefined();
    expect(standardPreset.capabilities?.middleware).toBe(true);
  });

  it('nodePreset has full capabilities defined', () => {
    expect(nodePreset.capabilities).toBeDefined();
    expect(nodePreset.capabilities?.nodeCompat).toBe(true);
  });

  it('diagnostics include supported flag for each requirement', () => {
    const result = diagnoseCapabilities('test', { websocket: true }, [
      requireCapability('websocket'),
      requireCapability('kv')
    ]);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].supported).toBe(true);
    expect(result.diagnostics[1].supported).toBe(false);
  });
});

describe('Response helpers', () => {
  it('redirect creates 302 response with Location header', () => {
    const res = redirect('/home');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/home');
  });

  it('redirect supports custom status code', () => {
    const res = redirect('/new-url', 307);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBe('/new-url');
  });

  it('permanentRedirect creates 301 response', () => {
    const res = permanentRedirect('/permanent');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('/permanent');
  });
});

describe('UbeanError edge cases', () => {
  it('defaults to generic "Error" message for unknown status codes', () => {
    const err = new UbeanError(418);
    expect(err.statusMessage).toBe('Error');
  });

  it('isUbeanError returns false for plain Error', () => {
    expect(isUbeanError(new Error('plain'))).toBe(false);
    expect(isUbeanError(null)).toBe(false);
    expect(isUbeanError(undefined)).toBe(false);
    expect(isUbeanError('string')).toBe(false);
    expect(isUbeanError({ statusCode: 500 })).toBe(false);
  });

  it('createError prefers statusMessage over message', () => {
    const err = createError({ statusCode: 400, statusMessage: 'Bad Input', message: 'ignored' });
    expect(err.statusMessage).toBe('Bad Input');
  });

  it('createError falls back to message when statusMessage not provided', () => {
    const err = createError({ statusCode: 500, message: 'Something broke' });
    expect(err.statusMessage).toBe('Something broke');
  });

  it('errorToResponse converts plain Error to 500 response', async () => {
    const res = errorToResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBe('boom');
  });

  it('errorToResponse converts string errors', async () => {
    const res = errorToResponse('string error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('string error');
  });

  it('errorToResponse includes data payload', async () => {
    const err = new UbeanError(422, 'Validation failed', { fields: ['email'] });
    const res = errorToResponse(err);
    const body = await res.json();
    expect(body.data).toEqual({ fields: ['email'] });
  });

  it('errorToResponse supports (c, err) two-arg form', async () => {
    const res = errorToResponse({}, new UbeanError(404));
    expect(res.status).toBe(404);
  });
});
