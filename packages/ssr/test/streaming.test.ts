/**
 * Streaming SSR 单元测试
 *
 * 验证 `createVueRenderer` 的 `renderToStream` 方法:
 * - 返回 ReadableStream<Uint8Array>
 * - 流式输出包含 Vue 渲染的 app HTML
 * - shell 拆分(head/tail)正确,SSR_CONTENT_MARKER 处插入 app HTML
 * - state script 在流式模式下移到 tail(app div 之后)
 * - 静态 head(definePage title/meta)注入到 headPart
 * - 无 shell 时直接流式输出 app HTML
 *
 * 同时验证 `renderPageToStream` 的回退逻辑:
 * - renderer 不支持流式时,回退为缓冲渲染并包装为单块流
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { createVueRenderer } from '../src/index';
import { renderPageToStream, SSR_CONTENT_MARKER, STATE_DATA_ID, STATE_MARKER } from '@ubean/pages';
import type { PageObject, PageRenderer } from '@ubean/pages';

/** 读取 ReadableStream<Uint8Array> 为完整字符串。 */
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

/** 构造一个简单的 page component,渲染传入的文本。 */
function makePageComponent(text: string) {
  return defineComponent({
    name: 'TestPage',
    setup() {
      return () => h('div', { class: 'test-content' }, text);
    }
  });
}

/** 构造一个完整 shell(模拟 buildPageShell 的输出),包含 SSR_CONTENT_MARKER 和 state 占位。 */
function makeShell(): string {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    `<script id="${STATE_DATA_ID}" type="application/json">${STATE_MARKER}</script>`,
    '</head>',
    '<body>',
    `<div id="app">${SSR_CONTENT_MARKER}</div>`,
    '</body>',
    '</html>'
  ].join('\n');
}

const pageObj: PageObject = {
  component: 'TestPage',
  props: {},
  params: {},
  url: '/'
};

describe('Streaming SSR - createVueRenderer.renderToStream', () => {
  const renderer = createVueRenderer({
    resolvePageComponent: async () => makePageComponent('Hello Streaming SSR'),
    resolveLayoutComponent: async () => null,
    defaultLayout: null
  });

  it('returns a ReadableStream', () => {
    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('streams complete HTML document containing Vue app content', async () => {
    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);
    expect(html).toContain('Hello Streaming SSR');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('</html>');
  });

  it('splits shell at SSR_CONTENT_MARKER and places app HTML in the app div', async () => {
    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    // head 部分在 app content 之前
    const headIdx = html.indexOf('</head>');
    const contentIdx = html.indexOf('Hello Streaming SSR');
    expect(headIdx).toBeGreaterThan(-1);
    expect(contentIdx).toBeGreaterThan(headIdx);

    // app div 包裹渲染内容
    const appDivIdx = html.indexOf('<div id="app">');
    expect(appDivIdx).toBeGreaterThan(-1);
    expect(contentIdx).toBeGreaterThan(appDivIdx);

    // SSR_CONTENT_MARKER 不应残留在输出中
    expect(html).not.toContain(SSR_CONTENT_MARKER);
  });

  it('injects state script after app div (not in head) in streaming mode', async () => {
    const stream = renderer.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);

    // state script 应出现在 app content 之后(tail 部分)
    const contentIdx = html.indexOf('Hello Streaming SSR');
    const stateIdx = html.indexOf(`id="${STATE_DATA_ID}"`);
    expect(stateIdx).toBeGreaterThan(contentIdx);

    // head 中不应有 state script 占位(流式模式下已移除)
    const headEnd = html.indexOf('</head>');
    const headSection = html.slice(0, headEnd);
    expect(headSection).not.toContain(STATE_DATA_ID);
  });

  it('works without shell (direct app HTML stream)', async () => {
    const stream = renderer.renderToStream!(pageObj, '', {}, undefined);
    const html = await readStream(stream);
    expect(html).toContain('Hello Streaming SSR');
    expect(html).not.toContain(SSR_CONTENT_MARKER);
  });

  it('falls back to direct app stream when shell has no SSR_CONTENT_MARKER', async () => {
    const stream = renderer.renderToStream!(pageObj, '<html><body>no-marker</body></html>', {}, undefined);
    const html = await readStream(stream);
    expect(html).toContain('Hello Streaming SSR');
  });

  it('injects static head (title/meta) from pageObj.head into headPart', async () => {
    const pageWithHead: PageObject = {
      ...pageObj,
      head: {
        title: 'Streaming Page Title',
        meta: [{ name: 'description', content: 'streaming test' }]
      }
    };
    const stream = renderer.renderToStream!(pageWithHead, makeShell(), {}, undefined);
    const html = await readStream(stream);
    expect(html).toContain('<title>Streaming Page Title</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('streaming test');
  });

  it('stream produces valid UTF-8 for multi-byte characters', async () => {
    const renderer2 = createVueRenderer({
      resolvePageComponent: async () => makePageComponent('流式渲染 中文 🚀'),
      resolveLayoutComponent: async () => null,
      defaultLayout: null
    });
    const stream = renderer2.renderToStream!(pageObj, makeShell(), {}, undefined);
    const html = await readStream(stream);
    expect(html).toContain('流式渲染 中文 🚀');
  });

  it('renderer exposes renderToStream method', () => {
    expect(typeof renderer.renderToStream).toBe('function');
  });

  it('renderer exposes preambleScript (islands bootstrap)', () => {
    expect(typeof renderer.preambleScript).toBe('string');
  });
});

describe('Streaming SSR - renderPageToStream fallback', () => {
  it('falls back to buffered render when renderer is null', async () => {
    // renderer 为 null 时,renderPageToStream 回退到 renderPage,
    // renderPage 在无 renderer 时输出纯 shell(标记 data-ubean-ssr="false")。
    const stream = renderPageToStream(pageObj, {}, null, 'app', undefined);
    expect(stream).toBeInstanceOf(ReadableStream);
    const html = await readStream(stream);
    // 无 renderer 时输出 shell(包含 app div,标记为非 SSR)
    expect(html).toContain('id="app"');
    expect(html).toContain('data-ubean-ssr="false"');
  });

  it('falls back to buffered render when renderer has no renderToStream', async () => {
    const bufferedRenderer: PageRenderer = {
      render: async () => '<div id="app"><div class="test-content">Buffered</div></div>'
    };
    const stream = renderPageToStream(pageObj, {}, bufferedRenderer, 'app', undefined);
    expect(stream).toBeInstanceOf(ReadableStream);
    const html = await readStream(stream);
    expect(html).toContain('Buffered');
  });

  it('uses renderToStream when available', async () => {
    const streamingRenderer: PageRenderer = {
      render: async () => 'should-not-be-used',
      renderToStream: (_pageObj, shell, _assetTags, _ctx) => {
        const encoder = new TextEncoder();
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(shell.replace(SSR_CONTENT_MARKER, '<div class="test-content">Streamed</div>')));
            controller.close();
          }
        });
      }
    };
    const stream = renderPageToStream(pageObj, {}, streamingRenderer, 'app', undefined);
    const html = await readStream(stream);
    expect(html).toContain('Streamed');
    expect(html).not.toContain('should-not-be-used');
  });
});
