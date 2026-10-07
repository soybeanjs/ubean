/**
 * TS-16：`logging` 运行时断言（§5 做法「捕获 stdout（或注入 logger）」—— 这里走**注入 logger**）。
 *
 * 依据 P1-8：`requestSuppressed` 置位后**是否真的不打印**此前无验证。链路是三段：
 *
 *   `resolveLoggingConfig()`（按 mode 派生 `request` / `requestSuppressed`）
 *     → CLI（`dev.ts`）读派生结果，`requestSuppressed` 时提示一次并跳过
 *     → `attachRequestLogger(app, config.logging?.request === true, logger)`（真正的打印点）
 *
 * 本文件在第二段的真实打印点注入捕获 logger，断言「打印 / 不打印 / 打印在哪一级」；
 * 第一段的**派生**用 `resolveLoggingConfig()` 直接断言（它导出自 `@ubean/config`，
 * 是 CLI 与本层共用的同一份判定 —— 这正是「三段口径一致」能被测住的原因）。
 *
 * 刻意不 mock：app 是真的 `createDevApp()`（真的扫一个临时项目、真的处理请求），
 * 请求也是真的 `app.hono.fetch()`。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLoggingConfig } from '@ubean/config';
import type { ResolvedConfig } from '@ubean/config';
import { createDevApp } from '../src/dev/dev-app';
import type { BootstrapLogger, CreateDevAppOptions } from '../src/dev/dev-app';

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

/** 一个最小可扫的项目：两个页面。必然 500 的路由走 `configureApp` 注入（不受扫描器影响）。 */
function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ubean-logging-runtime-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'src/pages'), { recursive: true });
  writeFileSync(join(dir, 'src/pages/index.vue'), '<template><div>home</div></template>');
  writeFileSync(join(dir, 'src/pages/about.vue'), '<template><div>about</div></template>');
  return dir;
}

interface Captured {
  info: string[];
  warn: string[];
  error: string[];
}

function captureLogger(): { logger: BootstrapLogger; captured: Captured } {
  const captured: Captured = { info: [], warn: [], error: [] };
  const logger: BootstrapLogger = {
    info: msg => captured.info.push(String(msg)),
    warn: msg => captured.warn.push(String(msg)),
    error: msg => captured.error.push(String(msg))
  };
  return { logger, captured };
}

/** 手写的 resolved config 片段：只填 `createDevApp` 真正读的字段。 */
function makeConfig(mode: 'fullstack' | 'spa' | 'ssg' | 'backend', request: boolean): ResolvedConfig {
  const logging = resolveLoggingConfig({ request: request ? true : undefined }, mode);
  return {
    mode,
    srcDir: 'src',
    dir: { public: 'public' },
    logging,
    ssr: { enabled: true, all: true, exclude: [], streaming: false },
    security: { csrf: false, headers: true },
    dataCache: true,
    cache: { store: 'auto' }
  } as unknown as ResolvedConfig;
}

const REQUEST_LINE = /^\w+ \S+ \d{3} \d+ms$/;

describe('TS-16 · logging.request 运行时行为（注入 logger）', () => {
  let rootDir: string;

  beforeAll(() => {
    rootDir = makeProject();
  });

  it('fullstack + logging.request: true → 请求真的打印一条 info 行', async () => {
    const { logger, captured } = captureLogger();
    const { app } = await createDevApp({
      rootDir,
      config: makeConfig('fullstack', true),
      logger
    } as CreateDevAppOptions);
    await app.init();

    const res = await app.hono.fetch(new Request('http://localhost/about'));
    expect(res.status).toBe(200);

    const infoLines = captured.info.filter(l => l.includes('/about'));
    expect(infoLines, '应打印恰好一条 /about 请求行').toHaveLength(1);
    expect(infoLines[0]).toMatch(/^GET \/about 200 \d+ms$/);
    // 行格式契约：`METHOD PATH STATUS DURATIONms`
    expect(infoLines[0]).toMatch(REQUEST_LINE);
  });

  it('spa + logging.request: true → requestSuppressed，一条请求日志都不打', async () => {
    // 先钉住派生结果（CLI 读取的就是这份），再钉住真实打印点
    const derived = resolveLoggingConfig({ request: true }, 'spa');
    expect(derived.request).toBe(false);
    expect(derived.requestSuppressed).toBe(true);

    const { logger, captured } = captureLogger();
    const { app } = await createDevApp({
      rootDir,
      config: makeConfig('spa', true),
      logger
    } as CreateDevAppOptions);
    await app.init();

    await app.hono.fetch(new Request('http://localhost/'));
    await app.hono.fetch(new Request('http://localhost/about'));

    expect(captured.info, 'spa 下不应有任何请求日志').toHaveLength(0);
    expect(captured.warn, 'spa 下不应有任何请求警告').toHaveLength(0);
    expect(captured.error, 'spa 下不应有任何请求错误日志').toHaveLength(0);
  });

  it('ssg 同样被抑制（三段口径一致）', async () => {
    const derived = resolveLoggingConfig({ request: true }, 'ssg');
    expect(derived.request).toBe(false);
    expect(derived.requestSuppressed).toBe(true);

    const { logger, captured } = captureLogger();
    const { app } = await createDevApp({
      rootDir,
      config: makeConfig('ssg', true),
      logger
    } as CreateDevAppOptions);
    await app.init();

    await app.hono.fetch(new Request('http://localhost/'));
    expect(captured.info).toHaveLength(0);
  });

  it('fullstack 未开 logging.request → 默认不打印（默认关闭）', async () => {
    const derived = resolveLoggingConfig(undefined, 'fullstack');
    expect(derived.request).toBe(false);

    const { logger, captured } = captureLogger();
    const { app } = await createDevApp({
      rootDir,
      config: makeConfig('fullstack', false),
      logger
    } as CreateDevAppOptions);
    await app.init();

    await app.hono.fetch(new Request('http://localhost/about'));
    expect(captured.info).toHaveLength(0);
  });

  it('级别分流：200 → info，内部路径不打扰，4xx/慢 → warn，5xx → error（内部路径也不压制）', async () => {
    const { logger, captured } = captureLogger();
    const { app } = await createDevApp({
      rootDir,
      config: makeConfig('fullstack', true),
      logger,
      // 必然 5xx 的路由走 `configureApp` 注入：判据是「5xx 用 error 级」，不该依赖扫描器
      // 能不能找到某个文件。
      configureApp: host =>
        host.hono.get('/api/boom', () => {
          throw new Error('boom-ts16');
        })
    } as CreateDevAppOptions);
    await app.init();

    // 内部路径（`/_` 前缀）的成功请求不打扰终端
    await app.hono.fetch(new Request('http://localhost/_health'));
    expect(captured.info.filter(l => l.includes('/_health'))).toHaveLength(0);

    // 4xx → warn（请求一个不存在的页面）
    await app.hono.fetch(new Request('http://localhost/definitely-missing-ts16'));
    expect(captured.warn.some(l => l.includes('/definitely-missing-ts16'))).toBe(true);

    // 5xx → error，且**内部路径也照打**（`/_` 前缀只在 2xx/3xx/4xx 被压制）
    const boom = await app.hono.fetch(new Request('http://localhost/api/boom'));
    expect(boom.status).toBeGreaterThanOrEqual(500);
    expect(captured.error.some(l => l.includes('/api/boom'))).toBe(true);
  });
});

describe('TS-16 · resolveLoggingConfig 按模式派生（CLI 消费的那份判定）', () => {
  it('4 模式矩阵：backend 与 fullstack 可开，spa/ssg 置位 requestSuppressed', () => {
    for (const mode of ['fullstack', 'backend'] as const) {
      const derived = resolveLoggingConfig({ request: true }, mode);
      expect(derived.request, `${mode} 应开启`).toBe(true);
      expect(derived.requestSuppressed, `${mode} 不应置位`).toBe(false);
    }
    for (const mode of ['spa', 'ssg'] as const) {
      const derived = resolveLoggingConfig({ request: true }, mode);
      expect(derived.request, `${mode} 应关闭`).toBe(false);
      expect(derived.requestSuppressed, `${mode} 应置位`).toBe(true);
    }
    // 未显式开启 → 默认关（且不置位：没请求过就不该提示）
    const off = resolveLoggingConfig(undefined, 'spa');
    expect(off.request).toBe(false);
    expect(off.requestSuppressed).toBe(false);
  });

  it('level 原样透传（级别过滤的判定入口），其余分类默认关', () => {
    const derived = resolveLoggingConfig({ level: 'warn', scan: true, lifecycle: true }, 'fullstack');
    expect(derived.level).toBe('warn');
    expect(derived.scan).toBe(true);
    expect(derived.lifecycle).toBe(true);
    expect(derived.diagnostics).toBe(false);
    expect(derived.request).toBe(false);
  });
});
