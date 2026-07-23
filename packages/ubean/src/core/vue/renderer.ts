import { createSSRApp, defineComponent, h, provide, reactive } from 'vue';
import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import { createHead, transformHtmlTemplate } from '@unhead/vue/server';
import { SSR_CONTENT_MARKER } from '../../runtime/pages/protocol';
import type { PageObject, PageRenderer, PageAssetTags, PageRenderContext } from '../../runtime/pages/protocol';
import { getIslandsBootstrapScript } from '../islands';

export interface VueRendererSimpleOptions {
  resolvePageComponent: (path: string) => Promise<Component | null>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null | undefined;
}

export interface VueRendererRouterOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null | undefined;
}

export type VueRendererOptions = VueRendererSimpleOptions | VueRendererRouterOptions;

function isSimpleOptions(opts: VueRendererOptions): opts is VueRendererSimpleOptions {
  return 'resolvePageComponent' in opts;
}

async function resolveLayoutChain(
  layoutName: string | false | null | undefined,
  defaultLayout: string | null,
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>,
  resolveLayoutParent?: (name: string) => string | null | undefined
): Promise<Component[]> {
  const layouts: Component[] = [];
  const visited = new Set<string>();

  let current: string | false | null | undefined = layoutName === undefined ? defaultLayout : layoutName;

  while (current != null && current !== false && !visited.has(current)) {
    visited.add(current);
    const comp = await resolveLayoutComponent(current);
    if (comp) {
      layouts.unshift(comp);
    }
    current = resolveLayoutParent ? resolveLayoutParent(current) : null;
  }

  return layouts;
}

function createSimpleApp(
  pageObj: PageObject,
  PageComp: Component,
  layoutChain: Component[],
  head: ReturnType<typeof createHead>
) {
  const pageData = reactive({ ...pageObj });

  const PAGE_KEY = Symbol('ubean-page');

  const RootComponent = defineComponent({
    name: 'UbeanSimpleApp',
    setup() {
      provide(PAGE_KEY, pageData);

      return () => {
        let innerVNode: any = h(PageComp as any, pageObj.props || {});
        for (let i = layoutChain.length - 1; i >= 0; i--) {
          const Layout = layoutChain[i];
          const child = innerVNode;
          innerVNode = h(Layout as any, {}, { default: () => child });
        }
        return innerVNode;
      };
    }
  });

  const app = createSSRApp(RootComponent);
  app.use(head);

  return app;
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  const render: PageRenderer['render'] = async (
    pageObj: PageObject,
    shellHtml: string,
    _assetTags: PageAssetTags,
    renderContext?: PageRenderContext
  ) => {
    const head = createHead();

    if (renderContext?.locale) {
      head.push({
        htmlAttrs: {
          lang: renderContext.locale,
          dir: renderContext.localeDir || 'ltr'
        }
      });
    }

    if (pageObj.head) {
      const headInput: Record<string, any> = {};
      if (pageObj.head.title) headInput.title = pageObj.head.title;
      if (pageObj.head.htmlAttrs) headInput.htmlAttrs = pageObj.head.htmlAttrs;
      if (pageObj.head.bodyAttrs) headInput.bodyAttrs = pageObj.head.bodyAttrs;
      if (pageObj.head.meta) headInput.meta = pageObj.head.meta;
      if (pageObj.head.link) headInput.link = pageObj.head.link;
      if (pageObj.head.script) headInput.script = pageObj.head.script;
      head.push(headInput as any);
    }

    let appHtml: string;
    if (isSimpleOptions(options)) {
      const pageComponent = await options.resolvePageComponent(pageObj.component);
      if (!pageComponent) {
        throw new Error(`[ubean] Could not resolve page component: ${pageObj.component}`);
      }

      const layoutChain =
        pageObj.layout === false
          ? []
          : await resolveLayoutChain(
              pageObj.layout,
              options.defaultLayout || null,
              options.resolveLayoutComponent,
              options.resolveLayoutParent
            );

      const app = createSimpleApp(pageObj, pageComponent, layoutChain, head);
      appHtml = await renderToString(app);
    } else {
      const { createUbeanSSRApp } = await import('../../runtime/vue/app');
      const { app: createdApp, router } = createUbeanSSRApp(pageObj, {
        routes: options.routes,
        resolveLayoutComponent: options.resolveLayoutComponent,
        defaultLayout: options.defaultLayout,
        head
      });
      await router.isReady();
      appHtml = await renderToString(createdApp);
    }

    if (!shellHtml) {
      return appHtml;
    }

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
