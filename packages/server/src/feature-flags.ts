/**
 * Feature Flags / A/B Testing 原语 (P9-28)
 *
 * 内置功能开关与 A/B 测试原语。
 *
 * 设计:
 * - `defineFeatureFlag(name, options)` 定义一个 feature flag
 *   (boolean / multivariate / percentage rollout)
 * - `defineExperiment(name, options)` 定义一个 A/B 测试实验
 *   (variants + 流量分配)
 * - `evaluateFlag(name, context?)` 评估一个 flag(返回 boolean 或 variant value)
 * - `getVariant(name, context?)` 获取一个实验的 variant 分配
 * - `createFeatureFlagsMiddleware(options)` 中间件,把 flag/experiment 评估附加到 context
 * - `useFlags(c)` 获取当前 context 的所有 flag
 * - `useExperiments(c)` 获取当前 context 的所有实验分配
 *
 * 关键特性:
 * - 一致性分配:相同用户 ID 始终获得相同 variant(基于哈希)
 * - 用户分群:按 user ID / locale / 自定义 attributes 进行分群
 * - 存储:内存默认,可插拔 store 接口
 *
 * 对齐 LaunchDarkly / Statsig / GrowthBook 的核心 API 形态。
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

export type FlagValue = boolean | string | number;

export interface FlagContext {
  /** 用户 ID(用于一致性分配) */
  userId?: string;
  /** 设备 ID / 匿名 ID */
  anonymousId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 语言/地区 */
  locale?: string;
  /** 国家 */
  country?: string;
  /** 自定义属性 */
  attributes?: Record<string, unknown>;
  /** IP(用于地理分群) */
  ip?: string;
  /** Hono 上下文引用(由中间件设置) */
  [key: string]: unknown;
}

export type FlagKind = 'boolean' | 'multivariate' | 'percentage';

export interface SegmentRule {
  /** 匹配的属性名 */
  attribute: string;
  /** 操作符 */
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'not_exists';
  /** 期望值 */
  value?: unknown;
  /** 期望值列表(in / not_in 用) */
  values?: unknown[];
}

export interface Segment {
  /** 段名称 */
  name?: string;
  /** 规则(全部匹配才命中) */
  rules: SegmentRule[];
  /** 该段是否启用 */
  enabled?: boolean;
}

export interface Variant {
  /** variant 唯一标识 */
  key: string;
  /** variant 显示名 */
  name?: string;
  /** variant 权重(用于流量分配,所有 variant 权重之和决定分配比例) */
  weight: number;
  /** variant 值(可任意类型,字符串/JSON) */
  value?: unknown;
  /** variant 描述 */
  description?: string;
}

export interface FeatureFlagOptions {
  /** flag 类型,默认 'boolean' */
  kind?: FlagKind;
  /** 默认值(评估失败时返回) */
  defaultValue?: FlagValue;
  /** multivariate 类型的可选值 */
  variants?: Variant[];
  /** 百分比 rollout(0-100),仅当 kind='percentage' 时生效 */
  percentage?: number;
  /** 用户分群:命中段则启用 */
  segments?: Segment[];
  /** 全局开关,默认 true */
  enabled?: boolean;
  /** 描述 */
  description?: string;
  /** 用于一致性哈希的 salt(避免不同 flag 对同一用户产生相同分配) */
  salt?: string;
}

export interface ExperimentOptions {
  /** 实验描述 */
  description?: string;
  /** variants */
  variants: Variant[];
  /** 流量分配比例(0-100),默认 100 */
  traffic?: number;
  /** 用户分群:命中段才进入实验 */
  segments?: Segment[];
  /** 是否启用,默认 true */
  enabled?: boolean;
  /** 一致性哈希 salt */
  salt?: string;
}

export interface FeatureFlagDefinition extends FeatureFlagOptions {
  name: string;
  kind: FlagKind;
  defaultValue: FlagValue;
}

export interface ExperimentDefinition extends ExperimentOptions {
  name: string;
}

export interface FlagEvaluation {
  name: string;
  kind: FlagKind;
  value: FlagValue;
  reason: 'default' | 'enabled' | 'disabled' | 'segment' | 'percentage' | 'variant';
  variant?: string;
}

export interface ExperimentAssignment {
  name: string;
  variant: string;
  inExperiment: boolean;
  reason: 'enabled' | 'disabled' | 'segment' | 'traffic' | 'no_variants';
}

export interface FeatureFlagStore {
  getFlag(name: string): Promise<FeatureFlagDefinition | undefined>;
  setFlag(name: string, flag: FeatureFlagDefinition): Promise<void>;
  deleteFlag(name: string): Promise<void>;
  listFlags(): Promise<FeatureFlagDefinition[]>;
  getExperiment(name: string): Promise<ExperimentDefinition | undefined>;
  setExperiment(name: string, exp: ExperimentDefinition): Promise<void>;
  deleteExperiment(name: string): Promise<void>;
  listExperiments(): Promise<ExperimentDefinition[]>;
}

export interface FeatureFlagsMiddlewareOptions {
  /** 使用指定 store(不传则用全局 store) */
  store?: FeatureFlagStore;
  /** 从 Hono 上下文中提取 flag context */
  getContext?: (c: Context<UbeanEnv>) => FlagContext | Promise<FlagContext>;
  /** 把评估结果写入 c.set 的 key 名,默认 'flags' / 'experiments' */
  flagsVarKey?: string;
  experimentsVarKey?: string;
}

/* -------------------------------------------------------------------------- */
/* 内存 store 实现                                                              */
/* -------------------------------------------------------------------------- */

export function createMemoryFeatureFlagStore(): FeatureFlagStore {
  const flags = new Map<string, FeatureFlagDefinition>();
  const experiments = new Map<string, ExperimentDefinition>();
  return {
    async getFlag(name) {
      return flags.get(name);
    },
    async setFlag(name, flag) {
      flags.set(name, flag);
    },
    async deleteFlag(name) {
      flags.delete(name);
    },
    async listFlags() {
      return Array.from(flags.values());
    },
    async getExperiment(name) {
      return experiments.get(name);
    },
    async setExperiment(name, exp) {
      experiments.set(name, exp);
    },
    async deleteExperiment(name) {
      experiments.delete(name);
    },
    async listExperiments() {
      return Array.from(experiments.values());
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 全局 store / registry                                                        */
/* -------------------------------------------------------------------------- */

const flagRegistry = new Map<string, FeatureFlagDefinition>();
const experimentRegistry = new Map<string, ExperimentDefinition>();
let globalStore: FeatureFlagStore | null = null;

/** 设置全局 feature flag store */
export function setGlobalFeatureFlagStore(store: FeatureFlagStore | null): void {
  globalStore = store;
}

/** 获取全局 store(默认内存 store) */
export function getGlobalFeatureFlagStore(): FeatureFlagStore {
  if (!globalStore) {
    globalStore = createMemoryFeatureFlagStore();
  }
  return globalStore;
}

/** 清空全局 store 和 registry(供测试使用) */
export function clearFeatureFlags(): void {
  flagRegistry.clear();
  experimentRegistry.clear();
  globalStore = null;
}

/* -------------------------------------------------------------------------- */
/* 哈希与百分比分配                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 简单的字符串哈希(FNV-1a 32-bit),用于一致性分配
 * 同样的输入始终产生同样的输出,无副作用
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime
    hash = Math.imul(hash, 0x01000193);
  }
  // 转为无符号 32-bit
  return hash >>> 0;
}

/** 返回 0-99 的整数(基于 hash 输入的稳定百分比) */
function hashToBucket(hashInput: string): number {
  const hash = hashString(hashInput);
  return hash % 100;
}

/** 生成一致性哈希的输入 key */
function buildHashKey(name: string, identity: string, salt?: string): string {
  return `${name}:${salt || ''}:${identity}`;
}

function resolveIdentity(context?: FlagContext): string {
  if (!context) return 'anonymous';
  return context.userId || context.anonymousId || context.sessionId || 'anonymous';
}

/* -------------------------------------------------------------------------- */
/* 段匹配                                                                       */
/* -------------------------------------------------------------------------- */

function matchRule(rule: SegmentRule, context: FlagContext): boolean {
  const attrValue = context[rule.attribute];
  switch (rule.operator) {
    case 'eq':
      return attrValue === rule.value;
    case 'neq':
      return attrValue !== rule.value;
    case 'in':
      return Array.isArray(rule.values) && rule.values.includes(attrValue);
    case 'not_in':
      return !Array.isArray(rule.values) || !rule.values.includes(attrValue);
    case 'contains': {
      if (typeof attrValue !== 'string' || typeof rule.value !== 'string') return false;
      return attrValue.includes(rule.value);
    }
    case 'gt':
      return typeof attrValue === 'number' && typeof rule.value === 'number' && attrValue > rule.value;
    case 'lt':
      return typeof attrValue === 'number' && typeof rule.value === 'number' && attrValue < rule.value;
    case 'gte':
      return typeof attrValue === 'number' && typeof rule.value === 'number' && attrValue >= rule.value;
    case 'lte':
      return typeof attrValue === 'number' && typeof rule.value === 'number' && attrValue <= rule.value;
    case 'exists':
      return attrValue !== undefined && attrValue !== null;
    case 'not_exists':
      return attrValue === undefined || attrValue === null;
    default:
      return false;
  }
}

function matchSegment(segment: Segment, context: FlagContext): boolean {
  if (segment.enabled === false) return false;
  if (!segment.rules || segment.rules.length === 0) return true;
  return segment.rules.every(rule => matchRule(rule, context));
}

function matchAnySegment(segments: Segment[] | undefined, context: FlagContext): boolean {
  if (!segments || segments.length === 0) return true;
  return segments.some(seg => matchSegment(seg, context));
}

/* -------------------------------------------------------------------------- */
/* variant 分配(加权)                                                          */
/* -------------------------------------------------------------------------- */

function pickVariant(variants: Variant[], hashInput: string): Variant | undefined {
  if (variants.length === 0) return undefined;
  const totalWeight = variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return variants[0];

  const bucket = hashString(hashInput) % totalWeight;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (bucket < acc) return v;
  }
  return variants[variants.length - 1];
}

/* -------------------------------------------------------------------------- */
/* defineFeatureFlag / defineExperiment                                        */
/* -------------------------------------------------------------------------- */

/**
 * 定义一个 feature flag,注册到全局 registry 和 store
 *
 * @example
 * ```ts
 * defineFeatureFlag('new_dashboard', {
 *   kind: 'percentage',
 *   percentage: 50,
 *   defaultValue: false
 * });
 *
 * defineFeatureFlag('checkout_flow', {
 *   kind: 'multivariate',
 *   variants: [
 *     { key: 'control', weight: 1, value: 'v1' },
 *     { key: 'treatment', weight: 1, value: 'v2' }
 *   ],
 *   defaultValue: 'v1'
 * });
 * ```
 */
export function defineFeatureFlag(name: string, options: FeatureFlagOptions = {}): FeatureFlagDefinition {
  const def: FeatureFlagDefinition = {
    name,
    kind: options.kind || 'boolean',
    defaultValue: options.defaultValue ?? (options.kind === 'multivariate' ? '' : false),
    variants: options.variants,
    percentage: options.percentage,
    segments: options.segments,
    enabled: options.enabled ?? true,
    description: options.description,
    salt: options.salt
  };
  flagRegistry.set(name, def);
  // 同步写入 store(异步,不阻塞)
  void getGlobalFeatureFlagStore().setFlag(name, def);
  return def;
}

/**
 * 定义一个 A/B 测试实验,注册到全局 registry 和 store
 *
 * @example
 * ```ts
 * defineExperiment('checkout_v2_test', {
 *   variants: [
 *     { key: 'control', weight: 1, value: 'A' },
 *     { key: 'treatment', weight: 1, value: 'B' }
 *   ],
 *   traffic: 50
 * });
 * ```
 */
export function defineExperiment(name: string, options: ExperimentOptions): ExperimentDefinition {
  const def: ExperimentDefinition = {
    name,
    description: options.description,
    variants: options.variants,
    traffic: options.traffic ?? 100,
    segments: options.segments,
    enabled: options.enabled ?? true,
    salt: options.salt
  };
  experimentRegistry.set(name, def);
  void getGlobalFeatureFlagStore().setExperiment(name, def);
  return def;
}

/* -------------------------------------------------------------------------- */
/* 评估逻辑                                                                     */
/* -------------------------------------------------------------------------- */

/** 解析 flag 定义(优先 registry,次选 store) */
async function resolveFlag(name: string, store?: FeatureFlagStore): Promise<FeatureFlagDefinition | undefined> {
  if (flagRegistry.has(name)) return flagRegistry.get(name);
  const s = store || getGlobalFeatureFlagStore();
  return s.getFlag(name);
}

async function resolveExperiment(name: string, store?: FeatureFlagStore): Promise<ExperimentDefinition | undefined> {
  if (experimentRegistry.has(name)) return experimentRegistry.get(name);
  const s = store || getGlobalFeatureFlagStore();
  return s.getExperiment(name);
}

/**
 * 评估一个 flag,返回 boolean 或 variant value
 *
 * - boolean flag:返回 true / false
 * - percentage flag:返回 true / false(基于用户身份的稳定百分比)
 * - multivariate flag:返回选中的 variant value
 */
export async function evaluateFlag(
  name: string,
  context: FlagContext = {},
  store?: FeatureFlagStore
): Promise<FlagValue> {
  const evaluation = await evaluateFlagWithReason(name, context, store);
  return evaluation.value;
}

/** 评估 flag 并返回原因(用于调试 / debug) */
export async function evaluateFlagWithReason(
  name: string,
  context: FlagContext = {},
  store?: FeatureFlagStore
): Promise<FlagEvaluation> {
  const flag = await resolveFlag(name, store);
  if (!flag) {
    return { name, kind: 'boolean', value: false, reason: 'default' };
  }

  // 全局关闭
  if (flag.enabled === false) {
    return { name, kind: flag.kind, value: flag.defaultValue, reason: 'disabled' };
  }

  // 段匹配:未命中段则返回默认值
  if (flag.segments && flag.segments.length > 0 && !matchAnySegment(flag.segments, context)) {
    return { name, kind: flag.kind, value: flag.defaultValue, reason: 'segment' };
  }

  const identity = resolveIdentity(context);
  const hashKey = buildHashKey(name, identity, flag.salt);

  switch (flag.kind) {
    case 'boolean':
      return { name, kind: 'boolean', value: true, reason: 'enabled' };

    case 'percentage': {
      const pct = typeof flag.percentage === 'number' ? Math.max(0, Math.min(100, flag.percentage)) : 0;
      const bucket = hashToBucket(hashKey);
      if (bucket < pct) {
        return { name, kind: 'percentage', value: true, reason: 'percentage' };
      }
      return { name, kind: 'percentage', value: false, reason: 'percentage' };
    }

    case 'multivariate': {
      if (!flag.variants || flag.variants.length === 0) {
        return { name, kind: 'multivariate', value: flag.defaultValue, reason: 'default' };
      }
      const variant = pickVariant(flag.variants, hashKey);
      return {
        name,
        kind: 'multivariate',
        value: (variant?.value ?? variant?.key ?? flag.defaultValue) as FlagValue,
        reason: 'variant',
        variant: variant?.key
      };
    }

    default:
      return { name, kind: 'boolean', value: flag.defaultValue, reason: 'default' };
  }
}

/**
 * 获取一个实验分配给当前用户的 variant key
 */
export async function getVariant(
  name: string,
  context: FlagContext = {},
  store?: FeatureFlagStore
): Promise<string | undefined> {
  const assignment = await getVariantAssignment(name, context, store);
  return assignment.variant;
}

/** 获取实验分配详情(用于调试) */
export async function getVariantAssignment(
  name: string,
  context: FlagContext = {},
  store?: FeatureFlagStore
): Promise<ExperimentAssignment> {
  const exp = await resolveExperiment(name, store);
  if (!exp) {
    return { name, variant: '', inExperiment: false, reason: 'no_variants' };
  }

  if (exp.enabled === false) {
    return { name, variant: '', inExperiment: false, reason: 'disabled' };
  }

  if (!exp.variants || exp.variants.length === 0) {
    return { name, variant: '', inExperiment: false, reason: 'no_variants' };
  }

  // 段匹配
  if (exp.segments && exp.segments.length > 0 && !matchAnySegment(exp.segments, context)) {
    return { name, variant: '', inExperiment: false, reason: 'segment' };
  }

  const traffic = typeof exp.traffic === 'number' ? Math.max(0, Math.min(100, exp.traffic)) : 100;
  const identity = resolveIdentity(context);
  const hashKey = buildHashKey(name, identity, exp.salt);

  // 流量桶:0-99,小于 traffic 才进入实验
  const trafficBucket = hashToBucket(hashKey);
  if (trafficBucket >= traffic) {
    return { name, variant: '', inExperiment: false, reason: 'traffic' };
  }

  // 选中 variant
  const variant = pickVariant(exp.variants, hashKey);
  return {
    name,
    variant: variant?.key || '',
    inExperiment: true,
    reason: 'enabled'
  };
}

/* -------------------------------------------------------------------------- */
/* 上下文从 Hono 提取                                                           */
/* -------------------------------------------------------------------------- */

/** 默认从 Hono 上下文提取 flag context */
export function extractFlagContext(c: Context<UbeanEnv>): FlagContext {
  const userId = (c.get('userId' as never) as string | undefined) || undefined;
  const sessionId = (c.get('sessionId' as never) as string | undefined) || undefined;
  const locale = (c.get('locale') as string | undefined) || undefined;
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || undefined;

  // anonymousId 优先来自 cookie,次选 header
  const cookieHeader = c.req.header('cookie') || '';
  let anonymousId: string | undefined;
  const match = cookieHeader.match(/(?:^|;\s*)ubean_aid=([^;]+)/);
  if (match) anonymousId = match[1];

  return {
    userId,
    sessionId,
    locale,
    ip,
    anonymousId
  };
}

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 创建 feature flags 中间件,把 flag/experiment 评估附加到 context
 *
 * @example
 * ```ts
 * app.use('*', createFeatureFlagsMiddleware());
 *
 * app.get('/', (c) => {
 *   const flags = useFlags(c);
 *   if (flags.new_dashboard) {
 *     return c.render('dashboard-v2');
 *   }
 *   return c.render('dashboard');
 * });
 * ```
 */
export function createFeatureFlagsMiddleware(options: FeatureFlagsMiddlewareOptions = {}): MiddlewareHandler<UbeanEnv> {
  const { store, getContext, flagsVarKey = 'flags', experimentsVarKey = 'experiments' } = options;

  return async function featureFlagsMiddleware(c: Context<UbeanEnv>, next: Next) {
    const flagContext = getContext ? await getContext(c) : extractFlagContext(c);

    // 评估所有 flag
    const s = store || getGlobalFeatureFlagStore();
    const allFlags = await s.listFlags();
    const flags: Record<string, FlagValue> = {};
    for (const flag of allFlags) {
      flags[flag.name] = await evaluateFlag(flag.name, flagContext, s);
    }
    c.set(flagsVarKey as never, flags as never);

    // 评估所有实验
    const allExperiments = await s.listExperiments();
    const experiments: Record<string, string> = {};
    for (const exp of allExperiments) {
      const assignment = await getVariantAssignment(exp.name, flagContext, s);
      experiments[exp.name] = assignment.variant;
    }
    c.set(experimentsVarKey as never, experiments as never);

    // 同时也把 flag context 写入,供 handler 后续使用
    c.set('flagContext' as never, flagContext as never);

    await next();
  };
}

/* -------------------------------------------------------------------------- */
/* useFlags / useExperiments                                                   */
/* -------------------------------------------------------------------------- */

/** 从 Hono 上下文中获取所有 flag(由中间件写入) */
export function useFlags(c: Context<UbeanEnv>): Record<string, FlagValue> {
  return (c.get('flags' as never) as Record<string, FlagValue> | undefined) || {};
}

/** 从 Hono 上下文中获取所有 experiment 分配 */
export function useExperiments(c: Context<UbeanEnv>): Record<string, string> {
  return (c.get('experiments' as never) as Record<string, string> | undefined) || {};
}

/** 获取当前请求的 flag context(由中间件写入) */
export function useFlagContext(c: Context<UbeanEnv>): FlagContext {
  return (c.get('flagContext' as never) as FlagContext | undefined) || {};
}

/** 在 handler 中即时评估一个 flag(如果未启用中间件也可用) */
export async function evaluateFlagFromContext(
  c: Context<UbeanEnv>,
  name: string,
  store?: FeatureFlagStore
): Promise<FlagValue> {
  const ctx = (c.get('flagContext' as never) as FlagContext | undefined) || extractFlagContext(c);
  return evaluateFlag(name, ctx, store);
}

/** 在 handler 中即时获取一个实验的 variant(如果未启用中间件也可用) */
export async function getVariantFromContext(
  c: Context<UbeanEnv>,
  name: string,
  store?: FeatureFlagStore
): Promise<string | undefined> {
  const ctx = (c.get('flagContext' as never) as FlagContext | undefined) || extractFlagContext(c);
  return getVariant(name, ctx, store);
}

/* -------------------------------------------------------------------------- */
/* 工具函数                                                                     */
/* -------------------------------------------------------------------------- */

/** 列出所有已注册的 flag 名称 */
export function listFlagNames(): string[] {
  return Array.from(flagRegistry.keys());
}

/** 列出所有已注册的 experiment 名称 */
export function listExperimentNames(): string[] {
  return Array.from(experimentRegistry.keys());
}

/** 从 registry 中删除一个 flag */
export function removeFeatureFlag(name: string): void {
  flagRegistry.delete(name);
  void getGlobalFeatureFlagStore().deleteFlag(name);
}

/** 从 registry 中删除一个实验 */
export function removeExperiment(name: string): void {
  experimentRegistry.delete(name);
  void getGlobalFeatureFlagStore().deleteExperiment(name);
}
