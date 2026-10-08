import { describe, expect, it } from 'vitest';
import { BlogPage } from '../pages/blog.page';
import { MarketingCsrPage } from '../pages/marketing-csr.page';
import { NotFoundPage } from '../pages/not-found.page';
import { ParallelPage } from '../pages/parallel.page';
import { ServerIslandPropsPage } from '../pages/server-island-props.page';
import { SsrDataOnlyPage } from '../pages/ssr-data-only.page';

/**
 * Spec 12: Special rendering modes
 *
 * TS-36：补齐 TS-35 之后 L3 剩下的 6 个浏览器层空洞（原先 12 个 spec / 201 例，
 * TS-35 把其中 101 条纯 HTTP 用例下沉到 L2 后剩 100 条；这 6 项当时没有覆盖）。
 *
 * 1. `POST /__server-component` props 重渲染（Task 9.4）—— 见下。
 * 2. `/ssr-data-only` 的 `ssr: 'data-only'` 契约：loader 跑、HTML 是空 CSR shell。
 * 3. `/marketing` 的 `ssr: false`：loader **不**跑，且同样是空 CSR shell。
 * 4. 并行路由 `<SlotView name="aside">`：同一路由两个视图共存。
 * 5. `blog/[...slug]` catch-all：多段 slug 归一。
 * 6. 404 预设页：状态码 + 内容 + 返回链接。
 *
 * **2 与 3 的唯一可断言差异是「loader 跑没跑」** —— 两页的 SSR HTML 完全一样（都是
 * `<div id="app" data-ubean-ssr="false"></div>`），差别落在脱水数据上：
 * `__UBEAN_PAGE_DATA__.props` 在 `/ssr-data-only` 是 `{ source: 'loader' }`，
 * 在 `/marketing` 是 `{}`。这条断言因此在**客户端**读 DOM（服务端脱水脚本仍在 DOM 里），
 * 而不是发第二次 HTTP 请求 —— 后者属 L2 领域。
 *
 * 关于第 1 项：成功的 HTTP 契约由 L1 `packages/islands/test/server-component-rerender.test.ts`
 * 的 30+ 例覆盖（含中间件 400/404/500/200 四分支）。L3 要证明的是**浏览器里的端到端闭环**：
 * 点按钮改 props → 客户端 `POST /__server-component` → 服务端用新 props 重渲染 →
 * 容器 `innerHTML` 被替换。这一步**只有真实浏览器能证明**（要跑 `onMounted` + `watch`）。
 */
describe('Special rendering modes', () => {
  describe("ssr: 'data-only' (/ssr-data-only)", () => {
    it('ships an empty CSR shell with loader data dehydrated', async () => {
      const page = await new SsrDataOnlyPage().open();
      // SSR 期：`<div id="app" data-ubean-ssr="false"></div>` —— 无页面内容。
      const shell = (await page.eval(
        "return { ssrFlag: document.getElementById('app').getAttribute('data-ubean-ssr'), hasH1: !!document.querySelector('h1') }"
      )) as { ssrFlag: string | null; hasH1: boolean };
      // 水合后客户端接管，h1 才出现；`data-ubean-ssr` 标记保留在根元素上。
      expect(shell.ssrFlag).toBe('false');
      expect(shell.hasH1).toBe(true);
    });

    it('runs the loader and dehydrates its result', async () => {
      const page = await new SsrDataOnlyPage().open();
      const data = (await page.eval(
        "var el = document.getElementById('__UBEAN_PAGE_DATA__'); return el ? JSON.parse(el.textContent) : null"
      )) as { component?: string; props?: Record<string, unknown> } | null;
      expect(data?.component).toBe('SsrDataOnly');
      // 关键：`data-only` 仍跑 loader（对比下面 `ssr: false` 的 `{}`）。
      expect(data?.props).toEqual({ source: 'loader' });
    });

    it('renders the page content after hydration', async () => {
      const page = await new SsrDataOnlyPage().open();
      expect(await page.heading()).toContain('Dashboard');
      const html = await page.html();
      expect(html).toContain('data-only');
    });
  });

  describe('ssr: false (/marketing)', () => {
    it('does not run the loader (props stay empty)', async () => {
      const page = await new MarketingCsrPage().open();
      const data = (await page.eval(
        "var el = document.getElementById('__UBEAN_PAGE_DATA__'); return el ? JSON.parse(el.textContent) : null"
      )) as { component?: string; props?: Record<string, unknown> } | null;
      expect(data?.component).toBe('Marketing');
      // 与 `/ssr-data-only` 的唯一差异：CSR 跳过 loader。
      expect(data?.props).toEqual({});
    });

    it('renders the page content after hydration', async () => {
      const page = await new MarketingCsrPage().open();
      expect(await page.heading()).toContain('Marketing');
      const html = await page.html();
      expect(html).toContain('CSR only');
    });
  });

  describe('Parallel routes (/parallel + @aside)', () => {
    it('renders the default view from pages/parallel.vue', async () => {
      const page = await new ParallelPage().open();
      expect(await page.heading()).toContain('Parallel Routes');
      expect(await page.count('.parallel-default')).toBe(1);
    });

    it('renders the aside slot via <SlotView name="aside" />', async () => {
      const page = await new ParallelPage().open();
      expect(await page.count('.slot-aside')).toBe(1);
      expect(await page.asideHeading()).toContain('Aside slot');
    });

    it('keeps @aside out of the URL', async () => {
      const page = await new ParallelPage().open();
      const url = await page.url();
      expect(url).toContain('/parallel');
      expect(url).not.toContain('@aside');
    });
  });

  describe('Catch-all route (blog/[...slug])', () => {
    it('matches a multi-segment slug', async () => {
      const page = await new BlogPage('foo/bar').open();
      expect(await page.heading()).toContain('Blog foo/bar');
    });

    it('matches a deeper slug', async () => {
      const page = await new BlogPage('a/b/c').open();
      expect(await page.heading()).toContain('Blog a/b/c');
    });
  });

  describe('404 preset page', () => {
    it('renders the not-found component for an unmatched path', async () => {
      const page = await new NotFoundPage().open();
      expect(await page.heading()).toBe('404');
      expect(await page.message()).toBe('页面不存在');
    });

    it('provides a link back to the home page', async () => {
      const page = await new NotFoundPage().open();
      expect(await page.count('.not-found a[href="/"]')).toBe(1);
      expect(await page.homeLinkText()).toContain('返回首页');
    });
  });

  describe('Server island props re-render (Task 9.4)', () => {
    it('renders the server-rendered island content on first paint', async () => {
      const page = await new ServerIslandPropsPage().open();
      expect(await page.islandText()).toContain('Echo tone: calm');
      expect(await page.tone()).toContain('tone=calm');
    });

    it('re-renders the island on the server when props change', async () => {
      const page = await new ServerIslandPropsPage().open();
      expect(await page.islandText()).toContain('Echo tone: calm');

      // 关键：DOM 文本靠不住 —— props 变了客户端 Vue 自己也会重渲染，`rerenderOnPropsChange`
      // 开或关都会得到 `loud`。该 flag 的全部语义是「客户端发 POST 让服务端重渲染」，
      // 所以必须同时断言 (a) 那趟 POST 真的发生 (b) 返回的片段进到了容器里。
      await page.installServerComponentRequestCounter();
      await page.toggleTone();
      await page.waitForFunction(
        "return !!document.querySelector('.echo-widget') && document.querySelector('.echo-widget').textContent.includes('loud')",
        10000
      );

      expect(await page.serverComponentPostCount()).toBeGreaterThan(0);
      expect(await page.islandText()).toContain('Echo tone: loud');
      expect(await page.tone()).toContain('tone=loud');
    });
  });
});
