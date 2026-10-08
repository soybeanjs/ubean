/**
 * TS-34 · L2 → L1 下沉（域 1/6：observability）
 *
 * 本文件补的是 `packages/server/src/observability.ts` 的**纯逻辑层**覆盖。
 * 在此之前该模块在 L1 符号级零覆盖（`createObservabilityTracer` / `createSpan` /
 * `getRequestId` / `REQUEST_ID_HEADER` / `createTracingMiddleware` 全部只被
 * `examples/ubean-test/test/observability.test.ts` 从 HTTP 层间接走到）。
 *
 * 这里只断言「函数自己保证的契约」：span 生命周期、父子关系、脱敏、截断、
 * exporter 投递与 flush/shutdown 顺序。HTTP 层能证明的东西（header 透传、
 * 中间件挂载位置、状态码映射到 span.status）留在 L2，不重复。
 *
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REQUEST_ID_HEADER,
  createConsoleExporter,
  createObservabilityTracer,
  createOpenTelemetryExporter,
  createSpan,
  createTracingMiddleware,
  generateRequestId,
  getGlobalTracer,
  getRequestId,
  getSpan,
  setGlobalTracer,
  startSpan,
  withSpan
} from '../src/observability';
import type { Span } from '../src/observability';

afterEach(() => {
  setGlobalTracer(null);
  vi.restoreAllMocks();
});

/** 造一个只有 `get`/`set` 的最简 Hono Context 替身（中间件只用到这三个能力）。 */
function createContext(options: { method?: string; path?: string; headers?: Record<string, string> } = {}) {
  const values = new Map<string, unknown>([['requestId', 'req-test-1']]);
  const res = { status: 200 };
  return {
    req: {
      method: options.method ?? 'GET',
      path: options.path ?? '/',
      header: () => options.headers
    },
    res,
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
    _values: values
  };
}

describe('TS-34 · observability · REQUEST_ID_HEADER / getRequestId / generateRequestId', () => {
  it('REQUEST_ID_HEADER 是约定的 x-request-id', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });

  it('getRequestId 直接读 context 的 requestId 槽位', () => {
    expect(getRequestId(createContext() as never)).toBe('req-test-1');
  });

  it('generateRequestId 产出的 id 互不相同且非空', () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).toBeTypeOf('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('generateRequestId 在 crypto 缺席时回退到 req_ 前缀的兜底实现', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      expect(generateRequestId()).toMatch(/^req_\d+_[a-z0-9]+$/u);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
});

describe('TS-34 · observability · createSpan 生命周期', () => {
  it('新建 span 带上 name、traceId、spanId、空 events、ok 状态且 recording', () => {
    const span = createSpan({ name: 'op', attributes: { a: 1 } });

    expect(span.name).toBe('op');
    expect(span.status).toBe('ok');
    expect(span.startTime).toBeTypeOf('number');
    expect(span.endTime).toBeUndefined();
    expect(span.duration()).toBeUndefined();
    // 已知尖角（记录，不是期望的"正确"值）：`generateTraceId` 把两个 UUID 拼起来后只截断
    // 第二段到 16 字符，实际产出 48 位 hex，而 OTLP 规范要求 trace id 恰好 32 位。
    // 这里固定当前长度，避免它被当成"顺手能改"的东西；真要改属于独立的兼容性修复。
    expect(span.context.traceId).toMatch(/^[0-9a-f]{48}$/u);
    expect(span.context.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(span.context.parentSpanId).toBeUndefined();
    expect(span.attributes).toEqual({ a: 1 });
    expect(span.events).toEqual([]);
    expect(span.isRecording()).toBe(true);
  });

  it('未带 attributes 时 attributes 是空对象（不是 undefined）', () => {
    expect(createSpan({ name: 'op' }).attributes).toEqual({});
  });

  it('end() 置 endTime/status/attributes，之后 isRecording 为 false 且 duration 有值', () => {
    const span = createSpan({ name: 'op' });
    span.end({ status: 'cancelled', attributes: { extra: true } });

    expect(span.status).toBe('cancelled');
    expect(span.attributes).toEqual({ extra: true });
    expect(span.isRecording()).toBe(false);
    expect(typeof span.duration()).toBe('number');
  });

  it('end({ error }) 强制 status 变 error 并保留 error 对象', () => {
    const span = createSpan({ name: 'op' });
    const err = new Error('boom');
    span.end({ error: err });

    expect(span.status).toBe('error');
    expect(span.error).toBe(err);
  });

  it('end() 是幂等的：第二次调用不改 endTime / status', () => {
    const span = createSpan({ name: 'op' });
    span.end({ status: 'ok' });
    const endedAt = span.endTime;
    span.end({ status: 'error' });

    expect(span.endTime).toBe(endedAt);
    expect(span.status).toBe('ok');
  });

  it('end() 之后 setAttribute / setAttributes / addEvent 全部变成空操作', () => {
    const span = createSpan({ name: 'op' });
    span.end();
    span.setAttribute('late', 1);
    span.setAttributes({ alsoLate: 2 });
    span.addEvent('late-event');

    expect(span.attributes).toEqual({});
    expect(span.events).toEqual([]);
  });

  it('end() 之前 addEvent 记录 name/timestamp/attributes', () => {
    const span = createSpan({ name: 'op' });
    span.addEvent('cache-miss', { key: 'k' });

    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('cache-miss');
    expect(span.events[0].attributes).toEqual({ key: 'k' });
    expect(span.events[0].timestamp).toBeTypeOf('number');
  });

  it('parent 传 Span 时继承 traceId 并记录 parentSpanId', () => {
    const parent = createSpan({ name: 'parent' });
    const child = createSpan({ name: 'child', parent });

    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
    expect(child.parent).toBe(parent);
  });

  it('parent 传 SpanContext（无 context 字段）时也继承 traceId', () => {
    const parent = createSpan({ name: 'parent' });
    const child = createSpan({ name: 'child', parent: parent.context });

    expect(child.context.traceId).toBe(parent.context.traceId);
    expect(child.context.parentSpanId).toBe(parent.context.spanId);
    expect(child.parent).toBeUndefined();
  });
});

describe('TS-34 · observability · redactAttributes 脱敏与截断', () => {
  it('默认敏感键集合大小写不敏感地打码成 [REDACTED]', () => {
    const tracer = createObservabilityTracer();
    const result = tracer.redactAttributes({
      password: 'p',
      Authorization: 'Bearer t',
      API_KEY: 'k',
      safe: 'keep'
    });

    expect(result).toEqual({
      password: '[REDACTED]',
      Authorization: '[REDACTED]',
      API_KEY: '[REDACTED]',
      safe: 'keep'
    });
  });

  it('自定义 sensitiveKeys 覆盖默认集合（默认键不再自动打码）', () => {
    const tracer = createObservabilityTracer({ sensitiveKeys: ['mysecret'] });
    const result = tracer.redactAttributes({ mysecret: 'x', password: 'visible' });

    expect(result).toEqual({ mysecret: '[REDACTED]', password: 'visible' });
  });

  it('超过 2048 字符的字符串被截断并追加 ...[truncated]', () => {
    const tracer = createObservabilityTracer();
    const long = 'a'.repeat(3000);
    const result = tracer.redactAttributes({ long }) as Record<string, string>;

    expect(result.long).toHaveLength(2048 + '...[truncated]'.length);
    expect(result.long.endsWith('...[truncated]')).toBe(true);
  });

  it('恰好 2048 字符不截断（边界）', () => {
    const tracer = createObservabilityTracer();
    const exact = 'a'.repeat(2048);
    expect(tracer.redactAttributes({ exact })).toEqual({ exact });
  });

  it('非字符串值（数字/布尔/对象）原样保留', () => {
    const tracer = createObservabilityTracer();
    const obj = { nested: true };
    const result = tracer.redactAttributes({ n: 1, b: false, obj });

    expect(result).toEqual({ n: 1, b: false, obj });
  });
});

describe('TS-34 · observability · tracer.startSpan 与 exporter/hook 投递', () => {
  it('startSpan 合并 defaultAttributes，且调用方 attributes 优先', () => {
    const tracer = createObservabilityTracer({ defaultAttributes: { service: 'api', region: 'us' } });
    const span = tracer.startSpan({ name: 'op', attributes: { region: 'eu' } });

    expect(span.attributes).toEqual({ service: 'api', region: 'eu' });
  });

  it('enabled: false 时 startSpan 直接返回裸 span，不触发 hook、不投递 exporter', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ enabled: false, exporters: [exporter] });
    const onStart = vi.fn();
    tracer.hooks.hook('span:start', onStart);

    const span = tracer.startSpan({ name: 'op' });
    span.end();

    expect(span.status).toBe('ok');
    expect(onStart).not.toHaveBeenCalled();
    expect(exporter.exportSpan).not.toHaveBeenCalled();
  });

  it('span:start 在 startSpan 时触发，span:end 在 end() 时触发', async () => {
    const tracer = createObservabilityTracer();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    tracer.hooks.hook('span:start', onStart);
    tracer.hooks.hook('span:end', onEnd);

    const span = tracer.startSpan({ name: 'op' });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();

    span.end();
    await Promise.resolve();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('span 带 error 结束时额外触发 span:error（end 前不带 error 则不触发）', async () => {
    const tracer = createObservabilityTracer();
    const onError = vi.fn();
    tracer.hooks.hook('span:error', onError);

    tracer.startSpan({ name: 'ok-op' }).end();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();

    tracer.startSpan({ name: 'bad-op' }).end({ error: new Error('x') });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].name).toBe('bad-op');
  });

  it('end() 时对 span.attributes 与 opts.attributes 都做脱敏', async () => {
    const tracer = createObservabilityTracer();
    const span = tracer.startSpan({ name: 'op', attributes: { token: 'secret', keep: 1 } });
    span.end({ attributes: { password: 'p' } });

    expect(span.attributes).toEqual({ token: '[REDACTED]', keep: 1, password: '[REDACTED]' });
  });

  it('end() 把 span 投递给所有 exporter', async () => {
    const a = { name: 'a', exportSpan: vi.fn() };
    const b = { name: 'b', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [a, b] });

    tracer.startSpan({ name: 'op' }).end();

    expect(a.exportSpan).toHaveBeenCalledTimes(1);
    expect(b.exportSpan).toHaveBeenCalledTimes(1);
    expect((a.exportSpan.mock.calls[0][0] as Span).name).toBe('op');
  });

  it('exporter.exportSpan 抛异常时被吞掉，不影响其它 exporter 与调用方', () => {
    const bad = {
      name: 'bad',
      exportSpan: () => {
        throw new Error('exporter down');
      }
    };
    const good = { name: 'good', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [bad, good] });

    expect(() => tracer.startSpan({ name: 'op' }).end()).not.toThrow();
    expect(good.exportSpan).toHaveBeenCalledTimes(1);
  });

  it('addExporter / removeExporter 增删投递目标，remove 按 name 且对不存在的 name 无副作用', () => {
    const a = { name: 'a', exportSpan: vi.fn() };
    const b = { name: 'b', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer();

    tracer.addExporter(a);
    tracer.addExporter(b);
    tracer.removeExporter('a');
    tracer.removeExporter('does-not-exist');
    tracer.startSpan({ name: 'op' }).end();

    expect(a.exportSpan).not.toHaveBeenCalled();
    expect(b.exportSpan).toHaveBeenCalledTimes(1);
  });
});

describe('TS-34 · observability · withSpan / flush / shutdown 顺序', () => {
  it('withSpan 传字符串等价于 { name }，成功路径 end() 后返回结果', async () => {
    const tracer = createObservabilityTracer();
    const seen: Span[] = [];

    const result = await tracer.withSpan('my-op', span => {
      seen.push(span as Span);
      return 42;
    });

    expect(result).toBe(42);
    expect(seen[0].name).toBe('my-op');
    expect(seen[0].status).toBe('ok');
    expect(seen[0].isRecording()).toBe(false);
  });

  it('withSpan 回调抛错时把 error 写进 span 并原样重抛', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });

    await expect(
      tracer.withSpan('bad', () => {
        throw new Error('handler failed');
      })
    ).rejects.toThrow('handler failed');

    const span = exporter.exportSpan.mock.calls[0][0] as Span;
    expect(span.status).toBe('error');
    expect(span.error?.message).toBe('handler failed');
  });

  it('withSpan 把非 Error 抛出物包装成 Error', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });

    await expect(
      tracer.withSpan('bad', () => {
        // eslint-disable-next-line no-throw-literal
        throw 'plain string';
      })
    ).rejects.toBe('plain string');

    const span = exporter.exportSpan.mock.calls[0][0] as Span;
    expect(span.error).toBeInstanceOf(Error);
    expect(span.error?.message).toBe('plain string');
  });

  it('flush() 调用所有 exporter 的 flush', async () => {
    const a = { name: 'a', exportSpan: vi.fn(), flush: vi.fn(async () => {}) };
    const b = { name: 'b', exportSpan: vi.fn(), flush: vi.fn(async () => {}) };
    const tracer = createObservabilityTracer({ exporters: [a, b] });

    await tracer.flush();

    expect(a.flush).toHaveBeenCalledTimes(1);
    expect(b.flush).toHaveBeenCalledTimes(1);
  });

  it('shutdown() 先 flush 再 shutdown 各 exporter', async () => {
    const order: string[] = [];
    const exporter = {
      name: 'e',
      exportSpan: vi.fn(),
      flush: vi.fn(async () => {
        order.push('flush');
      }),
      shutdown: vi.fn(async () => {
        order.push('shutdown');
      })
    };
    const tracer = createObservabilityTracer({ exporters: [exporter] });

    await tracer.shutdown();

    expect(order).toEqual(['flush', 'shutdown']);
  });

  it('exporter 没有 flush / shutdown 时 flush() / shutdown() 不报错', async () => {
    const tracer = createObservabilityTracer({ exporters: [{ name: 'e', exportSpan: vi.fn() }] });
    await expect(tracer.flush()).resolves.toBeUndefined();
    await expect(tracer.shutdown()).resolves.toBeUndefined();
  });

  it('getActiveSpan() 当前恒为 undefined（已知未实现，非回归）', () => {
    expect(createObservabilityTracer().getActiveSpan()).toBeUndefined();
    expect(createObservabilityTracer().createSpan({ name: 'x' }).name).toBe('x');
  });
});

describe('TS-34 · observability · 全局 tracer 单例', () => {
  it('getGlobalTracer 懒创建并复用同一实例，setGlobalTracer(null) 后重建', () => {
    const first = getGlobalTracer();
    expect(getGlobalTracer()).toBe(first);

    const custom = createObservabilityTracer();
    setGlobalTracer(custom);
    expect(getGlobalTracer()).toBe(custom);

    setGlobalTracer(null);
    expect(getGlobalTracer()).not.toBe(custom);
  });

  it('模块级 startSpan / withSpan 走当前全局 tracer', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    setGlobalTracer(createObservabilityTracer({ exporters: [exporter] }));

    startSpan('via-module').end();
    await withSpan('via-module-async', () => 'ok');

    expect(exporter.exportSpan).toHaveBeenCalledTimes(2);
    expect((exporter.exportSpan.mock.calls[0][0] as Span).name).toBe('via-module');
  });
});

describe('TS-34 · observability · createTracingMiddleware', () => {
  it('把 span 挂到 context 并可经 getSpan 取回，成功后按状态码结束', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const middleware = createTracingMiddleware({ tracer });
    const c = createContext({ method: 'POST', path: '/api/items' });

    await middleware(c, async () => {
      c.res.status = 201;
    });

    const span = getSpan(c as never) as Span;
    expect(span.name).toBe('POST /api/items');
    expect(span.attributes['http.method']).toBe('POST');
    expect(span.attributes['http.url']).toBe('/api/items');
    expect(span.attributes['http.request_id']).toBe('req-test-1');
    expect(span.attributes['http.status_code']).toBe(201);
    expect(span.status).toBe('ok');
  });

  it('4xx / 5xx 都记为 error 状态', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const middleware = createTracingMiddleware({ tracer });

    for (const status of [404, 500]) {
      const c = createContext();
      await middleware(c, async () => {
        c.res.status = status;
      });
      expect((getSpan(c as never) as Span).status).toBe('error');
    }
    expect(exporter.exportSpan).toHaveBeenCalledTimes(2);
  });

  it('next() 抛错时记录 error.duration_ms 并把 error 写进 span，然后重抛', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const middleware = createTracingMiddleware({ tracer });
    const c = createContext();

    await expect(
      middleware(c, async () => {
        throw new Error('downstream');
      })
    ).rejects.toThrow('downstream');

    const span = getSpan(c as never) as Span;
    expect(span.status).toBe('error');
    expect(span.error?.message).toBe('downstream');
    expect(span.attributes['error.duration_ms']).toBeTypeOf('number');
  });

  it('includeHeaders: true 时记录脱敏后的请求头；headerFilter 可排除指定头', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const middleware = createTracingMiddleware({
      tracer,
      includeHeaders: true,
      headerFilter: name => name.toLowerCase() === 'authorization'
    });
    const c = createContext({ headers: { authorization: 'Bearer x', 'x-trace': 'v' } });

    await middleware(c, async () => {});

    const span = getSpan(c as never) as Span;
    expect(span.attributes.authorization).toBeUndefined();
    expect(span.attributes['x-trace']).toBe('v');
  });

  it('includeHeaders 默认 false，不记录任何请求头', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    const tracer = createObservabilityTracer({ exporters: [exporter] });
    const middleware = createTracingMiddleware({ tracer });
    const c = createContext({ headers: { 'x-trace': 'v' } });

    await middleware(c, async () => {});

    expect((getSpan(c as never) as Span).attributes['x-trace']).toBeUndefined();
  });

  it('未传 tracer 时用全局 tracer', async () => {
    const exporter = { name: 'e', exportSpan: vi.fn() };
    setGlobalTracer(createObservabilityTracer({ exporters: [exporter] }));
    const middleware = createTracingMiddleware();
    const c = createContext();

    await middleware(c, async () => {});

    expect(exporter.exportSpan).toHaveBeenCalledTimes(1);
  });

  it('getSpan 对没有 span 的 context 返回 undefined', () => {
    expect(getSpan(createContext() as never)).toBeUndefined();
  });
});

describe('TS-34 · observability · createConsoleExporter', () => {
  it('慢 span 走 console.warn 并带 (slow)，不写 debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 阈值 0 → duration >= 0 恒真，所以必然算 slow
    const exporter = createConsoleExporter({ slowThreshold: 0 });

    const span = createSpan({ name: 'slow-op' });
    span.end();
    exporter.exportSpan(span);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('(slow)');
    expect(debug).not.toHaveBeenCalled();
  });

  it('快 span 走 console.debug，不带 (slow)', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exporter = createConsoleExporter({ slowThreshold: 60_000 });

    const span = createSpan({ name: 'fast-op' });
    span.end();
    exporter.exportSpan(span);

    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0][0])).toContain('✓');
    expect(String(debug.mock.calls[0][0])).not.toContain('(slow)');
    expect(warn).not.toHaveBeenCalled();
  });

  it('error span 走 console.error 并带错误消息', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exporter = createConsoleExporter();
    const span = createSpan({ name: 'boom' });
    span.end({ error: new Error('kaput') });
    exporter.exportSpan(span);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('kaput');
    expect(String(error.mock.calls[0][0])).toContain('✗');
  });

  it('cancelled span 用 ○ 标记，且默认阈值下不标 slow', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const exporter = createConsoleExporter();
    const span = createSpan({ name: 'cancelled-op' });
    span.end({ status: 'cancelled' });
    exporter.exportSpan(span);

    expect(String(debug.mock.calls[0][0])).toContain('○');
    expect(String(debug.mock.calls[0][0])).not.toContain('(slow)');
  });
});

describe('TS-34 · observability · createOpenTelemetryExporter', () => {
  it('flush() 把 batch 里的 span 以 OTLP 形状 POST 出去', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const exporter = createOpenTelemetryExporter({
      url: 'http://collector/v1/traces',
      serviceName: 'svc',
      serviceVersion: '1.2.3',
      headers: { 'x-api-key': 'k' },
      fetchImpl: (async (url: string | URL, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      }) as typeof fetch
    });

    const span = createSpan({ name: 'op', attributes: { n: 3, s: 'v', b: true, skip: undefined } });
    span.addEvent('ev', { e: 1 });
    span.end({ error: new Error('bad') });
    exporter.exportSpan(span);
    await exporter.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://collector/v1/traces');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('k');

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.resourceSpans[0].resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'svc' } },
      { key: 'service.version', value: { stringValue: '1.2.3' } }
    ]);
    const otlp = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(otlp.traceId).toBe(span.context.traceId);
    expect(otlp.name).toBe('op');
    expect(otlp.status).toEqual({ code: 'STATUS_CODE_ERROR', message: 'bad' });
    expect(otlp.events[0].name).toBe('ev');
    // undefined 属性被丢掉
    expect(otlp.attributes.some((a: { key: string }) => a.key === 'skip')).toBe(false);
    // number → intValue 转字符串、boolean → boolValue
    expect(otlp.attributes).toContainEqual({ key: 'n', value: { intValue: '3' } });
    expect(otlp.attributes).toContainEqual({ key: 'b', value: { boolValue: true } });
  });

  it('没有 span 时 flush() 不发请求；fetch 失败被吞掉不抛出', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const exporter = createOpenTelemetryExporter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();

    exporter.exportSpan(createSpan({ name: 'op' }));
    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('shutdown() 清掉待发的定时器并 flush 剩余 span', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const exporter = createOpenTelemetryExporter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    exporter.exportSpan(createSpan({ name: 'op' }));
    await exporter.shutdown();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
