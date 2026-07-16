import { defineHandler, createObservabilityTracer, createConsoleExporter, withSpan } from 'ubean';

const tracer = createObservabilityTracer({
  exporters: [createConsoleExporter()]
});

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'trace';

  if (action === 'span') {
    const result = await withSpan('test-operation', async span => {
      span.setAttribute('test.attr', 'value');
      span.setAttribute('test.count', 42);
      await new Promise(resolve => setTimeout(resolve, 10));
      return { computed: true, duration: '10ms' };
    });

    return c.json({
      action: 'span',
      result,
      tracerActive: !!tracer
    });
  }

  if (action === 'nested') {
    const result = await withSpan('parent-op', async () => {
      const childResult = await withSpan('child-op', async span => {
        span.setAttribute('child', true);
        return 'child-done';
      });
      return { parent: 'parent-done', child: childResult };
    });

    return c.json({ action: 'nested', result });
  }

  return c.json({
    action: 'trace',
    message: 'Observability tracer test',
    tracer: { serviceName: 'ubean-test', exporter: 'console' },
    endpoints: {
      span: '/api/trace-test?action=span',
      nested: '/api/trace-test?action=nested'
    }
  });
});
