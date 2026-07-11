import { createHooks, type Hookable } from 'hookable';

const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestIdOptions {
  headerName?: string;
  setResponseHeader?: boolean;
  generator?: () => string;
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getRequestId(c: { get: (key: string) => unknown }): string | undefined {
  return c.get('requestId') as string | undefined;
}

export function createRequestIdMiddleware(options: RequestIdOptions = {}) {
  const headerName = options.headerName || REQUEST_ID_HEADER;
  const setResponseHeader = options.setResponseHeader !== false;
  const generator = options.generator || generateRequestId;

  return async function requestIdMiddleware(c: any, next: any) {
    const incomingId = c.req.header?.(headerName);
    const requestId = incomingId || generator();

    c.set('requestId', requestId);

    await next();

    if (setResponseHeader) {
      c.header(headerName, requestId);
    }
  };
}

export { REQUEST_ID_HEADER };

export type SpanStatus = 'ok' | 'error' | 'cancelled';

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined | null;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface SpanEndOptions {
  status?: SpanStatus;
  error?: Error;
  attributes?: SpanAttributes;
}

export interface Span {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  error?: Error;
  parent?: Span;
  end(options?: SpanEndOptions): void;
  setAttribute(key: string, value: string | number | boolean | undefined | null): void;
  setAttributes(attrs: SpanAttributes): void;
  addEvent(name: string, attributes?: SpanAttributes): void;
  isRecording(): boolean;
  duration(): number | undefined;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface SpanOptions {
  name: string;
  attributes?: SpanAttributes;
  parent?: Span | SpanContext;
}

export interface ObservabilityHooks {
  'span:start': (span: Span) => void | Promise<void>;
  'span:end': (span: Span) => void | Promise<void>;
  'span:error': (span: Span, error: Error) => void | Promise<void>;
}

export interface ObservabilityExporter {
  name: string;
  exportSpan(span: Readonly<Span>): void | Promise<void>;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface ObservabilityConfig {
  defaultAttributes?: SpanAttributes;
  sensitiveKeys?: string[];
  exporters?: ObservabilityExporter[];
  enabled?: boolean;
}

function generateSpanId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function createSpan(options: SpanOptions): Span {
  let ended = false;
  const ctx: SpanContext = {
    traceId: generateTraceId(),
    spanId: generateSpanId()
  };

  if (options.parent) {
    if ('context' in options.parent) {
      ctx.traceId = options.parent.context.traceId;
      ctx.parentSpanId = options.parent.context.spanId;
    } else {
      ctx.traceId = options.parent.traceId;
      ctx.parentSpanId = options.parent.spanId;
    }
  }

  const span: Span = {
    name: options.name,
    context: ctx,
    startTime: Date.now(),
    status: 'ok',
    attributes: { ...options.attributes },
    events: [],
    parent: options.parent && 'context' in options.parent ? options.parent : undefined,
    end(opts) {
      if (ended) return;
      ended = true;
      span.endTime = Date.now();
      if (opts?.status) span.status = opts.status;
      if (opts?.attributes) Object.assign(span.attributes, opts.attributes);
      if (opts?.error) {
        span.error = opts.error;
        span.status = 'error';
      }
    },
    setAttribute(key, value) {
      if (!ended) span.attributes[key] = value;
    },
    setAttributes(attrs) {
      if (!ended) Object.assign(span.attributes, attrs);
    },
    addEvent(name, attributes) {
      if (!ended) {
        span.events.push({ name, timestamp: Date.now(), attributes });
      }
    },
    isRecording() {
      return !ended;
    },
    duration() {
      if (span.endTime === undefined) return undefined;
      return span.endTime - span.startTime;
    }
  };

  return span;
}

export function createObservabilityTracer(config: ObservabilityConfig = {}) {
  const hooks: Hookable<ObservabilityHooks> = createHooks<ObservabilityHooks>();
  const exporters: ObservabilityExporter[] = [...(config.exporters || [])];
  const sensitiveKeys = new Set(
    (config.sensitiveKeys || [
      'password', 'passwd', 'secret', 'token', 'authorization', 'api_key', 'apikey',
      'access_token', 'refresh_token', 'private_key', 'credit_card', 'ssn', 'auth'
    ]).map(k => k.toLowerCase())
  );
  const enabled = config.enabled !== false;

  function addExporter(exporter: ObservabilityExporter) {
    exporters.push(exporter);
  }

  function removeExporter(name: string) {
    const idx = exporters.findIndex(e => e.name === name);
    if (idx >= 0) exporters.splice(idx, 1);
  }

  function redactAttributes(attrs: SpanAttributes): SpanAttributes {
    const result: SpanAttributes = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 2048) {
        result[key] = value.slice(0, 2048) + '...[truncated]';
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function startSpan(options: SpanOptions): Span {
    if (!enabled) {
      return createSpan(options);
    }

    const merged: SpanOptions = {
      ...options,
      attributes: { ...config.defaultAttributes, ...options.attributes }
    };
    const span = createSpan(merged);

    void hooks.callHook('span:start', span);

    const originalEnd = span.end.bind(span);
    span.end = function(this: Span, opts?: SpanEndOptions) {
      if (opts?.attributes) {
        opts.attributes = redactAttributes(opts.attributes);
      }
      span.attributes = redactAttributes(span.attributes);
      originalEnd(opts);
      void hooks.callHook('span:end', span);
      if (span.error) {
        void hooks.callHook('span:error', span, span.error);
      }
      for (const exporter of exporters) {
        try {
          void exporter.exportSpan(span);
        } catch {
        }
      }
    };

    return span;
  }

  async function withSpan<T>(options: SpanOptions | string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    const opts: SpanOptions = typeof options === 'string' ? { name: options } : options;
    const span = startSpan(opts);
    try {
      const result = await fn(span);
      span.end();
      return result;
    } catch (err) {
      span.end({ error: err instanceof Error ? err : new Error(String(err)), status: 'error' });
      throw err;
    }
  }

  function getActiveSpan(): Span | undefined {
    return undefined;
  }

  async function flush(): Promise<void> {
    await Promise.all(exporters.map(e => e.flush?.()));
  }

  async function shutdown(): Promise<void> {
    await flush();
    await Promise.all(exporters.map(e => e.shutdown?.()));
  }

  return {
    hooks,
    startSpan,
    withSpan,
    getActiveSpan,
    addExporter,
    removeExporter,
    redactAttributes,
    flush,
    shutdown,
    createSpan
  };
}

export type ObservabilityTracer = ReturnType<typeof createObservabilityTracer>;

let globalTracer: ObservabilityTracer | null = null;

export function setGlobalTracer(tracer: ObservabilityTracer | null) {
  globalTracer = tracer;
}

export function getGlobalTracer(): ObservabilityTracer {
  if (!globalTracer) {
    globalTracer = createObservabilityTracer();
  }
  return globalTracer;
}

export function startSpan(options: SpanOptions | string): Span {
  return getGlobalTracer().startSpan(typeof options === 'string' ? { name: options } : options);
}

export function withSpan<T>(options: SpanOptions | string, fn: (span: Span) => T | Promise<T>): Promise<T> {
  return getGlobalTracer().withSpan(options, fn);
}

export function createOpenTelemetryExporter(options: {
  url?: string;
  headers?: Record<string, string>;
  serviceName?: string;
  serviceVersion?: string;
  fetchImpl?: typeof fetch;
} = {}): ObservabilityExporter {
  const url = options.url || 'http://localhost:4318/v1/traces';
  const headers = options.headers || {};
  const serviceName = options.serviceName || 'ubean-app';
  const serviceVersion = options.serviceVersion || '0.0.0';
  const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined);
  const batch: unknown[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const BATCH_SIZE = 512;
  const FLUSH_INTERVAL = 5000;

  function spanToOTLP(span: Readonly<Span>) {
    const attributes: { key: string; value: unknown }[] = [];
    for (const [k, v] of Object.entries(span.attributes)) {
      if (v === undefined || v === null) continue;
      attributes.push({
        key: k,
        value: typeof v === 'string' ? { stringValue: v }
          : typeof v === 'number' ? { intValue: String(Math.floor(v)) }
          : typeof v === 'boolean' ? { boolValue: v }
          : { stringValue: String(v) }
      });
    }

    const events = span.events.map(e => ({
      timeUnixNano: (e.timestamp as number) * 1_000_000,
      name: e.name,
      attributes: e.attributes ? Object.entries(e.attributes)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => ({
          key: k,
          value: typeof v === 'string' ? { stringValue: v }
            : typeof v === 'number' ? { intValue: String(Math.floor(v)) }
            : { stringValue: String(v) }
        })) : []
    }));

    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId || '',
      name: span.name,
      kind: 'SPAN_KIND_INTERNAL',
      startTimeUnixNano: span.startTime * 1_000_000,
      endTimeUnixNano: (span.endTime || Date.now()) * 1_000_000,
      attributes,
      events,
      status: span.status === 'error'
        ? { code: 'STATUS_CODE_ERROR', message: span.error?.message || '' }
        : { code: 'STATUS_CODE_OK' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0
    };
  }

  async function exportBatch() {
    if (batch.length === 0 || !fetchImpl) return;
    const spans = batch.splice(0, BATCH_SIZE);
    try {
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          resourceSpans: [{
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: serviceName } },
                { key: 'service.version', value: { stringValue: serviceVersion } }
              ]
            },
            scopeSpans: [{
              scope: { name: 'ubean' },
              spans
            }]
          }]
        })
      });
    } catch {
    }
  }

  function scheduleFlush() {
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      void exportBatch();
    }, FLUSH_INTERVAL);
  }

  return {
    name: 'opentelemetry',
    exportSpan(span) {
      batch.push(spanToOTLP(span));
      if (batch.length >= BATCH_SIZE) {
        void exportBatch();
      } else {
        scheduleFlush();
      }
    },
    async flush() {
      while (batch.length > 0) {
        await exportBatch();
      }
    },
    async shutdown() {
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
      await this.flush?.();
    }
  };
}

export function createConsoleExporter(options: {
  colors?: boolean;
  slowThreshold?: number;
} = {}): ObservabilityExporter {
  const slowThreshold = options.slowThreshold ?? 1000;

  return {
    name: 'console',
    exportSpan(span) {
      const duration = span.duration() ?? 0;
      const status = span.status === 'error' ? '✗' : span.status === 'cancelled' ? '○' : '✓';
      const slow = duration >= slowThreshold ? ' (slow)' : '';
      const errMsg = span.error ? ` — ${span.error.message}` : '';
      const method = typeof globalThis.console !== 'undefined';
      if (!method) return;

      const msg = `${status} [${duration}ms] ${span.name}${slow}${errMsg}`;
      if (span.status === 'error') {
        console.error(msg);
      } else if (slow) {
        console.warn(msg);
      } else {
        console.debug(msg);
      }
    }
  };
}

export interface TracingMiddlewareOptions {
  tracer?: ObservabilityTracer;
  includeHeaders?: boolean;
  headerFilter?: (name: string) => boolean;
}

export function createTracingMiddleware(options: TracingMiddlewareOptions = {}) {
  const tracer = options.tracer || getGlobalTracer();
  const headerFilter = options.headerFilter || (() => false);
  const includeHeaders = options.includeHeaders ?? false;

  return async function tracingMiddleware(c: any, next: any) {
    const method: string = c.req.method || 'GET';
    const path: string = c.req.path || '/';
    const requestId = getRequestId(c);

    const span = tracer.startSpan({
      name: `${method} ${path}`,
      attributes: {
        'http.method': method,
        'http.url': path,
        'http.request_id': requestId
      }
    });

    c.set('span', span);

    if (includeHeaders) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.req.header?.() || {})) {
        if (!headerFilter(k)) {
          headers[k] = v as string;
        }
      }
      span.setAttributes(tracer.redactAttributes(headers));
    }

    const start = Date.now();
    try {
      await next();
      const statusCode: number = c.res?.status || 200;
      span.setAttribute('http.status_code', statusCode);
      if (statusCode >= 500) {
        span.end({ status: 'error' });
      } else {
        span.end({ status: statusCode >= 400 ? 'error' : 'ok' });
      }
    } catch (err) {
      const duration = Date.now() - start;
      span.setAttribute('error.duration_ms', duration);
      span.end({ error: err instanceof Error ? err : new Error(String(err)), status: 'error' });
      throw err;
    }
  };
}

export function getSpan(c: { get: (key: string) => unknown }): Span | undefined {
  return c.get('span') as Span | undefined;
}
