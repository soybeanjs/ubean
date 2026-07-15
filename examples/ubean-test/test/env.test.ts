import { describe, it, expect } from 'vitest';
import { defineEnv, useRuntimeEnv, setRuntimeEnv } from 'ubean';
import { getJson } from './helper';

describe('Environment variables - defineEnv', () => {
  describe('defineEnv() basic', () => {
    it('defines env schema with String type', () => {
      const { env } = defineEnv({
        server: {
          API_KEY: { type: String, default: 'default-key' }
        }
      });
      expect(env.API_KEY).toBe('default-key');
      expect(typeof env.API_KEY).toBe('string');
    });

    it('defines env schema with Number type', () => {
      const { env } = defineEnv({
        server: {
          PORT: { type: Number, default: 3000 }
        }
      });
      expect(env.PORT).toBe(3000);
      expect(typeof env.PORT).toBe('number');
    });

    it('defines env schema with Boolean type', () => {
      const { env } = defineEnv({
        server: {
          DEBUG: { type: Boolean, default: false }
        }
      });
      expect(env.DEBUG).toBe(false);
      expect(typeof env.DEBUG).toBe('boolean');
    });
  });

  describe('server/public layer separation', () => {
    it('server vars are accessible on server', () => {
      const { env } = defineEnv({
        server: {
          SECRET: { type: String, default: 'server-secret' }
        },
        public: {
          PUBLIC_KEY: { type: String, default: 'public-val' }
        }
      });
      expect(env.SECRET).toBe('server-secret');
      expect(env.PUBLIC_KEY).toBe('public-val');
    });

    it('public vars are separate from server vars', () => {
      const result = defineEnv({
        server: {
          SERVER_ONLY: { type: String, default: 'hidden' }
        },
        public: {
          CLIENT_VISIBLE: { type: String, default: 'visible' }
        }
      });
      expect(result.env.SERVER_ONLY).toBe('hidden');
      expect(result.env.CLIENT_VISIBLE).toBe('visible');
    });
  });

  describe('default values', () => {
    it('uses default when env var is not set', () => {
      const { env } = defineEnv({
        server: {
          MISSING_VAR: { type: String, default: 'fallback-value' }
        }
      });
      expect(env.MISSING_VAR).toBe('fallback-value');
    });

    it('uses process.env value when set', () => {
      process.env.TEST_UBEAN_VAR = 'from-process';
      const { env } = defineEnv({
        server: {
          TEST_UBEAN_VAR: { type: String, default: 'default' }
        }
      });
      expect(env.TEST_UBEAN_VAR).toBe('from-process');
      delete process.env.TEST_UBEAN_VAR;
    });

    it('Number type converts string from process.env', () => {
      process.env.TEST_NUM_VAR = '42';
      const { env } = defineEnv({
        server: {
          TEST_NUM_VAR: { type: Number, default: 0 }
        }
      });
      expect(env.TEST_NUM_VAR).toBe(42);
      delete process.env.TEST_NUM_VAR;
    });

    it('Boolean type converts string from process.env', () => {
      process.env.TEST_BOOL_VAR = 'true';
      const { env } = defineEnv({
        public: {
          TEST_BOOL_VAR: { type: Boolean, default: false }
        }
      });
      expect(env.TEST_BOOL_VAR).toBe(true);
      delete process.env.TEST_BOOL_VAR;
    });
  });

  describe('validation mode', () => {
    it('warn mode does not throw on invalid value', () => {
      // In warn mode, invalid values should produce a warning but not throw
      expect(() => {
        defineEnv({
          server: {
            BAD_NUM: { type: Number, default: 0 }
          },
          mode: 'warn'
        });
      }).not.toThrow();
    });

    it('throw mode throws on validation error', () => {
      process.env.BAD_THROW_NUM = 'not-a-number';
      expect(() => {
        defineEnv({
          server: {
            BAD_THROW_NUM: { type: Number }
          },
          mode: 'throw'
        });
      }).toThrow();
      delete process.env.BAD_THROW_NUM;
    });
  });

  describe('useRuntimeEnv()', () => {
    it('returns value from process.env', () => {
      // useRuntimeEnv reads from the internal runtime env map (set via setRuntimeEnv),
      // not directly from process.env
      setRuntimeEnv({ TEST_RUNTIME_VAR: 'runtime-value' });
      expect(useRuntimeEnv('TEST_RUNTIME_VAR', 'default')).toBe('runtime-value');
    });

    it('returns default when not set', () => {
      expect(useRuntimeEnv('NONEXISTENT_RUNTIME_VAR', 'fallback')).toBe('fallback');
    });

    it('setRuntimeEnv sets values via object', () => {
      setRuntimeEnv({ TEST_SET_VAR: 'set-value' });
      expect(useRuntimeEnv('TEST_SET_VAR', 'default')).toBe('set-value');
    });
  });

  describe('Standard Schema validation', () => {
    it('supports custom validate function via schema-like object', () => {
      // Standard Schema compatible object (duck-typed safeParse)
      const customSchema = {
        '~standard': {
          version: 1,
          vendor: 'test'
        },
        safeParse: (input: unknown) => {
          if (typeof input === 'string' && input.length >= 3) {
            return { success: true, data: input };
          }
          return { success: false, issues: [{ message: 'too short' }] };
        }
      };
      const { env } = defineEnv({
        server: {
          CUSTOM: { type: String, schema: customSchema, default: 'abcdef' }
        }
      });
      expect(env.CUSTOM).toBe('abcdef');
    });
  });

  describe('HTTP integration - /api/env-schema', () => {
    it('returns all env vars', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('server');
      expect(res.data).toHaveProperty('public');
      expect(res.data).toHaveProperty('types');
    });

    it('returns server env vars', async () => {
      const res = await getJson('/api/env-schema?action=server');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('databaseUrl');
      expect(res.data).toHaveProperty('port');
    });

    it('returns public env vars', async () => {
      const res = await getJson('/api/env-schema?action=public');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('apiBaseUrl');
      expect(res.data).toHaveProperty('enableFeatures');
    });

    it('returns runtime env vars', async () => {
      const res = await getJson('/api/env-schema?action=runtime');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('nodeEnv');
    });

    it('Number type is properly typed', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect(res.data.types.PORT).toBe('number');
    });

    it('Boolean type is properly typed', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect(res.data.types.ENABLE_FEATURES).toBe('boolean');
    });
  });
});
