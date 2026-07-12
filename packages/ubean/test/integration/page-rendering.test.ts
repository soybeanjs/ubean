import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { createVueRenderer } from '../../src/core/vue/renderer';
import {
  renderPage,
  buildPageShell,
  insertSsrContent,
  PAGE_DATA_ID,
  SSR_CONTENT_MARKER
} from '../../src/runtime/pages/protocol';
import type { PageObject, PageAssetTags } from '../../src/runtime/pages/protocol';

describe('Integration: Full page rendering pipeline', () => {
  it('renders complete HTML page with SSR content and page data', async () => {
    const HomePage = defineComponent({
      name: 'HomePage',
      render() {
        return h('div', { class: 'home' }, [h('h1', 'Welcome Home'), h('p', 'This is server-rendered content')]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => HomePage,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/index.vue',
      props: { title: 'Home' },
      params: {},
      url: '/',
      head: {
        title: 'Home - ubean',
        meta: [{ name: 'description', content: 'Welcome page' }]
      }
    };

    const assetTags: PageAssetTags = {
      css: '<link rel="stylesheet" href="/assets/app.css">',
      preloads: '<link rel="modulepreload" href="/assets/app.js">',
      body: '<script type="module" src="/assets/app.js"></script>'
    };

    const html = await renderPage(pageObj, assetTags, renderer);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
    expect(html).toContain(`<script id="${PAGE_DATA_ID}" type="application/json">`);
    expect(html).toContain('Welcome Home');
    expect(html).toContain('This is server-rendered content');
    expect(html).toContain('<title>Home - ubean</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('Welcome page');
    expect(html).toContain('/assets/app.css');
    expect(html).toContain('/assets/app.js');
    expect(html).not.toContain(SSR_CONTENT_MARKER);
  });

  it('renders client-only shell when no renderer provided', async () => {
    const pageObj: PageObject = {
      component: 'pages/spa.vue',
      props: {},
      params: {},
      url: '/spa'
    };

    const html = await renderPage(pageObj, {}, null);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain(`id="${PAGE_DATA_ID}"`);
    expect(html).toContain('data-ubean-ssr="false"');
    expect(html).not.toContain(SSR_CONTENT_MARKER);
  });

  it('buildPageShell includes all asset tags and page data', () => {
    const pageObj: PageObject = {
      component: 'pages/test.vue',
      props: { foo: 'bar' },
      params: { id: '42' },
      url: '/test/42'
    };

    const assets: PageAssetTags = {
      css: '<link rel="stylesheet" href="/style.css">',
      preloads: '<link rel="preload" href="/font.woff2">',
      body: '<script src="/app.js"></script>'
    };

    const shell = buildPageShell(pageObj, assets, '<script>bootstrap()</script>');

    expect(shell).toContain('<!doctype html>');
    expect(shell).toContain('<div id="app">');
    expect(shell).toContain(SSR_CONTENT_MARKER);
    expect(shell).toContain(`id="${PAGE_DATA_ID}"`);
    expect(shell).toContain('/style.css');
    expect(shell).toContain('/font.woff2');
    expect(shell).toContain('<script>bootstrap()</script>');
    expect(shell).toContain('/app.js');
    expect(shell).toContain('"component":"pages/test.vue"');
    expect(shell).toContain('"url":"/test/42"');
  });

  it('insertSsrContent replaces marker with rendered HTML', () => {
    const shell = `<html><body><div id="app">${SSR_CONTENT_MARKER}</div></body></html>`;
    const appHtml = '<div class="page"><h1>Hello</h1></div>';
    const result = insertSsrContent(shell, appHtml);

    expect(result).not.toContain(SSR_CONTENT_MARKER);
    expect(result).toContain('<div class="page"><h1>Hello</h1></div>');
    expect(result).toContain('<div id="app">');
  });

  it('safeJsonStringify escapes XSS vectors in page data', async () => {
    const PageComp = defineComponent({
      name: 'XssTest',
      render() {
        return h('div', 'ok');
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/xss.vue',
      props: {
        userInput: '<script>alert("xss")</script>'
      },
      params: {},
      url: '/xss'
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('\\u003cscript\\u003e');
    expect(html).not.toContain('<script>alert("xss")</script>');
  });

  it('renders page with htmlAttrs and bodyAttrs from head', async () => {
    const PageComp = defineComponent({
      name: 'HtmlAttrsPage',
      render() {
        return h('div', 'content');
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/lang.vue',
      props: {},
      params: {},
      url: '/zh',
      head: {
        htmlAttrs: { lang: 'zh-CN' },
        bodyAttrs: { class: 'theme-dark' }
      }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('class="theme-dark"');
  });

  it('includes islands bootstrap script in rendered page', async () => {
    const PageComp = defineComponent({
      name: 'IslandsPage',
      render() {
        return h('div', 'islands page');
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => PageComp,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/islands.vue',
      props: {},
      params: {},
      url: '/islands'
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(renderer.preambleScript).toBeTruthy();
    expect(html).toContain('data-hydrating');
  });
});
