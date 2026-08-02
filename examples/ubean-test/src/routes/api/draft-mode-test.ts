import { createHmac } from 'node:crypto';
/**
 * Draft / Preview Mode (Task 5) —— HTTP 集成测试入口
 *
 * 通过自包含的 Hono 子应用 + `createDraftModeMiddleware` 验证端到端行为,
 * 无需修改 dev server 主中间件栈,不依赖外部服务。
 *
 * Actions:
 * - noCookie:        无 cookie 时 isEnabled=false
 * - enable:          enableDraftMode 设置签名 cookie
 * - disable:         disableDraftMode 通过 Max-Age=0 清除 cookie
 * - tampered:        篡改签名的 cookie 被拒绝
 * - expired:         过期 token 被拒绝
 * - wrongSecret:     用其他密钥签名的 cookie 被拒绝
 * - roundTrip:       enable → 携带 cookie 的后续请求 isEnabled=true
 * - composable:      useDraftMode() 返回 { isEnabled, enable, disable } 且功能正常
 */
import { Hono } from 'hono';
import {
  defineHandler,
  createDraftModeMiddleware,
  enableDraftMode,
  disableDraftMode,
  isDraftMode,
  useDraftMode
} from 'ubean';
import type { UbeanEnv } from 'ubean';

type TestApp = Hono<UbeanEnv>;

const SECRET = 'integration-test-secret';

/** 与实现一致的 HMAC-SHA256 签名工具,用于构造测试用 cookie。 */
function signToken(expiry: number, secret: string = SECRET): string {
  const value = String(expiry);
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

/** 从 Set-Cookie 头中提取 name=value 部分。 */
function cookieNameValue(setCookie: string | null): string | null {
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';

  switch (action) {
    // 无 cookie 时 isEnabled=false
    case 'noCookie': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/', sc => sc.json({ enabled: isDraftMode(sc) }));

      const res = await subApp.request('http://test/');
      const body = await res.json();
      return c.json({ enabled: body.enabled, isEnabledFalse: body.enabled === false });
    }

    // enableDraftMode 设置签名 cookie
    case 'enable': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/enable', sc => {
        enableDraftMode(sc);
        return sc.json({ enabled: isDraftMode(sc) });
      });

      const res = await subApp.request('http://test/enable');
      const body = await res.json();
      const setCookie = res.headers.get('set-cookie');
      return c.json({
        enabled: body.enabled,
        setCookiePresent: setCookie !== null,
        cookieContainsDraft: setCookie?.includes('ubean_draft=') ?? false
      });
    }

    // disableDraftMode 通过 Max-Age=0 清除 cookie
    case 'disable': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/disable', sc => {
        disableDraftMode(sc);
        return sc.json({ enabled: isDraftMode(sc) });
      });

      const res = await subApp.request('http://test/disable');
      const body = await res.json();
      const setCookie = res.headers.get('set-cookie');
      return c.json({
        enabled: body.enabled,
        maxAgeZero: setCookie?.includes('Max-Age=0') ?? false
      });
    }

    // 篡改签名的 cookie 被拒绝
    case 'tampered': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/', sc => sc.json({ enabled: isDraftMode(sc) }));

      const token = signToken(Date.now() + 3600_000);
      const tampered = `${token.slice(0, -2)}XX`;
      const res = await subApp.request('http://test/', {
        headers: { cookie: `ubean_draft=${tampered}` }
      });
      const body = await res.json();
      return c.json({ enabled: body.enabled, rejected: body.enabled === false });
    }

    // 过期 token 被拒绝
    case 'expired': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/', sc => sc.json({ enabled: isDraftMode(sc) }));

      const expired = signToken(Date.now() - 1000);
      const res = await subApp.request('http://test/', {
        headers: { cookie: `ubean_draft=${expired}` }
      });
      const body = await res.json();
      return c.json({ enabled: body.enabled, rejected: body.enabled === false });
    }

    // 用其他密钥签名的 cookie 被拒绝
    case 'wrongSecret': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/', sc => sc.json({ enabled: isDraftMode(sc) }));

      const token = signToken(Date.now() + 3600_000, 'another-secret');
      const res = await subApp.request('http://test/', {
        headers: { cookie: `ubean_draft=${token}` }
      });
      const body = await res.json();
      return c.json({ enabled: body.enabled, rejected: body.enabled === false });
    }

    // enable → 携带 cookie 的后续请求 isEnabled=true,disable 后 isEnabled=false
    case 'roundTrip': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/enable', sc => {
        enableDraftMode(sc);
        return sc.json({ ok: true });
      });
      subApp.get('/disable', sc => {
        disableDraftMode(sc);
        return sc.json({ ok: true });
      });
      subApp.get('/check', sc => sc.json({ enabled: isDraftMode(sc) }));

      // 1. 启用,获取 Set-Cookie
      const r1 = await subApp.request('http://test/enable');
      const cookie = cookieNameValue(r1.headers.get('set-cookie'));

      // 2. 携带 cookie 检查 → isEnabled=true
      const r2 = await subApp.request('http://test/check', {
        headers: { cookie: cookie! }
      });
      const b2 = await r2.json();

      // 3. disable(携带 cookie)→ Set-Cookie Max-Age=0 清除
      const r3 = await subApp.request('http://test/disable', {
        headers: { cookie: cookie! }
      });
      const clearedCookie = cookieNameValue(r3.headers.get('set-cookie'));

      // 4. 模拟浏览器清除 cookie 后的请求 → isEnabled=false
      const r4 = await subApp.request('http://test/check', {
        headers: clearedCookie ? { cookie: clearedCookie } : {}
      });
      const b4 = await r4.json();

      return c.json({
        afterEnable: b2.enabled,
        afterClear: b4.enabled,
        roundTripOk: b2.enabled === true && b4.enabled === false
      });
    }

    // useDraftMode() 组合式 API
    case 'composable': {
      const subApp: TestApp = new Hono();
      subApp.use('*', createDraftModeMiddleware({ secret: SECRET }));
      subApp.get('/', sc => {
        const draft = useDraftMode(sc);
        return sc.json({
          hasIsEnabled: typeof draft.isEnabled === 'boolean',
          hasEnable: typeof draft.enable === 'function',
          hasDisable: typeof draft.disable === 'function'
        });
      });
      subApp.get('/enable', sc => {
        const draft = useDraftMode(sc);
        draft.enable();
        return sc.json({ enabled: draft.isEnabled });
      });
      subApp.get('/disable', sc => {
        const draft = useDraftMode(sc);
        draft.disable();
        return sc.json({ enabled: draft.isEnabled });
      });

      const r1 = await subApp.request('http://test/');
      const b1 = await r1.json();
      const r2 = await subApp.request('http://test/enable');
      const b2 = await r2.json();
      const r3 = await subApp.request('http://test/disable');
      const b3 = await r3.json();

      return c.json({
        shape: b1.hasIsEnabled && b1.hasEnable && b1.hasDisable,
        enableWorks: b2.enabled === true,
        disableWorks: b3.enabled === false
      });
    }

    default:
      return c.json({
        actions: ['noCookie', 'enable', 'disable', 'tampered', 'expired', 'wrongSecret', 'roundTrip', 'composable']
      });
  }
});
