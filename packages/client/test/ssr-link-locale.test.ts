/**
 * 复现:SSR 侧 `<Link to="/">` 在 locale=zh 的渲染上下文下是否输出 `/zh`。
 *
 * 链路:router-mode `createVueRenderer` → `prepareRender({locale:'zh'})`
 * → `createUbeanSSRApp` 持有 composer(locale=zh)→ `Link` 经
 * `LOCALIZE_PATH_KEY` 调用 `localizePath`。
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { SSR_CONTENT_MARKER } from '@ubean/pages';
import type { PageObject } from '@ubean/pages';
import { Link } from '@ubean/vue';
import { createVueRenderer } from '../src/ssr';

function makeShell(): string {
  return `<!DOCTYPE html><html><head></head><body><div id="app">${SSR_CONTENT_MARKER}</div></body></html>`;
}

const routes = [
  {
    path: '/:locale(zh)?',
    name: 'index',
    component: { render: () => h('div', 'home') }
  },
  {
    path: '/:locale(zh)?/about',
    name: 'about',
    component: { render: () => h('div', 'about') }
  }
];

async function render(locale: string, url: string): Promise<string> {
  const Layout = defineComponent({
    name: 'UbeanTestLayout',
    setup() {
      return () =>
        h('header', [h(Link, { to: '/', class: 'logo' }, () => 'logo'), h(Link, { to: '/about' }, () => 'about')]);
    }
  });

  const renderer = createVueRenderer({
    routes,
    resolveLayoutComponent: async () => Layout,
    defaultLayout: 'default'
  });

  const pageObj: PageObject = {
    component: 'About',
    props: {},
    params: {},
    url
  };

  const renderContext = {
    locale,
    localeDir: 'ltr' as const,
    routing: {
      defaultLocale: 'en',
      locales: ['en', 'zh'],
      strategy: 'prefix_except_default' as const
    }
  };

  const result = await renderer.render(pageObj, makeShell(), {}, renderContext);
  const html = typeof result === 'string' ? result : result.html;
  return html;
}

describe('SSR Link 本地化', () => {
  it('locale=zh 时 logo href 应为 /zh', async () => {
    const html = await render('zh', '/zh/about');
    expect(html).toContain('href="/zh"');
    expect(html).toContain('href="/zh/about"');
  });

  it('locale=en 时 logo href 应为 /', async () => {
    const html = await render('en', '/about');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/about"');
  });
});
