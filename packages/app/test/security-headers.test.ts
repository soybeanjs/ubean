/**
 * 内置 Icon 的 Iconify API 端点在 CSP 契约中的位置。
 *
 * 在 `createUbeanApp` 这一层按**响应头**验证：`security.headers` 的默认值与单指令覆盖
 * 最终都落到中间件的 CSP 上。中间件自己的纯函数用例在
 * `packages/server/test/security.test.ts`，这里守的是「配置 → app 选项 → header」这条链。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearInternalFetcher } from '@ubean/routes';
import { ICONIFY_API_ORIGIN } from '@ubean/server/security';
import { clearGlobalHooks } from '../src/hooks';
import { UbeanApp } from '../src/app';

const ORIGIN = 'http://localhost';

const send = (app: UbeanApp, path: string): Promise<Response> => app.hono.fetch(new Request(ORIGIN + path));

beforeEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

afterEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

describe('CSP connect-src 的 Iconify 来源不可覆盖', () => {
  it('默认安全头放行 Iconify API', async () => {
    const app = new UbeanApp({ csrf: false, dataCache: false });
    const csp = (await send(app, '/_health')).headers.get('Content-Security-Policy')!;
    expect(csp).toContain(`connect-src 'self' ws: wss: ${ICONIFY_API_ORIGIN}`);
  });

  it('应用覆盖 connect-src 只能追加，不能移除框架必需来源', async () => {
    const app = new UbeanApp({
      csrf: false,
      dataCache: false,
      securityHeaders: {
        contentSecurityPolicy: { 'connect-src': ["'self'", 'https://example.com'] }
      }
    });
    const csp = (await send(app, '/_health')).headers.get('Content-Security-Policy')!;
    expect(csp).toContain(`connect-src 'self' https://example.com ${ICONIFY_API_ORIGIN}`);
    expect(csp).not.toContain('ws:');
  });

  it('Scalar 文档页专用 CSP 也保留该来源（它晚于中间件覆盖 header）', async () => {
    const app = new UbeanApp({
      csrf: false,
      dataCache: false,
      openAPI: true,
      securityHeaders: {
        contentSecurityPolicy: { 'connect-src': ["'self'"] }
      }
    });
    await app.init();
    const csp = (await send(app, '/_scalar')).headers.get('Content-Security-Policy')!;
    expect(csp).toContain(`connect-src 'self' ${ICONIFY_API_ORIGIN}`);
    expect(csp).toContain('https://cdn.jsdelivr.net');
  });

  it('securityHeaders: false 仍可整体关闭 CSP', async () => {
    const app = new UbeanApp({ csrf: false, dataCache: false, securityHeaders: false });
    expect((await send(app, '/_health')).headers.get('Content-Security-Policy')).toBeNull();
  });
});
