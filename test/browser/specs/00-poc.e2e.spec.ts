import { describe, expect, it } from 'vitest';
import { BasePage, api } from '../pages/base.page';

/**
 * Spec 00: e2e infrastructure POC
 *
 * TS-35：本文件是剩下的 9 个 spec 里**唯一刻意保留 HTTP 用例**的地方 —— 中间那条
 * `performs a Node-side API fetch (no CORS)` 证明的是 **`test/browser/pages/base.page.ts`
 * 的 `api` 对象 → `e2e.fetch` → Node 侧 fetch 这条桥接通路本身可用**（它需要
 * `commands.ts` / `lib/runner.ts` / `__vitest_browser_runner__` 三者都正常）。
 * 其余 100 条纯 HTTP 用例（不验证桥接、只验证 HTTP 契约）已全部下沉到 L2
 * （`examples/ubean-test/test/http-contracts.test.ts` 等），见 `docs/test.md` 的 TS-35 台账。
 */
describe('POC: e2e infrastructure', () => {
  it('opens the home page via Playwright and reads SSR content', async () => {
    const home = await new BasePage('/').open();
    const heading = await home.text('h1');
    expect(heading).toContain('ubean-test');
  });

  it('performs a Node-side API fetch (no CORS)', async () => {
    const res = await api.get('/api/hello');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ message: 'Hello from ubean API!', method: 'GET' });
  });

  it('navigates via SPA link click', async () => {
    const home = await new BasePage('/').open();
    const result = await home.clickNav('a[href="/about"]');
    expect(result.url).toContain('/about');
    const heading = await home.text('h1');
    expect(heading).toContain('关于');
  });
});
