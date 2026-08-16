import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createRequestLoggerMiddleware } from '../src/hono';
import { createUbeanLogger, getLogger, logger } from '../src/index';

/**
 * tslog v5 transport 契约:
 * `write(record)` 收到的 record 为 `{ 0: fieldsOrFirstArg, 1: messageOrSecondArg, ..., _logMeta }`。
 * fields-first JSON 只出现在渲染行(console/JSON sink)中,传输器拿到的是原始参数对象。
 */
type CaptureRecord = {
  0?: Record<string, unknown> | string;
  1?: string;
  [key: number]: unknown;
  _logMeta?: { logLevelName: string; name?: string };
};

/** 收集通过 transport 捕获的日志记录(隐藏控制台输出,避免测试噪音) */
function makeCapturingLogger(records: CaptureRecord[]) {
  const log = createUbeanLogger({ type: 'hidden' });
  log.attachTransport({
    name: 'capture',
    write: record => {
      records.push(record as CaptureRecord);
    }
  });
  return log;
}

describe('@ubean/logger', () => {
  it('exposes a default logger with level methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('createUbeanLogger returns a tslog instance', () => {
    const log = createUbeanLogger({ name: 'test' });
    expect(log.settings.name).toBe('test');
    expect(typeof log.info).toBe('function');
    expect(typeof log.getSubLogger).toBe('function');
  });

  it('getLogger() without scope returns the default logger', () => {
    expect(getLogger()).toBe(logger);
  });

  it('getLogger(scope) returns a child logger named ubean:<scope>', () => {
    const cli = getLogger('cli');
    expect(cli).not.toBe(logger);
    expect(cli.settings.name).toBe('cli');
  });

  it('minLevel filters below-level records', () => {
    const records: CaptureRecord[] = [];
    const log = makeCapturingLogger(records);
    log.setMinLevel('WARN');

    log.info('noop');
    log.debug('noop');
    expect(records).toHaveLength(0);

    log.warn('boom');
    expect(records).toHaveLength(1);
    expect(records[0]._logMeta?.logLevelName).toBe('WARN');
  });

  it('child logger inherits parent settings and capture', () => {
    const records: CaptureRecord[] = [];
    const root = makeCapturingLogger(records);
    const child = root.getSubLogger({ name: 'api' });

    child.info('inherited');
    expect(records).toHaveLength(1);
    expect(records[0]._logMeta?.name).toBe('api');
  });

  it('logs fields-first structured records (fields at arg index 0)', () => {
    const records: CaptureRecord[] = [];
    const log = makeCapturingLogger(records);

    log.info({ port: 3000 }, 'server started');
    expect(records).toHaveLength(1);
    expect(records[0][0]).toEqual({ port: 3000 });
    expect(records[0][1]).toBe('server started');
  });
});

describe('createRequestLoggerMiddleware', () => {
  function makeApp(records: CaptureRecord[], opts?: Parameters<typeof createRequestLoggerMiddleware>[0]) {
    const log = makeCapturingLogger(records);
    const app = new Hono();
    app.use('*', createRequestLoggerMiddleware({ logger: log, ...opts }));
    app.get('/hello', c => c.json({ ok: true }));
    return app;
  }

  it('logs start and end for a matching request', async () => {
    const records: CaptureRecord[] = [];
    const app = makeApp(records);

    const res = await app.request('/hello');
    expect(res.status).toBe(200);

    const start = records.find(r => r[1]?.startsWith('-->'));
    const end = records.find(r => {
      const fields = r[0] as Record<string, unknown> | undefined;
      return fields?.status === 200;
    });
    expect(start).toBeDefined();
    expect(end).toBeDefined();
  });

  it('skips excluded paths', async () => {
    const records: CaptureRecord[] = [];
    const app = makeApp(records, { exclude: ['/hello'] });

    await app.request('/hello');
    expect(records).toHaveLength(0);
  });

  it('excludes paths matching a glob pattern', async () => {
    const records: CaptureRecord[] = [];
    const app = makeApp(records, { exclude: ['/internal/**'] });
    app.get('/internal/x', c => c.json({}));

    await app.request('/internal/x');
    expect(records).toHaveLength(0);
  });

  it('does not skip paths matching a RegExp exclude', async () => {
    const records: CaptureRecord[] = [];
    const app = makeApp(records, { exclude: [/^\/_/] });

    await app.request('/hello');
    expect(records.some(r => (r[0] as Record<string, unknown>)?.path === '/hello')).toBe(true);
  });

  it('logs and rethrows uncaught errors (Hono returns 500)', async () => {
    const records: CaptureRecord[] = [];
    const log = makeCapturingLogger(records);
    const app = new Hono();
    app.use('*', createRequestLoggerMiddleware({ logger: log }));
    app.get('/boom', () => {
      throw new Error('kaboom');
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    expect(records.some(r => r[1]?.includes('ERROR'))).toBe(true);
  });
});
