/**
 * P9-28 Feature Flags / A/B Testing —— 单元测试
 *
 * 覆盖:
 * - 内存 store
 * - defineFeatureFlag / defineExperiment
 * - evaluateFlag (boolean / percentage / multivariate)
 * - getVariant (variants / traffic / segment)
 * - 一致性分配(相同用户始终获得相同 variant)
 * - 用户分群(segment rules: eq / in / contains / gt / lt 等)
 * - 中间件(useFlags / useExperiments / useFlagContext)
 * - 工具函数(list / remove)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { UbeanEnv } from '@ubean/types';
import {
  createMemoryFeatureFlagStore,
  setGlobalFeatureFlagStore,
  getGlobalFeatureFlagStore,
  clearFeatureFlags,
  defineFeatureFlag,
  defineExperiment,
  evaluateFlag,
  evaluateFlagWithReason,
  getVariant,
  getVariantAssignment,
  extractFlagContext,
  createFeatureFlagsMiddleware,
  useFlags,
  useExperiments,
  useFlagContext,
  evaluateFlagFromContext,
  getVariantFromContext,
  listFlagNames,
  listExperimentNames,
  removeFeatureFlag,
  removeExperiment
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* 工具:构造测试用 Context                                                       */
/* -------------------------------------------------------------------------- */

function makeHonoContext(
  overrides: {
    headers?: Record<string, string>;
    vars?: Record<string, unknown>;
  } = {}
): Context<UbeanEnv> {
  const headers = new Headers(overrides.headers || {});
  const vars = overrides.vars || {};
  return {
    req: {
      method: 'GET',
      url: 'http://example.com/',
      path: '/',
      header: (name: string) => headers.get(name.toLowerCase()) || undefined,
      raw: { headers } as any
    } as any,
    res: { status: 200, headers: new Headers() } as any,
    get: ((key: string) => vars[key]) as any,
    set: ((key: string, value: unknown) => {
      vars[key] = value;
    }) as any
  } as unknown as Context<UbeanEnv>;
}

beforeEach(() => {
  clearFeatureFlags();
});

afterEach(() => {
  clearFeatureFlags();
});

/* -------------------------------------------------------------------------- */
/* 内存 store                                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: createMemoryFeatureFlagStore', () => {
  it('starts empty', async () => {
    const store = createMemoryFeatureFlagStore();
    expect(await store.listFlags()).toEqual([]);
    expect(await store.listExperiments()).toEqual([]);
    expect(await store.getFlag('nonexistent')).toBeUndefined();
    expect(await store.getExperiment('nonexistent')).toBeUndefined();
  });

  it('setFlag / getFlag / deleteFlag / listFlags', async () => {
    const store = createMemoryFeatureFlagStore();
    const def = { name: 'flag1', kind: 'boolean' as const, defaultValue: false };
    await store.setFlag('flag1', def);
    expect(await store.getFlag('flag1')).toBe(def);
    expect(await store.listFlags()).toHaveLength(1);
    await store.deleteFlag('flag1');
    expect(await store.getFlag('flag1')).toBeUndefined();
  });

  it('setExperiment / getExperiment / deleteExperiment / listExperiments', async () => {
    const store = createMemoryFeatureFlagStore();
    const def = {
      name: 'exp1',
      variants: [{ key: 'a', weight: 1 }],
      traffic: 100
    };
    await store.setExperiment('exp1', def);
    expect(await store.getExperiment('exp1')).toBe(def);
    expect(await store.listExperiments()).toHaveLength(1);
    await store.deleteExperiment('exp1');
    expect(await store.getExperiment('exp1')).toBeUndefined();
  });

  it('overwrites existing flag', async () => {
    const store = createMemoryFeatureFlagStore();
    await store.setFlag('flag1', { name: 'flag1', kind: 'boolean', defaultValue: false });
    await store.setFlag('flag1', { name: 'flag1', kind: 'percentage', defaultValue: true, percentage: 50 });
    const flag = await store.getFlag('flag1');
    expect(flag?.kind).toBe('percentage');
    expect(flag?.percentage).toBe(50);
  });
});

/* -------------------------------------------------------------------------- */
/* 全局 store                                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: global store', () => {
  it('creates a default memory store on first access', () => {
    const store1 = getGlobalFeatureFlagStore();
    const store2 = getGlobalFeatureFlagStore();
    expect(store1).toBe(store2);
  });

  it('setGlobalFeatureFlagStore overrides default', () => {
    const custom = createMemoryFeatureFlagStore();
    setGlobalFeatureFlagStore(custom);
    expect(getGlobalFeatureFlagStore()).toBe(custom);
  });

  it('setGlobalFeatureFlagStore(null) clears to be re-created on next access', () => {
    const original = getGlobalFeatureFlagStore();
    setGlobalFeatureFlagStore(null);
    const next = getGlobalFeatureFlagStore();
    expect(next).not.toBe(original);
  });
});

/* -------------------------------------------------------------------------- */
/* defineFeatureFlag / defineExperiment                                        */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: defineFeatureFlag', () => {
  it('defines a boolean flag with default options', () => {
    const flag = defineFeatureFlag('feature_a');
    expect(flag.name).toBe('feature_a');
    expect(flag.kind).toBe('boolean');
    expect(flag.defaultValue).toBe(false);
    expect(flag.enabled).toBe(true);
    expect(listFlagNames()).toContain('feature_a');
  });

  it('defines a percentage flag', () => {
    const flag = defineFeatureFlag('rollout', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false
    });
    expect(flag.kind).toBe('percentage');
    expect(flag.percentage).toBe(50);
  });

  it('defines a multivariate flag with variants', () => {
    const flag = defineFeatureFlag('checkout_flow', {
      kind: 'multivariate',
      variants: [
        { key: 'control', weight: 1, value: 'v1' },
        { key: 'treatment', weight: 1, value: 'v2' }
      ],
      defaultValue: 'v1'
    });
    expect(flag.kind).toBe('multivariate');
    expect(flag.variants).toHaveLength(2);
    expect(flag.defaultValue).toBe('v1');
  });

  it('uses provided description and salt', () => {
    const flag = defineFeatureFlag('flag_with_meta', {
      description: 'test flag',
      salt: 'my-salt'
    });
    expect(flag.description).toBe('test flag');
    expect(flag.salt).toBe('my-salt');
  });

  it('can be disabled', () => {
    const flag = defineFeatureFlag('disabled_flag', { enabled: false });
    expect(flag.enabled).toBe(false);
  });
});

describe('P9-28 Feature Flags: defineExperiment', () => {
  it('defines an experiment with variants', () => {
    const exp = defineExperiment('ab_test', {
      variants: [
        { key: 'control', weight: 1 },
        { key: 'treatment', weight: 1 }
      ]
    });
    expect(exp.name).toBe('ab_test');
    expect(exp.variants).toHaveLength(2);
    expect(exp.traffic).toBe(100);
    expect(exp.enabled).toBe(true);
    expect(listExperimentNames()).toContain('ab_test');
  });

  it('uses custom traffic and description', () => {
    const exp = defineExperiment('exp2', {
      variants: [{ key: 'a', weight: 1 }],
      traffic: 25,
      description: 'partial experiment'
    });
    expect(exp.traffic).toBe(25);
    expect(exp.description).toBe('partial experiment');
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateFlag - boolean                                                      */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: evaluateFlag (boolean)', () => {
  it('returns true for enabled boolean flag', async () => {
    defineFeatureFlag('bool_flag');
    const result = await evaluateFlag('bool_flag', { userId: 'u1' });
    expect(result).toBe(true);
  });

  it('returns false for unknown flag', async () => {
    const result = await evaluateFlag('does_not_exist');
    expect(result).toBe(false);
  });

  it('returns defaultValue for disabled flag', async () => {
    defineFeatureFlag('disabled_flag', { enabled: false, defaultValue: false });
    const result = await evaluateFlag('disabled_flag');
    expect(result).toBe(false);
  });

  it('evaluateFlagWithReason returns disabled reason', async () => {
    defineFeatureFlag('flag', { enabled: false, defaultValue: false });
    const evalResult = await evaluateFlagWithReason('flag');
    expect(evalResult.reason).toBe('disabled');
    expect(evalResult.value).toBe(false);
  });

  it('evaluateFlagWithReason returns enabled reason', async () => {
    defineFeatureFlag('flag');
    const evalResult = await evaluateFlagWithReason('flag', { userId: 'u1' });
    expect(evalResult.reason).toBe('enabled');
    expect(evalResult.value).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateFlag - percentage                                                   */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: evaluateFlag (percentage)', () => {
  it('returns true when percentage is 100', async () => {
    defineFeatureFlag('full_rollout', {
      kind: 'percentage',
      percentage: 100,
      defaultValue: false
    });
    // 多个用户应该全部命中
    for (let i = 0; i < 20; i++) {
      const result = await evaluateFlag('full_rollout', { userId: `user_${i}` });
      expect(result).toBe(true);
    }
  });

  it('returns false when percentage is 0', async () => {
    defineFeatureFlag('no_rollout', {
      kind: 'percentage',
      percentage: 0,
      defaultValue: false
    });
    for (let i = 0; i < 20; i++) {
      const result = await evaluateFlag('no_rollout', { userId: `user_${i}` });
      expect(result).toBe(false);
    }
  });

  it('returns consistent value for same user', async () => {
    defineFeatureFlag('partial_rollout', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false
    });
    const firstResult = await evaluateFlag('partial_rollout', { userId: 'stable_user' });
    const secondResult = await evaluateFlag('partial_rollout', { userId: 'stable_user' });
    expect(firstResult).toBe(secondResult);
  });

  it('different users get different buckets (some true, some false at 50%)', async () => {
    defineFeatureFlag('half', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false
    });
    const results: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      results.push((await evaluateFlag('half', { userId: `user_${i}` })) as boolean);
    }
    const trues = results.filter(Boolean).length;
    // 50% ± 应该接近一半,放宽断言
    expect(trues).toBeGreaterThan(20);
    expect(trues).toBeLessThan(80);
  });

  it('returns true for anonymous user only when bucketed within percentage', async () => {
    defineFeatureFlag('anon_test', {
      kind: 'percentage',
      percentage: 100,
      defaultValue: false
    });
    const result = await evaluateFlag('anon_test', {});
    expect(result).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateFlag - multivariate                                                 */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: evaluateFlag (multivariate)', () => {
  it('returns a variant value for multivariate flag', async () => {
    defineFeatureFlag('checkout_flow', {
      kind: 'multivariate',
      variants: [
        { key: 'control', weight: 1, value: 'v1' },
        { key: 'treatment', weight: 1, value: 'v2' }
      ],
      defaultValue: 'v1'
    });
    const result = await evaluateFlag('checkout_flow', { userId: 'user1' });
    expect(['v1', 'v2']).toContain(result);
  });

  it('returns defaultValue when no variants provided', async () => {
    defineFeatureFlag('empty_mv', {
      kind: 'multivariate',
      defaultValue: 'fallback'
    });
    const result = await evaluateFlag('empty_mv', { userId: 'user1' });
    expect(result).toBe('fallback');
  });

  it('returns consistent variant for same user', async () => {
    defineFeatureFlag('consistent_mv', {
      kind: 'multivariate',
      variants: [
        { key: 'a', weight: 1, value: 'A' },
        { key: 'b', weight: 1, value: 'B' },
        { key: 'c', weight: 1, value: 'C' }
      ],
      defaultValue: 'A'
    });
    const r1 = await evaluateFlag('consistent_mv', { userId: 'stable_user' });
    const r2 = await evaluateFlag('consistent_mv', { userId: 'stable_user' });
    expect(r1).toBe(r2);
  });

  it('evaluateFlagWithReason returns variant key', async () => {
    defineFeatureFlag('mv_reason', {
      kind: 'multivariate',
      variants: [
        { key: 'a', weight: 1, value: 'A' },
        { key: 'b', weight: 1, value: 'B' }
      ],
      defaultValue: 'A'
    });
    const evalResult = await evaluateFlagWithReason('mv_reason', { userId: 'u1' });
    expect(evalResult.reason).toBe('variant');
    expect(['a', 'b']).toContain(evalResult.variant);
  });

  it('weighted variants distribute traffic proportionally', async () => {
    defineFeatureFlag('weighted', {
      kind: 'multivariate',
      variants: [
        { key: 'a', weight: 9, value: 'A' },
        { key: 'b', weight: 1, value: 'B' }
      ],
      defaultValue: 'A'
    });
    const counts: Record<string, number> = { A: 0, B: 0 };
    for (let i = 0; i < 100; i++) {
      const v = await evaluateFlag('weighted', { userId: `u_${i}` });
      counts[v as string]++;
    }
    // 9:1 ratio → A should dominate
    expect(counts.A).toBeGreaterThan(counts.B * 2);
  });
});

/* -------------------------------------------------------------------------- */
/* getVariant - 实验                                                            */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: getVariant', () => {
  it('returns a variant key for an experiment', async () => {
    defineExperiment('exp1', {
      variants: [
        { key: 'control', weight: 1 },
        { key: 'treatment', weight: 1 }
      ]
    });
    const v = await getVariant('exp1', { userId: 'user1' });
    expect(['control', 'treatment']).toContain(v);
  });

  it('returns undefined for non-existent experiment', async () => {
    const v = await getVariant('does_not_exist');
    expect(v).toBe('');
  });

  it('returns undefined for disabled experiment', async () => {
    defineExperiment('disabled_exp', {
      enabled: false,
      variants: [{ key: 'a', weight: 1 }]
    });
    const v = await getVariant('disabled_exp');
    expect(v).toBe('');
  });

  it('returns undefined for experiment without variants', async () => {
    defineExperiment('empty_exp', {
      // @ts-expect-error testing no variants
      variants: []
    });
    const v = await getVariant('empty_exp');
    expect(v).toBe('');
  });

  it('respects traffic allocation', async () => {
    defineExperiment('partial_exp', {
      variants: [
        { key: 'control', weight: 1 },
        { key: 'treatment', weight: 1 }
      ],
      traffic: 0
    });
    for (let i = 0; i < 20; i++) {
      const v = await getVariant('partial_exp', { userId: `u_${i}` });
      expect(v).toBe('');
    }
  });

  it('100% traffic + single variant always returns the variant', async () => {
    defineExperiment('full_exp', {
      variants: [{ key: 'solo', weight: 1 }],
      traffic: 100
    });
    for (let i = 0; i < 20; i++) {
      const v = await getVariant('full_exp', { userId: `u_${i}` });
      expect(v).toBe('solo');
    }
  });

  it('returns consistent variant for same user', async () => {
    defineExperiment('consistent_exp', {
      variants: [
        { key: 'a', weight: 1 },
        { key: 'b', weight: 1 },
        { key: 'c', weight: 1 }
      ]
    });
    const v1 = await getVariant('consistent_exp', { userId: 'stable_user' });
    const v2 = await getVariant('consistent_exp', { userId: 'stable_user' });
    expect(v1).toBe(v2);
  });

  it('getVariantAssignment returns full assignment info', async () => {
    defineExperiment('exp_info', {
      variants: [
        { key: 'a', weight: 1 },
        { key: 'b', weight: 1 }
      ],
      traffic: 50
    });
    const assignment = await getVariantAssignment('exp_info', { userId: 'u1' });
    expect(assignment.name).toBe('exp_info');
    expect(typeof assignment.inExperiment).toBe('boolean');
    if (assignment.inExperiment) {
      expect(['a', 'b']).toContain(assignment.variant);
      expect(assignment.reason).toBe('enabled');
    } else {
      expect(assignment.reason).toBe('traffic');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* segment rules                                                                */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: segment rules', () => {
  it('flag with segments returns defaultValue when user does not match', async () => {
    defineFeatureFlag('internal_only', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [
            {
              attribute: 'country',
              operator: 'eq',
              value: 'CN'
            }
          ]
        }
      ]
    });
    const result = await evaluateFlagWithReason('internal_only', {
      userId: 'u1',
      country: 'US'
    });
    expect(result.value).toBe(false);
    expect(result.reason).toBe('segment');
  });

  it('flag with segments returns true when user matches segment', async () => {
    defineFeatureFlag('internal_only2', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [{ attribute: 'country', operator: 'eq', value: 'CN' }]
        }
      ]
    });
    const result = await evaluateFlagWithReason('internal_only2', {
      userId: 'u1',
      country: 'CN'
    });
    expect(result.value).toBe(true);
    expect(result.reason).toBe('enabled');
  });

  it('"in" operator matches list of values', async () => {
    defineFeatureFlag('locale_test', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [
            {
              attribute: 'locale',
              operator: 'in',
              values: ['zh-CN', 'zh-TW']
            }
          ]
        }
      ]
    });
    const hit = await evaluateFlag('locale_test', { userId: 'u1', locale: 'zh-CN' });
    const miss = await evaluateFlag('locale_test', { userId: 'u2', locale: 'en-US' });
    expect(hit).toBe(true);
    expect(miss).toBe(false);
  });

  it('"contains" operator matches substring', async () => {
    defineFeatureFlag('ua_test', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [
            {
              attribute: 'userAgent',
              operator: 'contains',
              value: 'Mobile'
            }
          ]
        }
      ]
    });
    const mobile = await evaluateFlag('ua_test', { userId: 'u1', userAgent: 'iPhone Mobile Safari' });
    const desktop = await evaluateFlag('ua_test', { userId: 'u2', userAgent: 'Chrome Desktop' });
    expect(mobile).toBe(true);
    expect(desktop).toBe(false);
  });

  it('"gt" / "lt" operators work with numbers', async () => {
    defineFeatureFlag('age_gt_18', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [{ attribute: 'age', operator: 'gt', value: 18 }]
        }
      ]
    });
    expect(await evaluateFlag('age_gt_18', { userId: 'u1', age: 25 })).toBe(true);
    expect(await evaluateFlag('age_gt_18', { userId: 'u2', age: 18 })).toBe(false);
    expect(await evaluateFlag('age_gt_18', { userId: 'u3', age: 10 })).toBe(false);
  });

  it('"exists" / "not_exists" operators', async () => {
    defineFeatureFlag('has_email', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [{ attribute: 'email', operator: 'exists' }]
        }
      ]
    });
    expect(await evaluateFlag('has_email', { userId: 'u1', email: 'a@b.com' })).toBe(true);
    expect(await evaluateFlag('has_email', { userId: 'u2' })).toBe(false);
  });

  it('segment with multiple rules (all must match)', async () => {
    defineFeatureFlag('cn_beta', {
      kind: 'boolean',
      defaultValue: false,
      segments: [
        {
          rules: [
            { attribute: 'country', operator: 'eq', value: 'CN' },
            { attribute: 'beta', operator: 'eq', value: true }
          ]
        }
      ]
    });
    expect(await evaluateFlag('cn_beta', { userId: 'u1', country: 'CN', beta: true })).toBe(true);
    expect(await evaluateFlag('cn_beta', { userId: 'u2', country: 'CN', beta: false })).toBe(false);
    expect(await evaluateFlag('cn_beta', { userId: 'u3', country: 'US', beta: true })).toBe(false);
  });

  it('experiment with segments respects segment match', async () => {
    defineExperiment('cn_only_exp', {
      variants: [
        { key: 'a', weight: 1 },
        { key: 'b', weight: 1 }
      ],
      traffic: 100,
      segments: [
        {
          rules: [{ attribute: 'country', operator: 'eq', value: 'CN' }]
        }
      ]
    });
    const inSegment = await getVariantAssignment('cn_only_exp', {
      userId: 'u1',
      country: 'CN'
    });
    const outSegment = await getVariantAssignment('cn_only_exp', {
      userId: 'u2',
      country: 'US'
    });
    expect(inSegment.inExperiment).toBe(true);
    expect(outSegment.inExperiment).toBe(false);
    expect(outSegment.reason).toBe('segment');
  });
});

/* -------------------------------------------------------------------------- */
/* extractFlagContext                                                          */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: extractFlagContext', () => {
  it('extracts userId / sessionId / locale from c.get', () => {
    const c = makeHonoContext({
      vars: { userId: 'user123', sessionId: 'sess456', locale: 'zh-CN' }
    });
    const ctx = extractFlagContext(c);
    expect(ctx.userId).toBe('user123');
    expect(ctx.sessionId).toBe('sess456');
    expect(ctx.locale).toBe('zh-CN');
  });

  it('extracts anonymousId from cookie', () => {
    const c = makeHonoContext({
      headers: { cookie: 'other=val; ubean_aid=anon-abc; foo=bar' }
    });
    const ctx = extractFlagContext(c);
    expect(ctx.anonymousId).toBe('anon-abc');
  });

  it('extracts IP from x-forwarded-for', () => {
    const c = makeHonoContext({
      headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.2' }
    });
    const ctx = extractFlagContext(c);
    expect(ctx.ip).toBe('203.0.113.5');
  });

  it('extracts IP from x-real-ip when no x-forwarded-for', () => {
    const c = makeHonoContext({ headers: { 'x-real-ip': '198.51.100.10' } });
    const ctx = extractFlagContext(c);
    expect(ctx.ip).toBe('198.51.100.10');
  });
});

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: createFeatureFlagsMiddleware', () => {
  it('attaches flag evaluations to context', async () => {
    defineFeatureFlag('flag1', { kind: 'boolean', defaultValue: false });
    defineFeatureFlag('flag2', { kind: 'boolean', defaultValue: true });

    const app = new Hono();
    app.use('*', createFeatureFlagsMiddleware());
    app.get('/', c => {
      const flags = useFlags(c);
      return c.json({ flags });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(body.flags.flag1).toBe(true);
    expect(body.flags.flag2).toBe(true);
  });

  it('attaches experiment assignments to context', async () => {
    defineExperiment('exp1', {
      variants: [
        { key: 'a', weight: 1 },
        { key: 'b', weight: 1 }
      ]
    });

    const app = new Hono();
    app.use('*', createFeatureFlagsMiddleware());
    app.get('/', c => {
      const experiments = useExperiments(c);
      return c.json({ experiments });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(['a', 'b']).toContain(body.experiments.exp1);
  });

  it('uses custom getContext', async () => {
    defineFeatureFlag('user_flag', {
      kind: 'percentage',
      percentage: 100,
      defaultValue: false
    });

    const app = new Hono();
    app.use(
      '*',
      createFeatureFlagsMiddleware({
        getContext: () => ({ userId: 'fixed-user' })
      })
    );
    app.get('/', c => {
      const flags = useFlags(c);
      const ctx = useFlagContext(c);
      return c.json({ flags, ctx });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(body.flags.user_flag).toBe(true);
    expect(body.ctx.userId).toBe('fixed-user');
  });

  it('useFlagContext returns the extracted context', async () => {
    const app = new Hono();
    app.use('*', createFeatureFlagsMiddleware());
    app.get('/', c => {
      const ctx = useFlagContext(c);
      return c.json({ userId: ctx.userId });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    // No userId in context, so should be undefined
    expect(body.userId).toBeUndefined();
  });
});

describe('P9-28 Feature Flags: evaluateFlagFromContext / getVariantFromContext', () => {
  it('evaluateFlagFromContext uses middleware-set context', async () => {
    defineFeatureFlag('ctx_flag', {
      kind: 'percentage',
      percentage: 100,
      defaultValue: false
    });

    const app = new Hono();
    app.use(
      '*',
      createFeatureFlagsMiddleware({
        getContext: () => ({ userId: 'ctx-user' })
      })
    );
    app.get('/', async c => {
      const v = await evaluateFlagFromContext(c, 'ctx_flag');
      return c.json({ v });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(body.v).toBe(true);
  });

  it('getVariantFromContext uses middleware-set context', async () => {
    defineExperiment('ctx_exp', {
      variants: [
        { key: 'a', weight: 1 },
        { key: 'b', weight: 1 }
      ]
    });

    const app = new Hono();
    app.use(
      '*',
      createFeatureFlagsMiddleware({
        getContext: () => ({ userId: 'ctx-user' })
      })
    );
    app.get('/', async c => {
      const v = await getVariantFromContext(c, 'ctx_exp');
      return c.json({ v });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(['a', 'b']).toContain(body.v);
  });

  it('works without middleware by extracting context on-demand', async () => {
    defineFeatureFlag('on_demand_flag', {
      kind: 'percentage',
      percentage: 100,
      defaultValue: false
    });

    const app = new Hono();
    app.get('/', async c => {
      const v = await evaluateFlagFromContext(c, 'on_demand_flag');
      return c.json({ v });
    });

    const res = await app.request('http://example.com/');
    const body = await res.json();
    expect(body.v).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                     */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: utility functions', () => {
  it('listFlagNames / listExperimentNames', () => {
    defineFeatureFlag('f1');
    defineFeatureFlag('f2');
    defineExperiment('e1', { variants: [{ key: 'a', weight: 1 }] });

    const flagNames = listFlagNames();
    expect(flagNames).toContain('f1');
    expect(flagNames).toContain('f2');

    const expNames = listExperimentNames();
    expect(expNames).toContain('e1');
  });

  it('removeFeatureFlag / removeExperiment', async () => {
    defineFeatureFlag('removable_flag');
    defineExperiment('removable_exp', {
      variants: [{ key: 'a', weight: 1 }]
    });

    expect(listFlagNames()).toContain('removable_flag');
    expect(listExperimentNames()).toContain('removable_exp');

    removeFeatureFlag('removable_flag');
    removeExperiment('removable_exp');

    expect(listFlagNames()).not.toContain('removable_flag');
    expect(listExperimentNames()).not.toContain('removable_exp');

    const store = getGlobalFeatureFlagStore();
    expect(await store.getFlag('removable_flag')).toBeUndefined();
    expect(await store.getExperiment('removable_exp')).toBeUndefined();
  });

  it('clearFeatureFlags clears everything', () => {
    defineFeatureFlag('f1');
    defineExperiment('e1', { variants: [{ key: 'a', weight: 1 }] });
    clearFeatureFlags();
    expect(listFlagNames()).toHaveLength(0);
    expect(listExperimentNames()).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 一致性 / 加权分配集成测试                                                     */
/* -------------------------------------------------------------------------- */

describe('P9-28 Feature Flags: consistency', () => {
  it('two flags with different salts may give different buckets', async () => {
    defineFeatureFlag('flag_a', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false,
      salt: 'salt-a'
    });
    defineFeatureFlag('flag_b', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false,
      salt: 'salt-b'
    });

    // 至少有一个用户在两个 flag 上得到不同结果
    let foundDifference = false;
    for (let i = 0; i < 50; i++) {
      const a = await evaluateFlag('flag_a', { userId: `u_${i}` });
      const b = await evaluateFlag('flag_b', { userId: `u_${i}` });
      if (a !== b) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });

  it('same flag with same user always returns same result across many calls', async () => {
    defineFeatureFlag('stable', {
      kind: 'percentage',
      percentage: 50,
      defaultValue: false
    });
    const results = new Set<boolean>();
    for (let i = 0; i < 30; i++) {
      results.add((await evaluateFlag('stable', { userId: 'u_stable' })) as boolean);
    }
    expect(results.size).toBe(1);
  });
});
