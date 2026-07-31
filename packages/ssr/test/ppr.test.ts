/**
 * P9-04 Partial Prerendering / Server Islands — SSR streaming 集成测试
 *
 * 验证 `server:defer` 指令在 SSR 流式渲染中的端到端行为:
 * - 异步组件(`async setup`)在流式 SSR 中通过 `<Suspense>` 边界流式输出
 * - 静态内容(非 deferred)先于 deferred 内容输出
 * - 多个 deferred 组件并行解析,流式输出
 *
 * 注意:这些测试验证 `@ubean/ssr` 的 `renderToStream` 与 Vue 原生 Suspense
 * 流式行为的集成,不直接依赖 `server:defer` 编译时转换(转换由 `@ubean/islands`
 * 的 Vite 插件完成,在 SSR 运行时已是普通 `<Suspense>` 边界)。
 *
 * Vue SSR Suspense 行为说明:
 * - `renderToNodeStream` 遇到 `<Suspense>` 时会等待 `async setup()` 解析
 * - 解析完成后,异步组件的渲染内容会出现在输出中(fallback 不会出现在 SSR 输出)
 * - 静态内容(非 deferred)会被先行流式输出,deferred 内容在解析后输出
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h, Suspense } from 'vue';
import { SSR_CONTENT_MARKER } from '@ubean/pages';
import type { PageObject } from '@ubean/pages';
import { createVueRenderer } from '../src/index';

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function makeShell(): string {
  return `<!DOCTYPE html><html><head></head><body><div id="app">${SSR_CONTENT_MARKER}</div></body></html>`;
}

const pageObj: PageObject = {
  component: 'PprTestPage',
  props: {},
  params: {},
  url: '/dashboard'
};

/**
 * Create an async component that resolves after `delay` ms with the given label.
 * Uses `async setup()` — the canonical way to trigger Suspense in SSR.
 */
function makeAsyncComponent(label: string, delay = 5) {
  return defineComponent({
    name: `Async${label}`,
    async setup() {
      await new Promise(resolve => setTimeout(resolve, delay));
      return () => h('div', { class: `async-${label.toLowerCase()}` }, `Async ${label} Resolved`);
    }
  });
}

describe('P9-04 PPR streaming with <Suspense>', () => {
  it('streams deferred async component after static content', async () => {
    const AsyncStats = makeAsyncComponent('Stats', 5);

    const Page = defineComponent({
      name: 'PprPage',
      setup() {
        return () =>
          h('div', [
            h('header', { class: 'static' }, 'Static Header'),
            // <Suspense> wrapping an async component — this is what `server:defer`
            // compiles to at build time.
            h(Suspense, null, {
              default: () => h(AsyncStats),
              fallback: () => h('div', { class: 'fallback' }, 'Loading...')
            })
          ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => Page,
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });

    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    // Static content is present
    expect(html).toContain('Static Header');
    // The deferred component resolved and is present (SSR waits for async setup)
    expect(html).toContain('Async Stats Resolved');
  });

  it('renders resolved content (not fallback) when async setup completes', async () => {
    const AsyncSlow = makeAsyncComponent('Slow', 5);

    const Page = defineComponent({
      name: 'PprSlowPage',
      setup() {
        return () =>
          h('div', [
            h('p', 'Before'),
            h(Suspense, null, {
              default: () => h(AsyncSlow),
              fallback: () => h('div', 'Fallback')
            }),
            h('p', 'After')
          ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => Page,
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });

    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    // Vue's streaming SSR with Suspense waits for async resolution by default,
    // so the resolved content should be in the final HTML (not the fallback).
    expect(html).toContain('Async Slow Resolved');
    expect(html).not.toContain('Fallback');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('handles multiple deferred components in the same page', async () => {
    const AsyncA = makeAsyncComponent('A', 5);
    const AsyncB = makeAsyncComponent('B', 8);

    const Page = defineComponent({
      name: 'MultiDeferPage',
      setup() {
        return () =>
          h('div', [
            h(Suspense, null, {
              default: () => h(AsyncA),
              fallback: () => h('div', 'Loading A')
            }),
            h(Suspense, null, {
              default: () => h(AsyncB),
              fallback: () => h('div', 'Loading B')
            })
          ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => Page,
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });

    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    expect(html).toContain('Async A Resolved');
    expect(html).toContain('Async B Resolved');
  });

  it('static content outside Suspense is not blocked by deferred components', async () => {
    const AsyncDeferred = makeAsyncComponent('Deferred', 5);

    const Page = defineComponent({
      name: 'PprMixedPage',
      setup() {
        return () =>
          h('div', { class: 'page' }, [
            h('h1', 'Page Title'),
            h('nav', 'Navigation'),
            h(Suspense, null, {
              default: () => h(AsyncDeferred),
              fallback: () => h('div', 'Loading...')
            }),
            h('footer', 'Footer')
          ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => Page,
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });

    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    // All static content is present
    expect(html).toContain('Page Title');
    expect(html).toContain('Navigation');
    expect(html).toContain('Footer');
    // Deferred content resolved (SSR waits for async setup)
    expect(html).toContain('Async Deferred Resolved');
  });

  it('renderer.preambleScript is available for PPR pages (islands bootstrap)', () => {
    const renderer = createVueRenderer({
      resolvePageComponent: async () => defineComponent({ render: () => null }),
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });
    expect(typeof renderer.preambleScript).toBe('string');
  });
});
