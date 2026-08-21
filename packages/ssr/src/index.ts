import { createSSRApp, defineComponent, h, provide, reactive } from 'vue';
import type { App, Component } from 'vue';
import { renderToString, renderToNodeStream } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import { createUbeanI18n } from '@ubean/client';
import { applyAppConfig } from '@ubean/client/define-app';
import type { ResolvedAppConfig } from '@ubean/client/define-app';
import { buildLocaleHead } from '@ubean/i18n/browser';
import { getIslandsBootstrapScript } from '@ubean/islands';
import {
  SSR_CONTENT_MARKER,
  STATE_DATA_ID,
  STATE_MARKER,
  safeJsonStringify,
  __clearDeferred,
  __resolveDeferred,
  __serializeDeferred,
  __clearDataPayload,
  __resolveDataPayload,
  __serializeDataPayload
} from '@ubean/pages';
import type {
  PageObject,
  PageRenderer,
  PageAssetTags,
  PageRenderContext,
  PageHead,
  PageRenderResult
} from '@ubean/pages';
import { createHead, transformHtmlTemplate, renderSSRHead } from '@unhead/vue/server';

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

/**
 * Shared setup for both buffered and streaming renders: creates the head
 * instance, pushes static head (defineApp + locale + page), builds the Vue
 * SSR app, and returns everything the render methods need.
 */
async function prepareRender(
  options: VueRendererOptions,
  pageObj: PageObject,
  renderContext?: PageRenderContext
): Promise<{ app: App; head: ReturnType<typeof createHead>; appConfig: ResolvedAppConfig | null }> {
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

  // 2. Locale head (lang/dir + hreflang / canonical / og:locale)
  if (renderContext?.locale) {
    const routing = renderContext.routing;
    if (routing && renderContext.availableLocales?.length) {
      const tags = buildLocaleHead({
        path: pageObj.url.split('?')[0] || '/',
        locale: renderContext.locale,
        locales: renderContext.availableLocales,
        routing,
        baseUrl: renderContext.baseUrl
      });
      head.push({
        htmlAttrs: tags.htmlAttrs,
        link: tags.link as never,
        meta: tags.meta as never
      });
    } else {
      head.push({
        htmlAttrs: {
          lang: renderContext.locale,
          dir: renderContext.localeDir || 'ltr'
        }
      });
    }
  }

  // 3. Page-specific head (overrides app-level defaults)
  if (pageObj.head) {
    pushPageHead(head, pageObj.head);
  }

  const i18n = renderContext?.locale
    ? createUbeanI18n({
        locale: renderContext.locale,
        fallbackLocale: renderContext.fallbackLocale || renderContext.locale,
        messages: {
          [renderContext.locale]: (renderContext.messages || {}) as Record<string, unknown>,
          ...(renderContext.fallbackLocale &&
          renderContext.fallbackMessages &&
          renderContext.fallbackLocale !== renderContext.locale
            ? { [renderContext.fallbackLocale]: renderContext.fallbackMessages }
            : {})
        }
      })
    : undefined;

  let renderApp: App;
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
    if (i18n) app.use(i18n);
    if (appConfig) {
      await applyServerAppConfig(app, appConfig);
    }
    renderApp = app;
  } else {
    const { createUbeanSSRApp } = await import('@ubean/client/app');
    const { app: createdApp, router } = createUbeanSSRApp(pageObj, {
      routes: options.routes,
      resolveLayoutComponent: options.resolveLayoutComponent,
      defaultLayout: options.defaultLayout,
      head,
      i18n
    });
    if (appConfig) {
      await applyServerAppConfig(createdApp, appConfig);
    }
    await router.isReady();
    renderApp = createdApp;
  }

  return { app: renderApp, head, appConfig };
}

/**
 * Serialize SSR state (e.g. Pinia state) from the app instance after render.
 * Returns `undefined` when there is no state or serialization fails.
 */
async function resolveState(
  app: App,
  appConfig: ResolvedAppConfig | null
): Promise<Record<string, unknown> | undefined> {
  if (!appConfig?.serializeState) return undefined;
  try {
    const serialized = await appConfig.serializeState(app);
    if (serialized && Object.keys(serialized).length > 0) {
      return serialized;
    }
  } catch (err) {
    // 序列化失败不应阻塞渲染,记录错误后继续(产出无 state 的 HTML)
    console.error('[ubean-ssr] serializeState failed:', err);
  }
  return undefined;
}

/**
 * P9-24: Collect dynamic head tags that were added during streaming.
 *
 * During streaming SSR, the initial `<head>` is sent before the Vue app
 * renders. Any `useHead()` / `useSeoMeta()` calls inside component setup
 * push entries to the head instance *after* the initial head was sent.
 *
 * This function compares the head state before and after streaming to
 * find tags that were added dynamically, and returns them as an HTML string
 * that can be injected before the stream closes.
 *
 * This ensures SEO crawlers and social media bots see the complete metadata
 * (title, og:tags, etc.) without waiting for client hydration.
 */
function collectDynamicHeadTags(head: ReturnType<typeof createHead>, staticHeadTags: string): string {
  const fullHead = renderSSRHead(head);
  const fullTags = fullHead.headTags || '';

  if (!fullTags || fullTags === staticHeadTags) return '';

  // Split by newline and find tags that exist in full but not in static.
  // Each tag is on its own line (renderSSRHead outputs one tag per line).
  const staticLines = new Set(
    staticHeadTags
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  );
  const dynamicLines = fullTags
    .split('\n')
    .map(l => l.trim())
    .filter(l => Boolean(l) && !staticLines.has(l));

  if (dynamicLines.length === 0) return '';

  return dynamicLines.join('\n');
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  const render: PageRenderer['render'] = async (
    pageObj: PageObject,
    shellHtml: string,
    _assetTags: PageAssetTags,
    renderContext?: PageRenderContext
  ): Promise<PageRenderResult> => {
    __clearDeferred();
    __clearDataPayload();
    const { app, head, appConfig } = await prepareRender(options, pageObj, renderContext);
    const appHtml = await renderToString(app);

    // SSR 状态序列化:在 renderToString 完成后,从 app 实例提取状态
    // (如 Pinia 的 pinia.state.value)。返回的 state 会被 renderPage
    // 注入到 HTML 的 __UBEAN_STATE__ script 标签中。
    const state = await resolveState(app, appConfig);

    // 解析 deferred promises(useDeferredData 注册的非关键数据)
    const deferredData = await __resolveDeferred();
    const deferredScript = __serializeDeferred(deferredData);

    // 解析 useData payload(关键数据,SSR 已解析,客户端水合避免二次请求)
    const dataPayload = __resolveDataPayload();
    const dataScript = __serializeDataPayload(dataPayload);

    if (!shellHtml) {
      // 无 shell 时,直接拼接 HTML + data script + deferred script
      const tail = (dataScript ? dataScript : '') + (deferredScript ? deferredScript : '');
      return tail ? appHtml + tail : appHtml;
    }

    const htmlWithApp = shellHtml.replace(SSR_CONTENT_MARKER, appHtml);
    let html = transformHtmlTemplate(head, htmlWithApp);

    // 注入 data + deferred script(在 app div 之后,STATE_DATA_ID 之前)
    // 顺序: data payload → deferred → state (data 是关键数据,最先可用)
    const preStateScripts = (dataScript ? `${dataScript}\n  ` : '') + (deferredScript ? `${deferredScript}\n  ` : '');
    if (preStateScripts) {
      html = html.replace(new RegExp(`(<script id="${STATE_DATA_ID}")`), `${preStateScripts}$1`);
    }

    // 有 state 时返回 { html, state },由 renderPage 注入到 __UBEAN_STATE__
    if (state) {
      return { html, state };
    }
    return html;
  };

  /**
   * Streaming SSR: 返回一个 ReadableStream<Uint8Array>,将 HTML 文档分块流式输出。
   *
   * 与 `render` 的关键差异:
   * - 使用 Vue 的 `renderToStream` 替代 `renderToString`,app HTML 边渲染边输出
   * - 静态 head(defineApp + definePage)在流式开始前注入 `<head>`
   * - SSR state(Pinia 等)在 app 流结束后、tail 之前注入为 `<script>`(移到 app div 之后,
   *   因为 state 只有渲染完成后才可用;客户端通过 getElementById 读取,位置无关)
   * - P9-24: 动态 `useHead()`(组件 setup 内)在 app 流结束后收集,作为 late head tags
   *   注入到 tail 之前。浏览器会将 `<meta>`/`<title>`/`<link>` 标签自动移入 `<head>`,
   *   确保 SEO 爬虫和社交机器人看到完整 metadata,无需等待客户端水合。
   */
  const renderToStreamFn: PageRenderer['renderToStream'] = (
    pageObj: PageObject,
    shellHtml: string,
    _assetTags: PageAssetTags,
    renderContext?: PageRenderContext
  ): ReadableStream<Uint8Array> => {
    const encoder = new TextEncoder();

    // Vue 的 `renderToNodeStream` 返回 Node.js `Readable`,通过 async iteration
    // 逐块读取并编码为 Uint8Array 后转发到 web ReadableStream。
    // 兼容 Node(Buffer/string chunk)与未来 web stream 实现。
    async function pumpVueStream(
      vueStream: ReturnType<typeof renderToNodeStream>,
      controller: ReadableStreamDefaultController<Uint8Array>
    ): Promise<void> {
      for await (const chunk of vueStream as AsyncIterable<unknown>) {
        const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk as ArrayBufferView);
        controller.enqueue(encoder.encode(text));
      }
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          __clearDeferred();
          __clearDataPayload();
          const { app, head, appConfig } = await prepareRender(options, pageObj, renderContext);

          // 无 shell:直接流式 app HTML
          if (!shellHtml) {
            const appStream = renderToNodeStream(app);
            await pumpVueStream(appStream, controller);
            // 即使无 shell,也解析并输出 data + deferred 数据
            const dataPayload = __resolveDataPayload();
            const dataScript = __serializeDataPayload(dataPayload);
            if (dataScript) controller.enqueue(encoder.encode(dataScript));
            const deferredData = await __resolveDeferred();
            const deferredScript = __serializeDeferred(deferredData);
            if (deferredScript) controller.enqueue(encoder.encode(deferredScript));
            controller.close();
            return;
          }

          // 有 shell:在 SSR_CONTENT_MARKER 处拆分
          const markerIdx = shellHtml.indexOf(SSR_CONTENT_MARKER);
          if (markerIdx === -1) {
            // 无标记,回退为:流式 app HTML + 尾部(无法注入,直接拼接)
            const appStream = renderToNodeStream(app);
            await pumpVueStream(appStream, controller);
            const dataPayload = __resolveDataPayload();
            const dataScript = __serializeDataPayload(dataPayload);
            if (dataScript) controller.enqueue(encoder.encode(dataScript));
            const deferredData = await __resolveDeferred();
            const deferredScript = __serializeDeferred(deferredData);
            if (deferredScript) controller.enqueue(encoder.encode(deferredScript));
            controller.close();
            return;
          }

          let headPart = shellHtml.slice(0, markerIdx);
          const tailPart = shellHtml.slice(markerIdx + SSR_CONTENT_MARKER.length);

          // 流式模式下,state script 移到 tail(app div 之后),因为 state
          // 只有渲染完成后才可用。从 headPart 移除占位 state script。
          const stateScriptRegex = new RegExp(
            `<script id="${STATE_DATA_ID}" type="application/json">${STATE_MARKER}</script>`
          );
          headPart = headPart.replace(stateScriptRegex, '');

          // 用静态 head 转换 headPart(注入 title/meta/htmlAttrs/bodyAttrs)
          headPart = transformHtmlTemplate(head, headPart);

          // P9-24: Snapshot the static head tags before streaming.
          // After the Vue app streams, we'll collect dynamic head entries
          // (from component `useHead()`) and inject them before the tail.
          const staticHeadTags = renderSSRHead(head).headTags || '';

          // 1. 立即输出 head 部分(doctype + head + body 开头 + page data scripts)
          //    浏览器可提前加载 CSS/JS,显著改善 TTFB/LCP
          controller.enqueue(encoder.encode(headPart));

          // 2. 流式输出 Vue app HTML
          const appStream = renderToNodeStream(app);
          await pumpVueStream(appStream, controller);

          // P9-24: Collect dynamic head tags added during streaming
          // (e.g. useHead/useSeoMeta calls in component setup).
          // These are injected before the tail so SEO crawlers see them
          // without waiting for client hydration.
          const dynamicHeadTags = collectDynamicHeadTags(head, staticHeadTags);

          // 解析 useData payload(关键数据,SSR 已解析,客户端水合避免二次请求)
          // 在 Vue 流之后、deferred + state script 之前注入
          const dataPayload = __resolveDataPayload();
          const dataScript = __serializeDataPayload(dataPayload);

          // 解析 deferred promises(useDeferredData 注册的非关键数据)
          // 在 Vue 流之后、state script 之前注入,客户端水合时立即可用
          const deferredData = await __resolveDeferred();
          const deferredScript = __serializeDeferred(deferredData);

          // 3. 渲染完成后,序列化 state 并注入为 script(state 在 app div 之后)
          const state = await resolveState(app, appConfig);
          const stateScript = `<script id="${STATE_DATA_ID}" type="application/json">${
            state ? safeJsonStringify(state) : ''
          }</script>`;

          // 4. 输出 dynamic head tags + data script + deferred script + state script + tail 部分
          //    顺序: data(关键) → deferred(非关键) → state(用户状态)
          //    浏览器会将 <meta>/<title>/<link> 标签自动移入 <head>
          const tailContent =
            (dynamicHeadTags ? `${dynamicHeadTags}\n` : '') +
            (dataScript ? `${dataScript}\n  ` : '') +
            (deferredScript ? `${deferredScript}\n  ` : '') +
            stateScript +
            tailPart;
          controller.enqueue(encoder.encode(tailContent));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
  };

  return {
    render,
    renderToStream: renderToStreamFn,
    preambleScript: getIslandsBootstrapScript()
  };
}

export { renderToString } from '@vue/server-renderer';
