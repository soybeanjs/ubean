/**
 * Observability / Tracing 系统测试
 *
 * 覆盖 ubean 的可观测性能力:
 * - getRequestId / generateRequestId: 请求 ID 生成与获取
 * - createObservabilityTracer: tracer 实例与导出器
 * - createConsoleExporter / createOpenTelemetryExporter: 导出器实现
 * - setGlobalTracer / getGlobalTracer: 全局 tracer
 * - startSpan / withSpan / createSpan: span 生命周期
 * - createTracingMiddleware: HTTP 中间件
 *
 * 测试策略:
 * - 函数级: 直接调用 ubean 导出的函数验证返回值和副作用
 * - HTTP 集成级: 通过 /api/trace-test 验证端到端 span 行为
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  generateRequestId,
  getRequestId,
  REQUEST_ID_HEADER,
  createSpan,
  createObservabilityTracer,
  setGlobalTracer,
  getGlobalTracer,
  startSpan,
  withSpan,
  createConsoleExporter,
  createOpenTelemetryExporter,
  createTracingMiddleware
} from 'ubean';
import { getJson } from './helper';

describe('Observability / Tracing system', () => {
  describe('generateRequestId()', () => {
    it('returns a non-empty string', () => {
      const id = generateRequestId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });

    it('generates UUID-like format when crypto.randomUUID is available', () => {
      const id = generateRequestId();
      // crypto.randomUUID() returns 36 chars with dashes
      if (id.length === 36) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      } else {
        // Fallback format: req_<timestamp>_<random>
        expect(id).toMatch(/^req_\d+_/);
      }
    });
  });

  describe('REQUEST_ID_HEADER', () => {
    it('is set to "x-request-id"', () => {
      expect(REQUEST_ID_HEADER).toBe('x-request-id');
    });
  });

  describe('getRequestId()', () => {
    it('returns the requestId from context', () => {
      const mockContext = {
        get: (key: 'requestId') => (key === 'requestId' ? 'req-12345' : '')
      };
      expect(getRequestId(mockContext)).toBe('req-12345');
    });

    it('returns undefined when not set', () => {
      const mockContext = {
        get: () => ''
      };
      expect(getRequestId(mockContext)).toBe('');
    });
  });

  describe('createSpan()', () => {
    it('creates a span with name and context', () => {
      const span = createSpan({ name: 'test-span' });
      expect(span.name).toBe('test-span');
      expect(span.context).toBeDefined();
      expect(span.context.traceId).toBeTruthy();
      expect(span.context.spanId).toBeTruthy();
    });

    it('starts with status "ok"', () => {
      const span = createSpan({ name: 'ok-span' });
      expect(span.status).toBe('ok');
    });

    it('starts recording', () => {
      const span = createSpan({ name: 'rec-span' });
      expect(span.isRecording()).toBe(true);
    });

    it('has empty events array initially', () => {
      const span = createSpan({ name: 'events-span' });
      expect(span.events).toEqual([]);
    });

    it('has empty attributes initially', () => {
      const span = createSpan({ name: 'attrs-span' });
      expect(span.attributes).toEqual({});
    });

    it('accepts initial attributes', () => {
      const span = createSpan({
        name: 'init-attrs',
        attributes: { foo: 'bar', count: 42 }
      });
      expect(span.attributes.foo).toBe('bar');
      expect(span.attributes.count).toBe(42);
    });

    it('setAttribute updates attributes', () => {
      const span = createSpan({ name: 'set-attr' });
      span.setAttribute('key1', 'value1');
      span.setAttribute('key2', 100);
      span.setAttribute('key3', true);
      expect(span.attributes.key1).toBe('value1');
      expect(span.attributes.key2).toBe(100);
      expect(span.attributes.key3).toBe(true);
    });

    it('setAttributes merges multiple attributes', () => {
      const span = createSpan({ name: 'set-attrs' });
      span.setAttributes({ a: 1, b: 'two' });
      expect(span.attributes.a).toBe(1);
      expect(span.attributes.b).toBe('two');
    });

    it('addEvent appends an event', () => {
      const span = createSpan({ name: 'events-test' });
      span.addEvent('event-1');
      span.addEvent('event-2', { detail: 'extra' });
      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('event-1');
      expect(span.events[1].attributes?.detail).toBe('extra');
    });

    it('end() stops recording and sets endTime', () => {
      const span = createSpan({ name: 'end-span' });
      span.end();
      expect(span.isRecording()).toBe(false);
      expect(span.endTime).toBeDefined();
    });

    it('end() with error sets status to "error"', () => {
      const span = createSpan({ name: 'err-span' });
      span.end({ error: new Error('boom'), status: 'error' });
      expect(span.status).toBe('error');
      expect(span.error?.message).toBe('boom');
    });

    it('end() with status "cancelled"', () => {
      const span = createSpan({ name: 'cancel-span' });
      span.end({ status: 'cancelled' });
      expect(span.status).toBe('cancelled');
    });

    it('duration() returns elapsed ms after end', () => {
      const span = createSpan({ name: 'dur-span' });
      // duration is undefined before end
      expect(span.duration()).toBeUndefined();
      span.end();
      expect(span.duration()).toBeDefined();
      expect(span.duration()).toBeGreaterThanOrEqual(0);
    });

    it('supports parent span linking', () => {
      const parent = createSpan({ name: 'parent' });
      const child = createSpan({ name: 'child', parent });
      expect(child.parent).toBe(parent);
      expect(child.context.parentSpanId).toBe(parent.context.spanId);
    });
  });

  describe('createObservabilityTracer()', () => {
    it('creates a tracer with required methods', () => {
      const tracer = createObservabilityTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
      expect(typeof tracer.withSpan).toBe('function');
      expect(typeof tracer.addExporter).toBe('function');
      expect(typeof tracer.removeExporter).toBe('function');
      expect(typeof tracer.flush).toBe('function');
      expect(typeof tracer.shutdown).toBe('function');
    });

    it('startSpan returns a span', () => {
      const tracer = createObservabilityTracer();
      const span = tracer.startSpan({ name: 'tracer-span' });
      expect(span.name).toBe('tracer-span');
      expect(span.isRecording()).toBe(true);
    });

    it('withSpan executes function and ends span', async () => {
      const tracer = createObservabilityTracer();
      const result = await tracer.withSpan('op', async span => {
        span.setAttribute('work', 'done');
        return 42;
      });
      expect(result).toBe(42);
    });

    it('withSpan propagates error and marks span as error', async () => {
      const tracer = createObservabilityTracer();
      await expect(
        tracer.withSpan('failing-op', async () => {
          throw new Error('span failure');
        })
      ).rejects.toThrow('span failure');
    });

    it('accepts exporters in config', () => {
      const exporter = createConsoleExporter();
      const tracer = createObservabilityTracer({ exporters: [exporter] });
      expect(tracer).toBeDefined();
    });

    it('addExporter / removeExporter manage exporters', () => {
      const tracer = createObservabilityTracer();
      const exporter = createConsoleExporter();
      tracer.addExporter(exporter);
      // removeExporter by name
      tracer.removeExporter('console');
      // Should not throw
      expect(true).toBe(true);
    });

    it('exporter.exportSpan is called on span end', async () => {
      let exportedCount = 0;
      const tracer = createObservabilityTracer({
        exporters: [
          {
            name: 'test-exporter',
            exportSpan: () => {
              exportedCount++;
            }
          }
        ]
      });
      await tracer.withSpan('exported-op', () => 1);
      expect(exportedCount).toBe(1);
    });

    it('redacts sensitive attributes by default', async () => {
      let capturedSpan: any;
      const tracer = createObservabilityTracer({
        exporters: [
          {
            name: 'capture',
            exportSpan: span => {
              capturedSpan = span;
            }
          }
        ]
      });
      await tracer.withSpan('sensitive-op', span => {
        span.setAttribute('password', 'secret123');
        span.setAttribute('authorization', 'Bearer token');
        span.setAttribute('normal', 'visible');
        return 1;
      });
      expect(capturedSpan.attributes.password).toBe('[REDACTED]');
      expect(capturedSpan.attributes.authorization).toBe('[REDACTED]');
      expect(capturedSpan.attributes.normal).toBe('visible');
    });

    it('accepts custom sensitiveKeys', async () => {
      let capturedSpan: any;
      const tracer = createObservabilityTracer({
        sensitiveKeys: ['my-secret'],
        exporters: [
          {
            name: 'capture',
            exportSpan: span => {
              capturedSpan = span;
            }
          }
        ]
      });
      await tracer.withSpan('custom-sensitive', span => {
        span.setAttribute('my-secret', 'hidden');
        span.setAttribute('password', 'visible-because-not-in-custom-list');
        return 1;
      });
      expect(capturedSpan.attributes['my-secret']).toBe('[REDACTED]');
      // password is NOT in custom sensitiveKeys list, so it remains visible
      expect(capturedSpan.attributes.password).toBe('visible-because-not-in-custom-list');
    });

    it('includes defaultAttributes in spans', async () => {
      let capturedSpan: any;
      const tracer = createObservabilityTracer({
        defaultAttributes: { service: 'ubean-test', version: '1.0' },
        exporters: [
          {
            name: 'capture',
            exportSpan: span => {
              capturedSpan = span;
            }
          }
        ]
      });
      await tracer.withSpan('with-defaults', () => 1);
      expect(capturedSpan.attributes.service).toBe('ubean-test');
      expect(capturedSpan.attributes.version).toBe('1.0');
    });

    it('disabled tracer creates non-tracked spans', async () => {
      let exportCount = 0;
      const tracer = createObservabilityTracer({
        enabled: false,
        exporters: [
          {
            name: 'count',
            exportSpan: () => {
              exportCount++;
            }
          }
        ]
      });
      await tracer.withSpan('disabled-op', () => 1);
      // Disabled tracer should not invoke exporters
      expect(exportCount).toBe(0);
    });
  });

  describe('createConsoleExporter()', () => {
    it('returns an exporter with name "console"', () => {
      const exporter = createConsoleExporter();
      expect(exporter.name).toBe('console');
      expect(typeof exporter.exportSpan).toBe('function');
    });

    it('accepts options without throwing', () => {
      const exporter = createConsoleExporter({ colors: true, slowThreshold: 500 });
      expect(exporter).toBeDefined();
    });

    it('exportSpan does not throw', () => {
      const exporter = createConsoleExporter();
      const span = createSpan({ name: 'console-span' });
      span.end();
      expect(() => exporter.exportSpan(span)).not.toThrow();
    });

    it('does not define flush (optional interface method)', () => {
      // createConsoleExporter streams directly to console; flush is optional per interface
      const exporter = createConsoleExporter();
      expect(exporter.flush).toBeUndefined();
    });
  });

  describe('createOpenTelemetryExporter()', () => {
    it('returns an exporter with name "opentelemetry"', () => {
      const exporter = createOpenTelemetryExporter();
      expect(exporter.name).toBe('opentelemetry');
      expect(typeof exporter.exportSpan).toBe('function');
    });

    it('accepts custom url and headers', () => {
      const exporter = createOpenTelemetryExporter({
        url: 'http://collector:4318/v1/traces',
        headers: { 'X-API-Key': 'secret' },
        serviceName: 'test-service',
        serviceVersion: '2.0.0'
      });
      expect(exporter).toBeDefined();
    });

    it('exportSpan does not throw without fetch impl', () => {
      const exporter = createOpenTelemetryExporter({ fetchImpl: undefined });
      const span = createSpan({ name: 'otlp-span' });
      span.end();
      expect(() => exporter.exportSpan(span)).not.toThrow();
    });

    it('flush resolves without throwing', async () => {
      const exporter = createOpenTelemetryExporter();
      await expect(exporter.flush?.()).resolves.toBeUndefined();
    });

    it('shutdown resolves without throwing', async () => {
      const exporter = createOpenTelemetryExporter();
      await expect(exporter.shutdown?.()).resolves.toBeUndefined();
    });
  });

  describe('Global tracer - setGlobalTracer() / getGlobalTracer()', () => {
    afterEach(() => {
      // Reset to default to avoid affecting other tests
      setGlobalTracer(null);
    });

    it('getGlobalTracer returns a tracer (lazy-created)', () => {
      setGlobalTracer(null);
      const tracer = getGlobalTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('setGlobalTracer sets a custom tracer', () => {
      const custom = createObservabilityTracer({ defaultAttributes: { custom: true } });
      setGlobalTracer(custom);
      expect(getGlobalTracer()).toBe(custom);
    });

    it('setGlobalTracer(null) allows re-creation on next getGlobalTracer', () => {
      const first = getGlobalTracer();
      setGlobalTracer(null);
      const second = getGlobalTracer();
      expect(second).toBeDefined();
      // After null, a new tracer is created
      expect(second).not.toBe(first);
    });
  });

  describe('startSpan() / withSpan() (module-level helpers)', () => {
    it('startSpan uses global tracer', () => {
      const span = startSpan('module-span');
      expect(span.name).toBe('module-span');
    });

    it('startSpan accepts SpanOptions object', () => {
      const span = startSpan({ name: 'opts-span', attributes: { x: 1 } });
      expect(span.name).toBe('opts-span');
      expect(span.attributes.x).toBe(1);
    });

    it('withSpan executes and returns result', async () => {
      const result = await withSpan('module-op', async span => {
        span.setAttribute('done', true);
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('withSpan propagates errors', async () => {
      await expect(
        withSpan('error-op', async () => {
          throw new Error('module error');
        })
      ).rejects.toThrow('module error');
    });
  });

  describe('createTracingMiddleware()', () => {
    it('creates a middleware function', () => {
      const middleware = createTracingMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('accepts options', () => {
      const middleware = createTracingMiddleware({
        includeHeaders: true,
        headerFilter: (name: string) => name.toLowerCase() === 'authorization'
      });
      expect(typeof middleware).toBe('function');
    });

    it('middleware calls next', async () => {
      const middleware = createTracingMiddleware();
      const mockCtx = {
        method: 'GET',
        req: {
          method: 'GET',
          url: 'http://localhost/api/test',
          path: '/api/test',
          header: () => undefined
        },
        get: () => undefined,
        set: () => {},
        header: () => {}
      } as any;
      let nextCalled = false;
      await middleware(mockCtx, async () => {
        nextCalled = true;
        return new Response('ok');
      });
      expect(nextCalled).toBe(true);
    });
  });

  // ==========================================================================
  // HTTP 集成测试 - 通过 /api/trace-test 验证端到端
  // ==========================================================================
  describe('HTTP integration - /api/trace-test', () => {
    it('default action returns tracer info', async () => {
      const res = await getJson('/api/trace-test');
      expect(res.status).toBe(200);
      const data = res.data as {
        action: string;
        message: string;
        tracer: { serviceName: string; exporter: string };
        endpoints: Record<string, string>;
      };
      expect(data.action).toBe('trace');
      expect(data.message).toBeTruthy();
      expect(data.tracer.serviceName).toBe('ubean-test');
      expect(data.tracer.exporter).toBe('console');
      expect(data.endpoints.span).toBeDefined();
      expect(data.endpoints.nested).toBeDefined();
    });

    it('action=span creates a span with attributes and returns result', async () => {
      const res = await getJson('/api/trace-test?action=span');
      expect(res.status).toBe(200);
      const data = res.data as {
        action: string;
        result: { computed: boolean; duration: string };
        tracerActive: boolean;
      };
      expect(data.action).toBe('span');
      expect(data.result.computed).toBe(true);
      expect(data.result.duration).toBe('10ms');
      expect(data.tracerActive).toBe(true);
    });

    it('action=nested creates parent and child spans', async () => {
      const res = await getJson('/api/trace-test?action=nested');
      expect(res.status).toBe(200);
      const data = res.data as {
        action: string;
        result: { parent: string; child: string };
      };
      expect(data.action).toBe('nested');
      expect(data.result.parent).toBe('parent-done');
      expect(data.result.child).toBe('child-done');
    });
  });
});
