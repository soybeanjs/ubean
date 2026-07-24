import { createSSRApp, defineComponent, h, provide, reactive } from 'vue';
import type { App, Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import { createHead, transformHtmlTemplate } from '@unhead/vue/server';
import { SSR_CONTENT_MARKER } from '../../runtime/pages/protocol';
import type {
  PageObject,
  PageRenderer,
  PageAssetTags,
  PageRenderContext,
  PageHead
} from '../../runtime/pages/protocol';
import type { ResolvedAppConfig } from '../../runtime/vue/define-app';
import { getIslandsBootstrapScript } from '../islands';

export interface VueRendererSimpleOptions {
  resolvePageComponent: (path: string) => Promise<Component | null>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null | undefined;
  /**
   * Resolves the user's `defineApp` config for the server side.
   * When provided, plugins / globalComponents / provides / head / onAppCreated
   * will be applied to each SSR app instance.
   */
  resolveAppConfig?: () => ResolvedAppConfig | Promise<ResolvedAppConfig>;
}

export interface VueRendererRouterOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null | undefined;
  /**
   * Resolves the user's `defineApp` config for the server side.
   * When provided, plugins / globalComponents / provides / head / onAppCreated
   * will be applied to each SSR app instance.
   */
  resolveAppConfig?: () => ResolvedAppConfig | Promise<ResolvedAppConfig>;
}

export type VueRendererOptions = VueRendererSimpleOptions | VueRendererRouterOptions;

/**
 * Push a `PageHead` (from `defineApp` or page-level `head`) into an @unhead head instance.
 * Extracted so both the global app head and per-page head use the same mapping.
 */
function pushPageHead(head: ReturnType<typeof createHead>, pageHead: PageHead): void {
  const headInput: Record<string, any> = {};
  if (pageHead.title) headInput.title = pageHead.title;
  if (pageHead.htmlAttrs) headInput.htmlAttrs = pageHead.htmlAttrs;
  if (pageHead.bodyAttrs) headInput.bodyAttrs = pageHead.bodyAttrs;
  if (pageHead.meta) headInput.meta = pageHead.meta;
  if (pageHead.link) headInput.link = pageHead.link;
  if (pageHead.script) headInput.script = pageHead.script;
  head.push(headInput as any);
}

/**
 * Apply user's `defineApp` config (plugins, globalComponents, provides) and
 * invoke `onAppCreated` on a freshly created SSR app instance.
 */
async function applyServerAppConfig(app: App, appConfig: ResolvedAppConfig): Promise<void> {
  const { applyAppConfig } = await import('../../runtime/vue/define-app');
  applyAppConfig(app, appConfig, 'server');
  if (appConfig.onAppCreated) {
    await appConfig.onAppCreated(app);
  }
}

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

    // Resolve user's defineApp config once per render. The config object is
    // cheap to produce (object merge) and is the same across requests, but
    // resolving lazily here keeps dev-mode HMR working correctly.
    const appConfig = options.resolveAppConfig ? await options.resolveAppConfig() : null;

    // 1. Global app head from defineApp (title / meta defaults) — pushed first
    //    so page-specific head can override.
    if (appConfig?.head) {
      pushPageHead(head, appConfig.head);
    }

    // 2. Locale head
    if (renderContext?.locale) {
      head.push({
        htmlAttrs: {
          lang: renderContext.locale,
          dir: renderContext.localeDir || 'ltr'
        }
      });
    }

    // 3. Page-specific head (overrides app-level defaults)
    if (pageObj.head) {
      pushPageHead(head, pageObj.head);
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
      if (appConfig) {
        await applyServerAppConfig(app, appConfig);
      }
      appHtml = await renderToString(app);
    } else {
      const { createUbeanSSRApp } = await import('../../runtime/vue/app');
      const { app: createdApp, router } = createUbeanSSRApp(pageObj, {
        routes: options.routes,
        resolveLayoutComponent: options.resolveLayoutComponent,
        defaultLayout: options.defaultLayout,
        head
      });
      if (appConfig) {
        await applyServerAppConfig(createdApp, appConfig);
      }
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
