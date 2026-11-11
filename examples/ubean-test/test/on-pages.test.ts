/**
 * `routing.onPages` 钩子端到端：`pages/docs/*.meta.ts` 只在 meta 里写目标地址，
 * 钩子把它们改写成借用 `IframeUrl` 组件的 reuse 路由，URL 以静态 props 注入。
 *
 * 覆盖的是「元数据 → 路由」这条转换本身，而不是 iframe 的渲染细节：
 * 页面若没进路由表，`/docs/a` 会是 404 或落到 404 页。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { api, requireDevServer } from './helper';

beforeAll(requireDevServer);

describe('routing.onPages — meta 转静态 props 的复用路由', () => {
  it('/docs/a 命中 IframeUrl 组件，src 来自 meta.iframeUrl', async () => {
    const res = await api('/docs/a');
    expect(res.status).toBe(200);
    expect(res.text).toContain('https://example.com/');
    expect(res.text).toContain('<iframe');
  });

  it('/docs/b 同样生效（钩子对多条 meta 都生效，不是硬编一条）', async () => {
    const res = await api('/docs/b');
    expect(res.status).toBe(200);
    expect(res.text).toContain('https://vuejs.org/');
  });

  it('meta 里的 title 也进了 props', async () => {
    const res = await api('/docs/a');
    expect(res.text).toContain('Doc A');
  });

  it('目标页自身的动态路由仍然可用（/iframe/:url 未被钩子破坏）', async () => {
    const res = await api('/iframe/https%3A%2F%2Fexample.com%2Fraw');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<iframe');
  });
});
