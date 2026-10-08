/**
 * Observability / Tracing HTTP 集成测试（L2）
 *
 * 纯逻辑契约（`generateRequestId`/`getRequestId`/`REQUEST_ID_HEADER`、`createSpan`
 * 生命周期、`redactAttributes` 脱敏与截断、tracer 的 exporter/hook 投递、
 * `withSpan`/`flush`/`shutdown`、全局 tracer 单例、`createTracingMiddleware`、
 * `createConsoleExporter`、`createOpenTelemetryExporter`）已于 TS-34 下沉到
 * `packages/server/test/observability-l1.test.ts`（49 例），此处不再重复。
 * 保留的只有**只有 HTTP 层能证明**的东西：端点可路由、状态码、响应形状。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe('Observability / Tracing system', () => {
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
