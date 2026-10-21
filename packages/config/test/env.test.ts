import { describe, expect, it } from 'vitest';
import { resolveEnvConfig } from '../src/env';

/**
 * `resolveEnvConfig()` 只归一化，不取值（取值发生在构建期）。这里锁住的是
 * **分组糖已删除**这条契约。
 *
 * 为什么不只靠 `normalizeEnvSchema()` 的报错：`resolveEnvConfig()` 是配置加载链上
 * 更早的一环，它只取 `config.schema`。如果它静默忽略 `server:` / `public:`，用户的字段
 * 会在这里消失，`normalizeEnvSchema()` 根本收不到那几个键 —— 于是「配置里写了但环境变量
 * 全是 undefined」，且没有任何报错。
 */
describe('resolveEnvConfig()', () => {
  it('无配置时返回空 schema', () => {
    expect(resolveEnvConfig()).toEqual({ schema: {}, mode: undefined });
  });

  it('扁平 schema 原样透传', () => {
    const schema = { PORT: { __ubeanEnvField: true, type: 'number', context: 'server', access: 'public' } };
    const resolved = resolveEnvConfig({ schema: schema as never, mode: 'throw' });

    expect(resolved.schema).toEqual(schema);
    expect(resolved.mode).toBe('throw');
  });

  it('`server:` 分组直接报错，不静默摊平成空 schema', () => {
    expect(() => resolveEnvConfig({ server: { PORT: {} } } as never)).toThrow(/grouped `server:` schemas were removed/);
  });

  it('`public:` 分组直接报错', () => {
    expect(() => resolveEnvConfig({ public: { APP: {} } } as never)).toThrow(/grouped `public:` schemas were removed/);
  });

  it('报错信息给出可执行的替代写法', () => {
    expect(() => resolveEnvConfig({ server: {} } as never)).toThrow(/envField\.(string|number|boolean)/);
  });
});
