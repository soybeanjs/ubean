import type { Component } from 'vue';
import { createSSRApp, defineComponent, h, provide, reactive } from 'vue';
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

  while (current && current !== false && !visited.has(current as string)) {
    visited.add(current as string);
    const comp = await resolveLayoutComponent(current);
    if (comp) {
      layouts.unshift(comp);
    }
    current = resolveLayoutParent ? resolveLayoutParent(current as string) : null;
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

      if (pageObj.head?.title) {
        head.push({ title: pageObj.head.title });
      }
      if (pageObj.head?.meta) {
        for (const m of pageObj.head.meta) {
          head.push({ meta: [m] });
        }
      }
      if (pageObj.head?.link) {
        for (const l of pageObj.head.link) {
          head.push({ link: [l] });
        }
      }
      if (pageObj.head?.script) {
        for (const s of pageObj.head.script) {
          head.push({ script: [s] });
        }
      }

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

    const htmlAttrs: Record<string, string> = {};
    if (renderContext?.locale) {
      htmlAttrs.lang = renderContext.locale;
      htmlAttrs.dir = renderContext.localeDir || 'ltr';
    }
    if (pageObj.head?.htmlAttrs) {
      Object.assign(htmlAttrs, pageObj.head.htmlAttrs);
    }
    if (Object.keys(htmlAttrs).length > 0) {
      head.push({ htmlAttrs });
    }

    const bodyAttrs: Record<string, string> = {};
    if (pageObj.head?.bodyAttrs) {
      Object.assign(bodyAttrs, pageObj.head.bodyAttrs);
    }
    if (Object.keys(bodyAttrs).length > 0) {
      head.push({ bodyAttrs });
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
