/**
 * Analytics 原语 (P9-27)
 *
 * 页面浏览与自定义事件分析原语,补充可观测性 (P9-09)。
 *
 * 设计:
 * - `defineAnalyticsProvider(options)` 定义一个分析 provider(注册到全局 registry)
 * - `trackPageView(c, options?)` 跟踪一次页面浏览,自动从上下文中抽取
 *   path / method / status / duration / referrer / userAgent / locale
 * - `trackEvent(c, name, properties?)` 跟踪一次自定义事件
 * - `createAnalyticsMiddleware(options)` 自动跟踪页面浏览的中间件
 * - 内置 providers:'log'(console)、'memory'(内存,用于测试)、'mock'
 * - provider 接口:`track(event, properties, context)`
 *
 * 对齐 Astro 5 `astro:analytics` 实验性 API、SvelteKit 的 hook 模式。
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/types';

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

export interface AnalyticsContext {
  /** 请求路径 */
  path?: string;
  /** HTTP 方法 */
  method?: string;
  /** 响应状态码 */
  status?: number;
  /** 请求耗时(毫秒) */
  duration?: number;
  /** Referrer */
  referrer?: string;
  /** User-Agent */
  userAgent?: string;
  /** Accept-Language 头部 */
  locale?: string;
  /** 请求 ID */
  requestId?: string;
  /** 客户端 IP */
  ip?: string;
  /** 额外的上下文键 */
  [key: string]: unknown;
}

export interface AnalyticsEvent {
  /** 事件名称,如 'page_view'、'click'、'purchase' */
  name: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件类型,默认 'event' */
  type?: 'page_view' | 'event' | 'custom';
}

export interface AnalyticsProperties {
  [key: string]: unknown;
}

export interface AnalyticsRecord {
  event: string;
  type: 'page_view' | 'event' | 'custom';
  timestamp: number;
  properties: AnalyticsProperties;
  context: AnalyticsContext;
}

export interface AnalyticsProvider {
  /** provider 名称 */
  name: string;
  /** 跟踪一个事件 */
  track(event: string, properties: AnalyticsProperties, context: AnalyticsContext): void | Promise<void>;
  /** 可选:刷新缓冲区 */
  flush?(): Promise<void>;
  /** 可选:销毁 provider */
  destroy?(): void;
}

export interface AnalyticsProviderOptions {
  /** provider 名称 */
  name?: string;
  /** track 实现 */
  track: AnalyticsProvider['track'];
  /** flush 实现 */
  flush?: () => Promise<void>;
  /** destroy 实现 */
  destroy?: () => void;
}

export interface AnalyticsTrackOptions {
  /** 是否自动抽取上下文字段,默认 true */
  autoContext?: boolean;
  /** 附加 properties */
  properties?: AnalyticsProperties;
  /** 覆盖事件名(仅 trackPageView 时有效) */
  eventName?: string;
  /** 是否阻塞直到 provider 完成,默认 false */
  awaitFlush?: boolean;
}

export interface AnalyticsMiddlewareOptions {
  /** 使用指定 provider(不传则用全局 provider) */
  provider?: AnalyticsProvider | AnalyticsProvider[];
  /** 自动跟踪的方法,默认 ['GET'] */
  methods?: string[];
  /** 跳过路径(前缀匹配) */
  exclude?: string[];
  /** 是否跟踪所有 status(默认仅 2xx/3xx) */
  trackAllStatus?: boolean;
  /** 自定义是否跟踪的判定 */
  shouldTrack?: (c: Context<UbeanEnv>) => boolean | Promise<boolean>;
  /** 自定义 properties 提取 */
  getProperties?: (c: Context<UbeanEnv>) => AnalyticsProperties | Promise<AnalyticsProperties>;
  /** 自定义事件名 */
  eventName?: string;
}

/* -------------------------------------------------------------------------- */
/* 内置 provider                                                                */
/* -------------------------------------------------------------------------- */

/** log provider:输出到 console */
export function createLogAnalyticsProvider(): AnalyticsProvider {
  return {
    name: 'log',
    track(event, properties, context) {
      const summary: Record<string, unknown> = { event, ...properties };
      if (Object.keys(context).length > 0) {
        summary.context = context;
      }
      // eslint-disable-next-line no-console
      console.log('[analytics]', JSON.stringify(summary));
    }
  };
}

/** memory provider:存储在内存,用于测试 */
export function createMemoryAnalyticsProvider(): AnalyticsProvider & {
  records: AnalyticsRecord[];
  clear(): void;
} {
  const records: AnalyticsRecord[] = [];
  return {
    name: 'memory',
    records,
    track(event, properties, context) {
      records.push({
        event,
        type: event === 'page_view' ? 'page_view' : 'event',
        timestamp: Date.now(),
        properties: { ...properties },
        context: { ...context }
      });
    },
    flush: async () => {},
    destroy() {
      records.length = 0;
    },
    clear() {
      records.length = 0;
    }
  };
}

/** mock provider:记录调用次数,用于断言 */
export function createMockAnalyticsProvider(impl?: Partial<AnalyticsProvider>): AnalyticsProvider & {
  calls: Array<{ event: string; properties: AnalyticsProperties; context: AnalyticsContext }>;
  callCount: number;
  reset(): void;
} {
  const calls: Array<{ event: string; properties: AnalyticsProperties; context: AnalyticsContext }> = [];
  const provider: AnalyticsProvider & {
    calls: typeof calls;
    callCount: number;
    reset(): void;
  } = {
    name: impl?.name || 'mock',
    calls,
    get callCount() {
      return calls.length;
    },
    track(event, properties, context) {
      calls.push({ event, properties: { ...properties }, context: { ...context } });
      impl?.track?.(event, properties, context);
    },
    flush: impl?.flush,
    destroy: impl?.destroy,
    reset() {
      calls.length = 0;
    }
  };
  return provider;
}

/* -------------------------------------------------------------------------- */
/* 全局 provider registry                                                       */
/* -------------------------------------------------------------------------- */

const providerRegistry = new Map<string, AnalyticsProvider>();
let globalProvider: AnalyticsProvider | AnalyticsProvider[] | null = null;

/** 注册一个 provider 到全局 registry */
export function registerAnalyticsProvider(provider: AnalyticsProvider): void {
  providerRegistry.set(provider.name, provider);
}

/** 取消注册 */
export function unregisterAnalyticsProvider(name: string): void {
  providerRegistry.delete(name);
}

/** 从 registry 获取指定名称的 provider */
export function getAnalyticsProvider(name: string): AnalyticsProvider | undefined {
  return providerRegistry.get(name);
}

/** 获取所有已注册的 provider */
export function listAnalyticsProviders(): AnalyticsProvider[] {
  return Array.from(providerRegistry.values());
}

/** 清空 registry(主要供测试使用) */
export function clearAnalyticsProviders(): void {
  providerRegistry.clear();
  globalProvider = null;
}

/** 设置全局默认 provider */
export function setGlobalAnalyticsProvider(provider: AnalyticsProvider | AnalyticsProvider[] | null): void {
  globalProvider = provider;
}

/** 获取全局默认 provider(若未设置,返回空 provider) */
export function getGlobalAnalyticsProvider(): AnalyticsProvider | AnalyticsProvider[] {
  if (globalProvider) return globalProvider;
  // 默认 log provider
  const fallback = createLogAnalyticsProvider();
  globalProvider = fallback;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* 上下文提取                                                                   */
/* -------------------------------------------------------------------------- */

/** 从 Hono 上下文中自动抽取 analytics context */
export function extractAnalyticsContext(c: Context<UbeanEnv>): AnalyticsContext {
  const path = c.req.path;
  const method = c.req.method;
  const referrer = c.req.header('referer') || c.req.header('referrer') || undefined;
  const userAgent = c.req.header('user-agent') || undefined;
  const locale = c.req.header('accept-language') || undefined;
  const requestId = (c.get('requestId') as string | undefined) || undefined;
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || undefined;

  // locale 优先用 i18n 中间件写入的值
  const ctxLocale = (c.get('locale') as string | undefined) || locale;

  // status / duration 由中间件在响应后填充,这里只返回 undefined
  const status = c.res?.status;

  return {
    path,
    method,
    status,
    referrer,
    userAgent,
    locale: ctxLocale,
    requestId,
    ip
  };
}

/* -------------------------------------------------------------------------- */
/* 跟踪函数                                                                     */
/* -------------------------------------------------------------------------- */

function resolveProviders(provider?: AnalyticsProvider | AnalyticsProvider[]): AnalyticsProvider[] {
  const source = provider ?? getGlobalAnalyticsProvider();
  if (Array.isArray(source)) return source;
  return [source];
}

/**
 * 跟踪一次页面浏览
 */
export async function trackPageView(c: Context<UbeanEnv>, options: AnalyticsTrackOptions = {}): Promise<void> {
  const { autoContext = true, properties = {}, eventName = 'page_view', awaitFlush = false } = options;
  const context = autoContext ? extractAnalyticsContext(c) : {};
  const providers = resolveProviders();

  const tasks = providers.map(p => p.track(eventName, properties, context));
  if (awaitFlush) {
    await Promise.all(tasks);
    await Promise.all(providers.map(p => p.flush?.()));
  } else {
    void Promise.all(tasks).catch(() => {});
  }
}

/**
 * 跟踪一次自定义事件
 */
export async function trackEvent(
  c: Context<UbeanEnv>,
  name: string,
  properties: AnalyticsProperties = {}
): Promise<void> {
  const context = extractAnalyticsContext(c);
  const providers = resolveProviders();
  const tasks = providers.map(p => p.track(name, properties, context));
  void Promise.all(tasks).catch(() => {});
}

/** 直接调用 provider 跟踪事件(无 Hono 上下文) */
export async function trackRaw(
  event: string,
  properties: AnalyticsProperties = {},
  context: AnalyticsContext = {},
  provider?: AnalyticsProvider | AnalyticsProvider[]
): Promise<void> {
  const providers = resolveProviders(provider);
  await Promise.all(providers.map(p => p.track(event, properties, context)));
}

/* -------------------------------------------------------------------------- */
/* defineAnalyticsProvider                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 定义一个 analytics provider,并注册到全局 registry
 *
 * @example
 * ```ts
 * const provider = defineAnalyticsProvider({
 *   name: 'posthog',
 *   track(event, properties, context) {
 *     await fetch('https://app.posthog.com/capture/', { ... });
 *   }
 * });
 * ```
 */
export function defineAnalyticsProvider(options: AnalyticsProviderOptions): AnalyticsProvider {
  if (!options.name) {
    throw new Error('[ubean/analytics] AnalyticsProvider requires a `name`');
  }
  const provider: AnalyticsProvider = {
    name: options.name,
    track: options.track,
    flush: options.flush,
    destroy: options.destroy
  };
  registerAnalyticsProvider(provider);
  return provider;
}

/* -------------------------------------------------------------------------- */
/* 中间件                                                                       */
/* -------------------------------------------------------------------------- */

function isExcluded(path: string, exclude: string[] | undefined): boolean {
  if (!exclude || exclude.length === 0) return false;
  return exclude.some(pattern => {
    if (pattern.endsWith('/**')) {
      return path.startsWith(pattern.slice(0, -3));
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix) && !path.slice(prefix.length).includes('/');
    }
    return path === pattern;
  });
}

/**
 * 创建 analytics 中间件,自动跟踪页面浏览
 *
 * @example
 * ```ts
 * const memory = createMemoryAnalyticsProvider();
 * app.use('*', createAnalyticsMiddleware({ provider: memory }));
 * ```
 */
export function createAnalyticsMiddleware(options: AnalyticsMiddlewareOptions = {}): MiddlewareHandler<UbeanEnv> {
  const {
    provider,
    methods = ['GET'],
    exclude = [],
    trackAllStatus = false,
    shouldTrack,
    getProperties,
    eventName = 'page_view'
  } = options;

  const normalizedMethods = new Set(methods.map(m => m.toUpperCase()));

  return async function analyticsMiddleware(c: Context<UbeanEnv>, next: Next) {
    // 跳过排除路径
    if (isExcluded(c.req.path, exclude)) {
      await next();
      return;
    }

    // 检查方法
    if (!normalizedMethods.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }

    // 自定义 shouldTrack
    if (shouldTrack && !(await shouldTrack(c))) {
      await next();
      return;
    }

    const start = Date.now();
    let error: unknown = undefined;
    try {
      await next();
    } catch (err) {
      error = err;
    }

    // 即使抛错也尝试跟踪
    const duration = Date.now() - start;
    const status = c.res?.status ?? 200;

    const shouldTrackStatus = trackAllStatus || (status >= 200 && status < 400);
    if (shouldTrackStatus) {
      const context = extractAnalyticsContext(c);
      context.status = status;
      context.duration = duration;

      const extraProperties = getProperties ? await getProperties(c) : {};

      const providers = resolveProviders(provider);
      const tasks = providers.map(p => p.track(eventName, extraProperties, context));
      void Promise.all(tasks).catch(() => {});
    }

    if (error !== undefined) {
      throw error;
    }
  };
}

/** 定义 analytics 中间件(等同于 createAnalyticsMiddleware) */
export function defineAnalytics(options: AnalyticsMiddlewareOptions): MiddlewareHandler<UbeanEnv> {
  return createAnalyticsMiddleware(options);
}

/** 从上下文获取 analytics provider(便于在 handler 中手动 track) */
export function useAnalytics(
  c?: Context<UbeanEnv>,
  provider?: AnalyticsProvider | AnalyticsProvider[]
): {
  trackPageView(properties?: AnalyticsProperties): void;
  trackEvent(name: string, properties?: AnalyticsProperties): void;
} {
  const buildContext = () => (c ? extractAnalyticsContext(c) : {});
  return {
    trackPageView(properties: AnalyticsProperties = {}) {
      const ctx = buildContext();
      const providers = resolveProviders(provider);
      void Promise.all(providers.map(p => p.track('page_view', properties, ctx))).catch(() => {});
    },
    trackEvent(name: string, properties: AnalyticsProperties = {}) {
      const ctx = buildContext();
      const providers = resolveProviders(provider);
      void Promise.all(providers.map(p => p.track(name, properties, ctx))).catch(() => {});
    }
  };
}
