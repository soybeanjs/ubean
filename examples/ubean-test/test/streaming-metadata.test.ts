/**
 * 流式 metadata 爬虫降级(Task 6 / P9-24)—— HTTP 集成测试
 *
 * 通过 /api/streaming-metadata-test?action=xxx 端点验证 `isBotUserAgent`
 * 通过 `ubean` 主包导出的端到端可达性与运行时行为。
 * 测试需 dev server 运行(global-setup 启动)。
 */
import { describe, it, expect } from 'vitest';
import { getJson } from './helper';

describe.skipIf(!process.env.UBEAN_TEST_BASE_URL)('流式 metadata 爬虫降级 (Task 6 / P9-24)', () => {
  it('detect: 识别 Googlebot UA', async () => {
    const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const res = await getJson(`/api/streaming-metadata-test?action=detect&ua=${encodeURIComponent(ua)}`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ ua, isBot: true });
  });

  it('detect: Chrome UA 不被识别为爬虫', async () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const res = await getJson(`/api/streaming-metadata-test?action=detect&ua=${encodeURIComponent(ua)}`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ isBot: false });
  });

  it('botUAs: 7 个已知爬虫 UA 全部识别', async () => {
    const res = await getJson('/api/streaming-metadata-test?action=botUAs');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ allDetected: true });
  });

  it('browserUAs: 3 个浏览器 UA 全部不识别', async () => {
    const res = await getJson('/api/streaming-metadata-test?action=browserUAs');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ allNotBot: true });
  });

  it('empty: 空/undefined/null UA 返回 false', async () => {
    const res = await getJson('/api/streaming-metadata-test?action=empty');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      emptyString: false,
      undefined: false,
      null: false
    });
  });
});
