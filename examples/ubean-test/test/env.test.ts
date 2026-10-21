import { describe, it, expect } from 'vitest';
import { defineEnv, envField, useRuntimeEnv, setRuntimeEnv } from 'ubean';
import { getJson } from './helper';

/**
 * `defineEnv()` 的契约。
 *
 * 分组糖（`server:` / `public:`）已删除 —— 维度必须写在字段上。这里用 `schema:` +
 * `envField.*()`，与 `ubean.config.ts` 的 `env.schema` 完全同形，两条路径不再有「写法不同、
 * 语义一样」的解释成本。
 */
describe('Environment variables - defineEnv', () => {
  describe('defineEnv() basic', () => {
    it('string 字段取到默认值', () => {
      const { env } = defineEnv({
        schema: {
          API_KEY: envField.string({ context: 'server', access: 'secret', default: 'default-key' })
        }
      });
      expect(env.API_KEY).toBe('default-key');
      expect(typeof env.API_KEY).toBe('string');
    });

    it('number 字段取到默认值', () => {
      const { env } = defineEnv({
        schema: {
          PORT: envField.number({ context: 'server', access: 'public', default: 9527 })
        }
      });
      expect(env.PORT).toBe(9527);
      expect(typeof env.PORT).toBe('number');
    });

    it('boolean 字段取到默认值', () => {
      const { env } = defineEnv({
        schema: {
          DEBUG: envField.boolean({ context: 'server', access: 'secret', default: false })
        }
      });
      expect(env.DEBUG).toBe(false);
      expect(typeof env.DEBUG).toBe('boolean');
    });
  });

  describe('context / access 维度', () => {
    it('server 与 client 字段共存，输出都是扁平键', () => {
      const { env } = defineEnv({
        schema: {
          SECRET: envField.string({ context: 'server', access: 'secret', default: 'server-secret' }),
          PUBLIC_KEY: envField.string({ context: 'client', access: 'public', default: 'public-val' })
        }
      });
      expect(env.SECRET).toBe('server-secret');
      expect(env.PUBLIC_KEY).toBe('public-val');
    });

    it('server 字段与 client 字段互不影响', () => {
      const result = defineEnv({
        schema: {
          SERVER_ONLY: envField.string({ context: 'server', access: 'secret', default: 'hidden' }),
          CLIENT_VISIBLE: envField.string({ context: 'client', access: 'public', default: 'visible' })
        }
      });
      expect(result.env.SERVER_ONLY).toBe('hidden');
      expect(result.env.CLIENT_VISIBLE).toBe('visible');
    });

    it('enum 字段校验成员，拼错直接报错', () => {
      process.env.TEST_UBEAN_STAGE = 'staging';
      expect(() =>
        defineEnv({
          schema: {
            TEST_UBEAN_STAGE: envField.enum({
              context: 'server',
              access: 'public',
              values: ['local', 'prod'],
              default: 'local'
            })
          },
          mode: 'throw'
        })
      ).toThrow(/must be one of local \| prod/);
      delete process.env.TEST_UBEAN_STAGE;
    });

    it('client + secret 是非法组合', () => {
      expect(() => envField.string({ context: 'client', access: 'secret' })).toThrow(
        /cannot be combined with access 'secret'/
      );
    });
  });

  describe('取值优先级', () => {
    it('env var 未设置时用 default', () => {
      const { env } = defineEnv({
        schema: {
          MISSING_VAR: envField.string({ context: 'server', access: 'secret', default: 'fallback-value' })
        }
      });
      expect(env.MISSING_VAR).toBe('fallback-value');
    });

    it('process.env 有值时覆盖 default', () => {
      process.env.TEST_UBEAN_VAR = 'from-process';
      const { env } = defineEnv({
        schema: {
          TEST_UBEAN_VAR: envField.string({ context: 'server', access: 'secret', default: 'default' })
        }
      });
      expect(env.TEST_UBEAN_VAR).toBe('from-process');
      delete process.env.TEST_UBEAN_VAR;
    });

    it('number 字段把 process.env 的字符串转换成数字', () => {
      process.env.TEST_NUM_VAR = '42';
      const { env } = defineEnv({
        schema: {
          TEST_NUM_VAR: envField.number({ context: 'server', access: 'public', default: 0 })
        }
      });
      expect(env.TEST_NUM_VAR).toBe(42);
      delete process.env.TEST_NUM_VAR;
    });

    it('boolean 字段把 "true"/"1" 转换成 true', () => {
      process.env.TEST_BOOL_VAR = 'true';
      const { env } = defineEnv({
        schema: {
          TEST_BOOL_VAR: envField.boolean({ context: 'client', access: 'public', default: false })
        }
      });
      expect(env.TEST_BOOL_VAR).toBe(true);
      delete process.env.TEST_BOOL_VAR;
    });
  });

  describe('validate mode', () => {
    it('warn 模式不抛错', () => {
      expect(() => {
        defineEnv({
          schema: {
            BAD_NUM: envField.number({ context: 'server', access: 'public', default: 0 })
          },
          mode: 'warn'
        });
      }).not.toThrow();
    });

    it('throw 模式在非法值上抛错', () => {
      process.env.BAD_THROW_NUM = 'not-a-number';
      expect(() => {
        defineEnv({
          schema: {
            BAD_THROW_NUM: envField.number({ context: 'server', access: 'public' })
          },
          mode: 'throw'
        });
      }).toThrow();
      delete process.env.BAD_THROW_NUM;
    });
  });

  describe('useRuntimeEnv()', () => {
    it('返回 setRuntimeEnv 设的值', () => {
      // useRuntimeEnv 读内部 runtime map（setRuntimeEnv 写入），不直接读 process.env
      setRuntimeEnv({ TEST_RUNTIME_VAR: 'runtime-value' });
      expect(useRuntimeEnv('TEST_RUNTIME_VAR', 'default')).toBe('runtime-value');
    });

    it('未设置时返回 default', () => {
      expect(useRuntimeEnv('NONEXISTENT_RUNTIME_VAR', 'fallback')).toBe('fallback');
    });

    it('setRuntimeEnv 按对象写入', () => {
      setRuntimeEnv({ TEST_SET_VAR: 'set-value' });
      expect(useRuntimeEnv('TEST_SET_VAR', 'default')).toBe('set-value');
    });
  });

  /**
   * 运行期 schema（Standard Schema / `safeParse`）只能走 `defineEnv()`，不能进
   * `ubean.config.ts` 的 `env.schema` —— 后者生成的是源码，装不下函数。
   * 覆盖见 `packages/builder/test/env-plugin.test.ts`。
   */
  describe('运行期 schema（Standard Schema）', () => {
    it('`~standard.validate()` 真的被调用，错误信息透出', () => {
      const standardSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (input: unknown) =>
            typeof input === 'string' && input.length >= 3 ? { value: input } : { issues: [{ message: 'too short' }] }
        }
      };

      expect(() =>
        defineEnv({
          schema: { CUSTOM: standardSchema as never },
          mode: 'throw'
        })
      ).toThrow(/too short/);
    });

    it('校验通过时取到 value（transform 生效）', () => {
      const standardSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (input: unknown) => ({ value: Number(input) })
        }
      };

      process.env.TEST_STANDARD_NUM = '7';
      const { env } = defineEnv({
        schema: { TEST_STANDARD_NUM: standardSchema as never }
      });
      expect(env.TEST_STANDARD_NUM).toBe(7);
      delete process.env.TEST_STANDARD_NUM;
    });
  });

  describe('HTTP integration - /api/env-schema', () => {
    it('返回全部字段', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('server');
      expect(res.data).toHaveProperty('public');
      expect(res.data).toHaveProperty('types');
    });

    it('返回 server 字段', async () => {
      const res = await getJson('/api/env-schema?action=server');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('databaseUrl');
      expect(res.data).toHaveProperty('port');
    });

    it('返回 public 字段', async () => {
      const res = await getJson('/api/env-schema?action=public');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('apiBaseUrl');
      expect(res.data).toHaveProperty('enableFeatures');
    });

    it('返回 runtime env', async () => {
      const res = await getJson('/api/env-schema?action=runtime');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('nodeEnv');
    });

    it('number 类型正确', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect((res.data as { types: Record<string, string> }).types.PORT).toBe('number');
    });

    it('boolean 类型正确', async () => {
      const res = await getJson('/api/env-schema?action=all');
      expect((res.data as { types: Record<string, string> }).types.ENABLE_FEATURES).toBe('boolean');
    });
  });

  /**
   * `ubean:env/*` 契约（docs/contracts/env-v1.md）的端到端面。
   *
   * 这条路径跨了四个组件，任何单测都盖不全：`ubean.config.ts` 的 `env.schema` →
   * 生成 `.ubean/env.d.ts` → 构建期把 `ubean:env/client` 内联成字面量 →
   * `ubean:env/server` 在运行期读 `process.env`。所以断言必须走真实 HTTP，
   * 而不是 import 虚拟模块（后者在测试进程里解析不了）。
   */
  describe('ubean:env/* virtual modules (env-v1 contract)', () => {
    it('client 字段内联成字面量，server 字段带上声明的类型', async () => {
      const res = await getJson('/api/env-typed');
      expect(res.status).toBe(200);

      const data = res.data as {
        client: { appTitle: string; apiPrefix: string };
        server: { port: number; portType: string; hasSecret: boolean; hasRedisUrl: boolean };
      };

      expect(data.client.appTitle).toBe('ubean-test');
      expect(data.client.apiPrefix).toBe('/api');

      // number 字段真的被 `Number()` 转换过，而不是留成字符串
      expect(data.server.portType).toBe('number');
      expect(data.server.port).toBe(9527);

      expect(data.server.hasSecret).toBe(true);
      // optional 且未提供 → undefined，而不是报错
      expect(data.server.hasRedisUrl).toBe(false);
    });

    it('客户端页面拿到的是内联后的字面量', async () => {
      const res = await getJson('/env-client');
      expect(res.status).toBe(200);
      expect(res.text).toContain('ubean-test');
      expect(res.text).toContain('/api');
    });
  });
});
