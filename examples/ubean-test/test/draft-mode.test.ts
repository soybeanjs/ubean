/**
 * Draft / Preview Mode (Task 5) —— HTTP 集成测试
 *
 * 通过 /api/draft-mode-test?action=xxx 端点验证 `createDraftModeMiddleware`
 * 及 `enableDraftMode`/`disableDraftMode`/`isDraftMode`/`useDraftMode` 端到端行为。
 * 测试需 dev server 运行(global-setup 启动)。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)('Draft / Preview Mode (Task 5)', () => {
  it('noCookie: 无 cookie 时 isEnabled=false', async () => {
    const res = await getJson('/api/draft-mode-test?action=noCookie');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      isEnabledFalse: true
    });
  });

  it('enable: enableDraftMode 设置签名 cookie', async () => {
    const res = await getJson('/api/draft-mode-test?action=enable');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      enabled: true,
      setCookiePresent: true,
      cookieContainsDraft: true
    });
  });

  it('disable: disableDraftMode 通过 Max-Age=0 清除 cookie', async () => {
    const res = await getJson('/api/draft-mode-test?action=disable');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      enabled: false,
      maxAgeZero: true
    });
  });

  it('tampered: 篡改签名的 cookie 被拒绝', async () => {
    const res = await getJson('/api/draft-mode-test?action=tampered');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      rejected: true
    });
  });

  it('expired: 过期 token 被拒绝', async () => {
    const res = await getJson('/api/draft-mode-test?action=expired');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      rejected: true
    });
  });

  it('wrongSecret: 用其他密钥签名的 cookie 被拒绝', async () => {
    const res = await getJson('/api/draft-mode-test?action=wrongSecret');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      rejected: true
    });
  });

  it('roundTrip: enable → 后续请求 isEnabled=true,清除后 isEnabled=false', async () => {
    const res = await getJson('/api/draft-mode-test?action=roundTrip');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      afterEnable: true,
      afterClear: false,
      roundTripOk: true
    });
  });

  it('composable: useDraftMode 返回 { isEnabled, enable, disable } 且功能正常', async () => {
    const res = await getJson('/api/draft-mode-test?action=composable');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      shape: true,
      enableWorks: true,
      disableWorks: true
    });
  });
});
