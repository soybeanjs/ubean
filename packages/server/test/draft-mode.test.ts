import { createHmac } from 'node:crypto';
/**
 * P9-23 Draft/Preview Mode —— 单元测试
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  createDraftModeMiddleware,
  defineDraftMode,
  enableDraftMode,
  disableDraftMode,
  isDraftMode,
  useDraftMode
} from '../src/index';

/* -------------------------------------------------------------------------- */
/* 测试工具                                                                     */
/* -------------------------------------------------------------------------- */

const SECRET = 'test-secret-key';

/**
 * 使用与实现相同的 HMAC-SHA256 算法签名一个 token,
 * 用于在测试中手动构造 cookie 值。
 */
function signToken(expiry: number, secret: string = SECRET): string {
  const value = String(expiry);
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function parseSetCookie(headers: Headers): string | null {
  return headers.get('set-cookie');
}

/* -------------------------------------------------------------------------- */
/* 中间件 - draft mode 检测                                                     */
/* -------------------------------------------------------------------------- */

describe('P9-23: Draft Mode Middleware - Detection', () => {
  it('returns isEnabled=false when no cookie is present', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = false;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(result).toBe(false);
  });

  it('detects draft mode via a valid signed cookie', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = false;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000);
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${token}` }
    });
    expect(result).toBe(true);
  });

  it('returns false when cookie signature is tampered', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = false;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000);
    // 篡改签名部分
    const tampered = `${token.slice(0, -2)}XX`;
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${tampered}` }
    });
    expect(result).toBe(false);
  });

  it('returns false when cookie has no signature separator', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = true;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/', {
      headers: { cookie: 'ubean_draft=just-a-value-without-signature' }
    });
    expect(result).toBe(false);
  });

  it('returns false when the cookie payload is expired', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = true;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    // 构造一个已过期的签名 token(过期时间在过去)
    const expiredToken = signToken(Date.now() - 1000);
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${expiredToken}` }
    });
    expect(result).toBe(false);
  });

  it('returns false when cookie is signed with a different secret', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = true;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000, 'wrong-secret');
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${token}` }
    });
    expect(result).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* enableDraftMode                                                              */
/* -------------------------------------------------------------------------- */

describe('P9-23: enableDraftMode', () => {
  it('sets a Set-Cookie header with a signed cookie', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/enable');
    expect(res.status).toBe(200);
    const setCookie = parseSetCookie(res.headers);
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('ubean_draft=');
  });

  it('sets isEnabled=true immediately within the same request', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let beforeEnable = false;
    let afterEnable = false;
    app.get('/enable', c => {
      beforeEnable = isDraftMode(c);
      enableDraftMode(c);
      afterEnable = isDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/enable');
    expect(beforeEnable).toBe(false);
    expect(afterEnable).toBe(true);
  });

  it('sets cookie with Max-Age matching the TTL', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET, ttl: 7200 }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/enable');
    const setCookie = parseSetCookie(res.headers)!;
    expect(setCookie).toContain('Max-Age=7200');
  });
});

/* -------------------------------------------------------------------------- */
/* disableDraftMode                                                             */
/* -------------------------------------------------------------------------- */

describe('P9-23: disableDraftMode', () => {
  it('sets Set-Cookie with Max-Age=0 to clear the cookie', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/disable', c => {
      disableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/disable');
    expect(res.status).toBe(200);
    const setCookie = parseSetCookie(res.headers)!;
    expect(setCookie).toContain('Max-Age=0');
  });

  it('sets isEnabled=false immediately within the same request', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let afterDisable = true;
    app.get('/disable', c => {
      disableDraftMode(c);
      afterDisable = isDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/disable');
    expect(afterDisable).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* isDraftMode                                                                  */
/* -------------------------------------------------------------------------- */

describe('P9-23: isDraftMode', () => {
  it('returns false when middleware is not registered', async () => {
    const app = new Hono();
    let result = true;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(result).toBe(false);
  });

  it('returns true when a valid signed cookie is present', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let result = false;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000);
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${token}` }
    });
    expect(result).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* useDraftMode                                                                 */
/* -------------------------------------------------------------------------- */

describe('P9-23: useDraftMode', () => {
  it('returns { isEnabled, enable, disable } composable', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    let draft: ReturnType<typeof useDraftMode> | null = null;
    app.get('/', c => {
      draft = useDraftMode(c);
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(draft).not.toBeNull();
    expect(typeof draft!.isEnabled).toBe('boolean');
    expect(typeof draft!.enable).toBe('function');
    expect(typeof draft!.disable).toBe('function');
  });

  it('enable/disable work through the composable', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/enable', c => {
      const draft = useDraftMode(c);
      draft.enable();
      return c.json({ enabled: draft.isEnabled });
    });
    app.get('/disable', c => {
      const draft = useDraftMode(c);
      draft.disable();
      return c.json({ enabled: draft.isEnabled });
    });

    const res1 = await app.request('http://example.com/enable');
    const body1 = await res1.json();
    expect(body1.enabled).toBe(true);

    const res2 = await app.request('http://example.com/disable');
    const body2 = await res2.json();
    expect(body2.enabled).toBe(false);
  });

  it('throws when enable() is called without middleware registered', async () => {
    const app = new Hono();
    let error: Error | null = null;
    app.get('/', c => {
      const draft = useDraftMode(c);
      try {
        draft.enable();
      } catch (e) {
        error = e as Error;
      }
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(error).not.toBeNull();
    expect(error!.message).toContain('createDraftModeMiddleware');
  });

  it('returns isEnabled=false without middleware registered', async () => {
    const app = new Hono();
    let result = true;
    app.get('/', c => {
      const draft = useDraftMode(c);
      result = draft.isEnabled;
      return c.json({ ok: true });
    });

    await app.request('http://example.com/');
    expect(result).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 配置选项                                                                     */
/* -------------------------------------------------------------------------- */

describe('P9-23: Configuration', () => {
  it('supports a custom cookie name', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET, cookieName: 'preview_mode' }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/enable');
    const setCookie = parseSetCookie(res.headers)!;
    expect(setCookie).toContain('preview_mode=');
    expect(setCookie).not.toContain('ubean_draft=');
  });

  it('supports custom cookie options (secure, httpOnly, sameSite, domain)', async () => {
    const app = new Hono();
    app.use(
      '*',
      createDraftModeMiddleware({
        secret: SECRET,
        cookie: {
          secure: true,
          httpOnly: true,
          sameSite: 'strict',
          domain: 'example.com'
        }
      })
    );
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/enable');
    const setCookie = parseSetCookie(res.headers)!;
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=strict');
    expect(setCookie).toContain('Domain=example.com');
  });

  it('supports exclude paths', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET, exclude: ['/api'] }));
    let result = true;
    app.get('/api/preview', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000);
    await app.request('http://example.com/api/preview', {
      headers: { cookie: `ubean_draft=${token}` }
    });
    // 中间件被排除,controller 未注入,isDraftMode 返回 false
    expect(result).toBe(false);
  });

  it('throws when secret is missing', () => {
    expect(() => createDraftModeMiddleware({ secret: '' })).toThrow('secret');
  });

  it('uses default cookie options when none provided', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/enable');
    const setCookie = parseSetCookie(res.headers)!;
    // 默认:HttpOnly + SameSite=lax + Path=/
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Path=/');
  });
});

/* -------------------------------------------------------------------------- */
/* 往返流程 (Round-trip)                                                       */
/* -------------------------------------------------------------------------- */

describe('P9-23: Round-trip flows', () => {
  it('enable → subsequent request sees isEnabled=true', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });
    app.get('/check', c => {
      return c.json({ draft: isDraftMode(c) });
    });

    // 1. 启用 draft mode
    const res1 = await app.request('http://example.com/enable');
    const setCookie = parseSetCookie(res1.headers)!;
    const cookieValue = setCookie.split(';')[0]; // "ubean_draft=..."

    // 2. 后续请求携带 cookie
    const res2 = await app.request('http://example.com/check', {
      headers: { cookie: cookieValue }
    });
    const body = await res2.json();
    expect(body.draft).toBe(true);
  });

  it('disable → subsequent request sees isEnabled=false', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/enable', c => {
      enableDraftMode(c);
      return c.json({ ok: true });
    });
    app.get('/disable', c => {
      disableDraftMode(c);
      return c.json({ ok: true });
    });
    app.get('/check', c => {
      return c.json({ draft: isDraftMode(c) });
    });

    // 1. 启用
    const res1 = await app.request('http://example.com/enable');
    const cookie1 = parseSetCookie(res1.headers)!.split(';')[0];

    // 2. 禁用(携带之前的 cookie)
    await app.request('http://example.com/disable', {
      headers: { cookie: cookie1 }
    });

    // 3. 检查(携带清除后的 cookie —— Max-Age=0,浏览器会删除)
    // 这里模拟 cookie 被清除后无 cookie 的请求
    const res3 = await app.request('http://example.com/check');
    const body = await res3.json();
    expect(body.draft).toBe(false);
  });

  it('enable then disable in the same request — disable wins', async () => {
    const app = new Hono();
    app.use('*', createDraftModeMiddleware({ secret: SECRET }));
    app.get('/toggle', c => {
      enableDraftMode(c);
      disableDraftMode(c);
      return c.json({ ok: true });
    });

    const res = await app.request('http://example.com/toggle');
    const setCookie = parseSetCookie(res.headers)!;
    // 最终 action 是 disable,所以 cookie 应被清除
    expect(setCookie).toContain('Max-Age=0');
  });
});

/* -------------------------------------------------------------------------- */
/* defineDraftMode 别名                                                         */
/* -------------------------------------------------------------------------- */

describe('P9-23: defineDraftMode alias', () => {
  it('works as an alias for createDraftModeMiddleware', async () => {
    const app = new Hono();
    app.use('*', defineDraftMode({ secret: SECRET }));
    let result = false;
    app.get('/', c => {
      result = isDraftMode(c);
      return c.json({ ok: true });
    });

    const token = signToken(Date.now() + 3600_000);
    await app.request('http://example.com/', {
      headers: { cookie: `ubean_draft=${token}` }
    });
    expect(result).toBe(true);
  });
});
