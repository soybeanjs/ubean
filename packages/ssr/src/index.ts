import { createSSRApp, defineComponent, h, provide, reactive } from 'vue';
import type { App, Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import { getIslandsBootstrapScript } from '@ubean/islands';
import { SSR_CONTENT_MARKER } from '@ubean/pages';
import type {
  PageObject,
  PageRenderer,
  PageAssetTags,
  PageRenderContext,
  PageHead,
  PageRenderResult
} from '@ubean/pages';
import { applyAppConfig } from '@ubean/runtime/define-app';
import type { ResolvedAppConfig } from '@ubean/runtime/define-app';
import { createHead, transformHtmlTemplate } from '@unhead/vue/server';

export interface VueRendererSimpleOptions {
  resolvePageComponent: (path: string) => Promise<Component | null>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
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
  applyAppConfig(app, appConfig, 'server');
  if (appConfig.onAppCreated) {
    await appConfig.onAppCreated(app);
  }
}

function isSimpleOptions(opts: VueRendererOptions): opts is VueRendererSimpleOptions {
  return 'resolvePageComponent' in opts;
}

/**
 * Resolve a single layout component by name.
 * Returns `null` when layout is `false`, `null`, or not found.
 * ubean uses flat single-layer layout (no nesting), matching the
 * `layout: string | false` field on each page route.
 */
async function resolveSingleLayout(
  layoutName: string | false | null | undefined,
  defaultLayout: string | null,
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>
): Promise<Component | null> {
  const resolved = layoutName === undefined ? defaultLayout : layoutName;
  if (resolved === false || resolved == null) return null;
  return resolveLayoutComponent(resolved);
}

function createSimpleApp(
  pageObj: PageObject,
  PageComp: Component,
  layout: Component | null,
  head: ReturnType<typeof createHead>
) {
  const pageData = reactive({ ...pageObj });

  const PAGE_KEY = Symbol('ubean-page');

  const RootComponent = defineComponent({
    name: 'UbeanSimpleApp',
    setup() {
      provide(PAGE_KEY, pageData);

      return () => {
        const inner = h(PageComp as any, pageObj.props || {});
        if (!layout) return inner;
        return h(layout as any, {}, { default: () => inner });
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
  ): Promise<PageRenderResult> => {
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
    let renderApp: App | null = null;
    if (isSimpleOptions(options)) {
      const pageComponent = await options.resolvePageComponent(pageObj.component);
      if (!pageComponent) {
        throw new Error(`[ubean] Could not resolve page component: ${pageObj.component}`);
      }

      const layout =
        pageObj.layout === false
          ? null
          : await resolveSingleLayout(pageObj.layout, options.defaultLayout || null, options.resolveLayoutComponent);

      const app = createSimpleApp(pageObj, pageComponent, layout, head);
      if (appConfig) {
        await applyServerAppConfig(app, appConfig);
      }
      renderApp = app;
      appHtml = await renderToString(app);
    } else {
      const { createUbeanSSRApp } = await import('@ubean/runtime/app');
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
      renderApp = createdApp;
      appHtml = await renderToString(createdApp);
    }

    // SSR 状态序列化:在 renderToString 完成后,从 app 实例提取状态
    // (如 Pinia 的 pinia.state.value)。返回的 state 会被 renderPage
    // 注入到 HTML 的 __UBEAN_STATE__ script 标签中。
    let state: Record<string, unknown> | undefined;
    if (appConfig?.serializeState && renderApp) {
      try {
        const serialized = await appConfig.serializeState(renderApp);
        if (serialized && Object.keys(serialized).length > 0) {
          state = serialized;
        }
      } catch (err) {
        // 序列化失败不应阻塞渲染,记录错误后继续(产出无 state 的 HTML)
        console.error('[ubean-ssr] serializeState failed:', err);
      }
    }

    if (!shellHtml) {
      // 无 shell 时,无法注入 state,直接返回 HTML 字符串
      return appHtml;
    }

    const htmlWithApp = shellHtml.replace(SSR_CONTENT_MARKER, appHtml);
    const html = transformHtmlTemplate(head, htmlWithApp);

    // 有 state 时返回 { html, state },由 renderPage 注入到 __UBEAN_STATE__
    if (state) {
      return { html, state };
    }
    return html;
  };

  return {
    render,
    preambleScript: getIslandsBootstrapScript()
  };
}

export { renderToString } from '@vue/server-renderer';
