import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UbeanEnv } from '@ubean/shared';
import { Hono } from 'hono';
import { clearActions, defineAction } from '../src/actions';
import { registerOpenAPIRoutes, SCALAR_SCRIPT_ORIGIN } from '../src/openapi';

describe('registerOpenAPIRoutes', () => {
  beforeEach(() => {
    clearActions();
  });
  afterEach(() => {
    clearActions();
  });

  it('merges POST /__actions into /_openapi.json', async () => {
    defineAction(async () => 'pong', { name: 'ping', filePath: 'src/actions/ping.ts' });

    const app = new Hono<UbeanEnv>();
    registerOpenAPIRoutes(app);
    const res = await app.request('/_openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths?: Record<string, { post?: { operationId?: string; description?: string } }>;
    };
    expect(spec.paths?.['/__actions']?.post?.operationId).toBe('ubeanActionsRpc');
    expect(spec.paths?.['/__actions']?.post?.description).toContain('ping');
  });

  /**
   * Scalar 文档页的 CSP 由调用方（`@ubean/app`）从**生效的** CSP 上追加
   * `SCALAR_SCRIPT_ORIGIN` 后传入 —— 页面自己写死了这个 `<script src>`，没有这一步就会被应用
   * 的默认 `script-src 'self'` 整页拦掉（2026-09-17 实测：DevTools 的 API Docs 面板空白）。
   */
  it('Scalar 页面用传入的 CSP，脚本来源与常量一致', async () => {
    const app = new Hono<UbeanEnv>();
    registerOpenAPIRoutes(app, { contentSecurityPolicy: `script-src 'self' ${SCALAR_SCRIPT_ORIGIN}` });
    const res = await app.request('/_scalar');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toContain(SCALAR_SCRIPT_ORIGIN);
    expect(await res.text()).toContain(`<script src="${SCALAR_SCRIPT_ORIGIN}/npm/@scalar/api-reference">`);
  });

  it('未传 CSP 时不设头（用户关掉 CSP 的场景不重加）', async () => {
    const app = new Hono<UbeanEnv>();
    registerOpenAPIRoutes(app);
    const res = await app.request('/_scalar');
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });
});
