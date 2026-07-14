import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import { createHead, transformHtmlTemplate } from '@unhead/vue/server';
import { SSR_CONTENT_MARKER } from '../../runtime/pages/protocol';
import type { PageObject, PageRenderer, PageAssetTags, PageRenderContext } from '../../runtime/pages/protocol';
import { createUbeanSSRApp } from '../../runtime/vue/app';
import { getIslandsBootstrapScript } from '../islands';

export interface VueRendererOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  const render: PageRenderer['render'] = async (
    pageObj: PageObject,
    shellHtml: string,
    _assetTags: PageAssetTags,
    renderContext?: PageRenderContext
  ) => {
    const head = createHead();

    const htmlAttrs: Record<string, string> = {};
    if (renderContext?.locale) {
      htmlAttrs.lang = renderContext.locale;
      htmlAttrs.dir = renderContext.localeDir || 'ltr';
    }

    if (pageObj.head?.htmlAttrs) {
      Object.assign(htmlAttrs, pageObj.head.htmlAttrs);
    }

    const headEntry: Record<string, unknown> = {};
    if (pageObj.head?.title) headEntry.title = pageObj.head.title;
    if (pageObj.head?.meta) headEntry.meta = pageObj.head.meta;
    if (pageObj.head?.link) headEntry.link = pageObj.head.link;
    if (pageObj.head?.script) headEntry.script = pageObj.head.script;
    if (pageObj.head?.bodyAttrs) headEntry.bodyAttrs = pageObj.head.bodyAttrs;
    if (Object.keys(htmlAttrs).length > 0) headEntry.htmlAttrs = htmlAttrs;

    if (Object.keys(headEntry).length > 0) {
      head.push(headEntry);
    }

    const { app, router } = createUbeanSSRApp(pageObj, {
      routes: options.routes,
      resolveLayoutComponent: options.resolveLayoutComponent,
      defaultLayout: options.defaultLayout,
      head
    });

    await router.isReady();

    const appHtml = await renderToString(app);

    const htmlWithApp = shellHtml.replace(SSR_CONTENT_MARKER, appHtml);

    const html = transformHtmlTemplate(head, htmlWithApp);

    return html;
  };

  return {
    render,
    preambleScript: getIslandsBootstrapScript()
  };
}

export { renderToString } from '@vue/server-renderer';
