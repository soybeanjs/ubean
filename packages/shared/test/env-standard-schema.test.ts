import { describe, it, expect } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineEnv, resolveEnvSchema } from '../src/env';

/**
 * 一个最小 Standard Schema 实现（零依赖），只用于验证 `~standard.validate()` 真的被调用。
 *
 * 用真实库（zod / valibot）验证互操作的那一条在 `examples/ubean-test/test/env.test.ts`
 * —— 那边已经把 valibot 列为 devDependency。这里要证明的是**协议层**行为，不该让
 * `@ubean/shared` 为了跑测试而依赖某个具体的 schema 库。
 */
function standardSchema(
  fn: (value: unknown) => StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>
): StandardSchemaV1 {
  return {
    '~standard': { version: 1, vendor: 'test', validate: fn }
  };
}

describe('env.schema 的 Standard Schema 支持', () => {
  it('同步 validate → 采用返回的已解析值', () => {
    const env = resolveEnvSchema(
      {
        schema: {
          PORT: standardSchema(value => ({ value: Number(value) }))
        }
      } as any,
      { PORT: '9527' }
    );

    expect(env.success).toBe(true);
    expect(env.data.PORT).toBe(9527);
  });

  it('返回 issues → 校验失败,消息来自 issue', () => {
    const env = resolveEnvSchema(
      {
        schema: {
          JWT_SECRET: standardSchema(() => ({
            issues: [{ message: 'must be at least 32 chars' }]
          }))
        }
      } as any,
      { JWT_SECRET: 'short' }
    );

    expect(env.success).toBe(false);
    expect(env.errors[0]).toMatchObject({
      key: 'JWT_SECRET',
      message: 'must be at least 32 chars'
    });
  });

  it('空字符串按「已声明」（与 envField / legacy 形态一致）', () => {
    const seen: unknown[] = [];
    resolveEnvSchema(
      {
        schema: {
          A: standardSchema(value => {
            seen.push(value);
            return { value };
          })
        }
      } as any,
      { A: '' }
    );

    expect(seen).toEqual([undefined]);
  });

  it('async validate → 明确报「不支持异步」，不静默通过', () => {
    const env = resolveEnvSchema(
      {
        schema: {
          A: standardSchema(async () => ({ value: 'x' }))
        }
      } as any,
      { A: 'x' }
    );

    expect(env.success).toBe(false);
    expect(env.errors[0]!.message).toContain('async Standard Schema validation is not supported');
  });

  it('validate 自身抛错 → 转成校验错误，不让异常穿透', () => {
    const env = resolveEnvSchema(
      {
        schema: {
          A: standardSchema(() => {
            throw new Error('boom');
          })
        }
      } as any,
      { A: 'x' }
    );

    expect(env.success).toBe(false);
    expect(env.errors[0]!.message).toBe('boom');
  });

  it('defineEnv 走同一条路径（回归：早先任何标准 schema 都必定失败）', () => {
    const { env } = defineEnv({
      schema: {
        PORT: standardSchema(value => ({ value: Number(value) }))
      }
    } as any);

    // 不给 source 时读 process.env，这里只断言不因 schema 形态而失败。
    expect(typeof env.PORT === 'number' || env.PORT === undefined).toBe(true);
  });

  it('没有 `~standard` 的对象不会误判（legacy `{ type: String }` 仍走原路径）', () => {
    const env = resolveEnvSchema({ schema: { API_KEY: { type: String, default: 'fallback' } } } as any, {});

    expect(env.data.API_KEY).toBe('fallback');
  });
});
