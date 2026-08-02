import { describe, expect, it } from 'vitest';
import { BasePage, api } from '../pages/base.page';

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
