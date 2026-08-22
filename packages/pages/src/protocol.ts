import type { PageHead } from '@ubean/shared';

export type { PageHead };

export interface PageObject<Props = Record<string, unknown>> {
  component: string;
  props: Props;
  params: Record<string, string>;
  url: string;
  layout?: string | false;
  errors?: Record<string, string> | null;
  head?: PageHead;
}

export interface PageAssetTags {
  css?: string;
  preloads?: string;
  body?: string;
  /** Favicon HREF (如 `/favicon.ico`),自动注入 `<link rel="icon">` 到 `<head>` */
  favicon?: string;
}

export interface LocaleMetaInfo {
  code: string;
  name?: string;
  dir: 'ltr' | 'rtl';
  isDefault?: boolean;
}

export interface PageRenderContext {
  locale?: string;
  localeDir?: 'ltr' | 'rtl';
  messages?: Record<string, unknown>;
  fallbackLocale?: string;
  fallbackMessages?: Record<string, unknown>;
  routing?: {
    defaultLocale: string;
    locales: string[];
    strategy: 'prefix' | 'prefix_except_default' | 'prefix_and_default' | 'no_prefix';
  };
  cookieName?: string;
  baseUrl?: string;
  /** All registered locales (metadata only, no messages) — sent to the
   *  client so it can register every available locale during hydration,
   *  preventing `availableLocales` hydration mismatches. */
  availableLocales?: LocaleMetaInfo[];
}

/**
 * 渲染结果。
 *
 * - `string`:仅 HTML(向后兼容,无 SSR state)
 * - `{ html, state? }`:HTML + 可选的 SSR state(由 `defineApp.serializeState` 产生,
 *   会被序列化到 `__UBEAN_STATE__` script 标签中,客户端通过 `getInitialState()` 读取)
 *
 * `state` 用于支持 Pinia / vue-query 等需要跨 SSR 边界传递状态的库。
 */
export type PageRenderResult = string | { html: string; state?: Record<string, unknown> };

export type PageRenderFn = (
  pageObj: PageObject,
  shellHtml: string,
  assetTags: PageAssetTags,
  renderContext?: PageRenderContext
) => PageRenderResult | Promise<PageRenderResult>;

/**
 * 流式渲染函数:返回一个 `ReadableStream<Uint8Array>`,将完整 HTML 文档
 * 分块流式输出(头部先发送,app HTML 边渲染边输出,state 在尾部注入)。
 *
 * 由 `@ubean/client/ssr` 的 `createVueRenderer` 实现。当 renderer 提供此方法且
 * 应用配置启用了 `streaming` 时,页面处理器会优先使用流式渲染,显著改善
 * TTFB/LCP(浏览器可在 app 渲染期间提前加载 CSS/JS)。
 */
export type PageStreamRenderFn = (
  pageObj: PageObject,
  shellHtml: string,
  assetTags: PageAssetTags,
  renderContext?: PageRenderContext
) => ReadableStream<Uint8Array>;

export interface PageRenderer {
  render: PageRenderFn;
  /** 流式渲染(可选)。提供时优先于 `render` 用于流式 SSR 响应。 */
  renderToStream?: PageStreamRenderFn;
  preambleScript?: string;
}

export const PAGE_DATA_ID = '__UBEAN_PAGE_DATA__';
export const LOCALE_DATA_ID = '__UBEAN_LOCALE__';
export const STATE_DATA_ID = '__UBEAN_STATE__';
export const PAGE_REQUEST_HEADER = 'x-ubeanpages';
export const SSR_CONTENT_MARKER = '<!--UBEAN_SSR_CONTENT-->';
/** Shell 中 state script 的占位符,render 后由 `insertStateContent` 替换为实际 JSON */
export const STATE_MARKER = '<!--UBEAN_STATE-->';

export function isPagesRequest(c: { req: { header: (k: string) => string | undefined } }): boolean {
  return c.req.header(PAGE_REQUEST_HEADER) === 'true';
}

export function safeJsonStringify(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function serializePageData(pageObj: PageObject): string {
  return safeJsonStringify(pageObj);
}

export function pageJsonResponse(pageObj: PageObject, headers: Record<string, string> = {}): Response {
  const safeJson = safeJsonStringify(pageObj);
  return new Response(safeJson, {
    headers: {
      'Content-Type': 'application/json',
      'X-UbeanPages': 'true',
      Vary: 'X-UbeanPages',
      ...headers
    }
  });
}

function escapeAttr(str: string): string {
  return str.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/**
 * 根据文件扩展名推断 favicon 的 MIME type。
 * SVG 必须显式声明 `type="image/svg+xml"`,否则部分浏览器不会渲染;
 * 其他类型浏览器可从 URL 自动推断,但显式声明更规范。
 */
function faviconMimeType(href: string): string | null {
  const ext = href.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'svg':
      return 'image/svg+xml';
    case 'ico':
      return 'image/x-icon';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

/**
 * 生成 favicon `<link>` 标签字符串。
 * 当 `favicon` 为空/未设置时返回空字符串。
 */
export function renderFaviconLink(favicon?: string): string {
  if (!favicon) return '';
  const type = faviconMimeType(favicon);
  const typeAttr = type ? ` type="${escapeAttr(type)}"` : '';
  return `<link rel="icon" href="${escapeAttr(favicon)}"${typeAttr}>`;
}

function renderHeadTags(head?: PageHead): { headTags: string; htmlAttrsStr: string; bodyAttrsStr: string } {
  if (!head) {
    return { headTags: '', htmlAttrsStr: '', bodyAttrsStr: '' };
  }

  const tags: string[] = [];

  if (head.title) {
    tags.push(`<title>${escapeAttr(head.title)}</title>`);
  }

  if (head.meta) {
    for (const meta of head.meta) {
      const attrs = Object.entries(meta)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ');
      tags.push(`<meta ${attrs}>`);
    }
  }

  if (head.link) {
    for (const link of head.link) {
      const attrs = Object.entries(link)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ');
      tags.push(`<link ${attrs}>`);
    }
  }

  if (head.script) {
    for (const script of head.script) {
      const attrs = Object.entries(script)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ');
      tags.push(`<script ${attrs}></script>`);
    }
  }

  const htmlAttrsStr = head.htmlAttrs
    ? Object.entries(head.htmlAttrs)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ')
    : '';

  const bodyAttrsStr = head.bodyAttrs
    ? Object.entries(head.bodyAttrs)
        .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
        .join(' ')
    : '';

  return { headTags: tags.join('\n    '), htmlAttrsStr, bodyAttrsStr };
}

export function buildPageShell(
  pageObj: PageObject,
  assetTags: PageAssetTags,
  preambleScript = '',
  appId = 'app',
  renderContext?: PageRenderContext
): string {
  const pageData = serializePageData(pageObj);
  const css = assetTags.css ?? '';
  const preloads = assetTags.preloads ?? '';
  const bodyTags = assetTags.body ?? '';
  const faviconLink = renderFaviconLink(assetTags.favicon);

  const locale = renderContext?.locale;
  const localeDir = renderContext?.localeDir || 'ltr';
  const messages = renderContext?.messages;
  const availableLocales = renderContext?.availableLocales;
  const localeScript = locale
    ? `<script id="${LOCALE_DATA_ID}" type="application/json">${safeJsonStringify({
        locale,
        dir: localeDir,
        ...(messages ? { messages } : {}),
        ...(renderContext?.fallbackLocale ? { fallbackLocale: renderContext.fallbackLocale } : {}),
        ...(renderContext?.fallbackMessages ? { fallbackMessages: renderContext.fallbackMessages } : {}),
        ...(renderContext?.routing ? { routing: renderContext.routing } : {}),
        ...(renderContext?.cookieName ? { cookieName: renderContext.cookieName } : {}),
        ...(renderContext?.baseUrl ? { baseUrl: renderContext.baseUrl } : {}),
        ...(availableLocales?.length ? { availableLocales } : {})
      })}</script>`
    : '';

  const { headTags, htmlAttrsStr, bodyAttrsStr } = renderHeadTags(pageObj.head);

  const localeHtmlAttrs: Record<string, string> = {};
  if (locale) {
    localeHtmlAttrs.lang = locale;
    localeHtmlAttrs.dir = localeDir;
  }
  const localeHtmlAttrsStr = Object.entries(localeHtmlAttrs)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');

  const finalHtmlAttrs = [localeHtmlAttrsStr, htmlAttrsStr].filter(Boolean).join(' ');
  const finalBodyAttrs = bodyAttrsStr;

  return `<!doctype html>
<html${finalHtmlAttrs ? ` ${finalHtmlAttrs}` : ''}>
<head>
    ${faviconLink ? `${faviconLink}\n    ` : ''}${headTags ? `${headTags}\n    ` : ''}${css}${preloads}
</head>
<body${finalBodyAttrs ? ` ${finalBodyAttrs}` : ''}>
  ${localeScript}
  <script id="${PAGE_DATA_ID}" type="application/json">${pageData}</script>
  <script id="${STATE_DATA_ID}" type="application/json">${STATE_MARKER}</script>
  <div id="${appId}">${SSR_CONTENT_MARKER}</div>
  ${preambleScript}
  ${bodyTags}
</body>
</html>`;
}

export function insertSsrContent(shell: string, appHtml: string): string {
  return shell.replace(SSR_CONTENT_MARKER, appHtml);
}

/**
 * 将序列化后的 state JSON 注入 shell 中的 `__UBEAN_STATE__` script 标签。
 *
 * 在 `renderPage` 中于 `renderer.render()` 之后调用:renderer 返回 `{ html, state }`
 * 时,把 `state` 用 `safeJsonStringify` 转义后替换 `STATE_MARKER` 占位符。
 *
 * 若 `stateJson` 为空字符串或 `null`,将占位符替换为空字符串(产出空 script 体,
 * 客户端 `getInitialState()` 会返回 `null`)。
 */
export function insertStateContent(shell: string, stateJson: string | null): string {
  return shell.replace(STATE_MARKER, stateJson ?? '');
}

export function buildClientOnlyShell(
  pageObj: PageObject,
  assetTags: PageAssetTags,
  preambleScript = '',
  appId = 'app',
  renderContext?: PageRenderContext
): string {
  const pageData = serializePageData(pageObj);
  const css = assetTags.css ?? '';
  const preloads = assetTags.preloads ?? '';
  const bodyTags = assetTags.body ?? '';
  const faviconLink = renderFaviconLink(assetTags.favicon);

  const locale = renderContext?.locale;
  const localeDir = renderContext?.localeDir || 'ltr';
  const messages = renderContext?.messages;
  const availableLocales = renderContext?.availableLocales;
  const localeScript = locale
    ? `<script id="${LOCALE_DATA_ID}" type="application/json">${safeJsonStringify({
        locale,
        dir: localeDir,
        ...(messages ? { messages } : {}),
        ...(renderContext?.fallbackLocale ? { fallbackLocale: renderContext.fallbackLocale } : {}),
        ...(renderContext?.fallbackMessages ? { fallbackMessages: renderContext.fallbackMessages } : {}),
        ...(renderContext?.routing ? { routing: renderContext.routing } : {}),
        ...(renderContext?.cookieName ? { cookieName: renderContext.cookieName } : {}),
        ...(renderContext?.baseUrl ? { baseUrl: renderContext.baseUrl } : {}),
        ...(availableLocales?.length ? { availableLocales } : {})
      })}</script>`
    : '';

  const { headTags, htmlAttrsStr: pageHtmlAttrsStr, bodyAttrsStr } = renderHeadTags(pageObj.head);

  const htmlAttrs: Record<string, string> = {};
  if (locale) {
    htmlAttrs.lang = locale;
    htmlAttrs.dir = localeDir;
  }
  const localeHtmlAttrsStr = Object.entries(htmlAttrs)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');

  const finalHtmlAttrs = [localeHtmlAttrsStr, pageHtmlAttrsStr].filter(Boolean).join(' ');
  const finalBodyAttrs = bodyAttrsStr;

  return `<!doctype html>
<html${finalHtmlAttrs ? ` ${finalHtmlAttrs}` : ''}>
<head>
    ${faviconLink ? `${faviconLink}\n    ` : ''}${headTags ? `${headTags}\n    ` : ''}${preambleScript}${css}${preloads}
</head>
<body${finalBodyAttrs ? ` ${finalBodyAttrs}` : ''}>
  ${localeScript}
  <script id="${PAGE_DATA_ID}" type="application/json">${pageData}</script>
  <script id="${STATE_DATA_ID}" type="application/json"></script>
  <div id="${appId}" data-ubean-ssr="false"></div>
  ${bodyTags}
</body>
</html>`;
}

export async function renderPage(
  pageObj: PageObject,
  assetTags: PageAssetTags,
  renderer: PageRenderer | null,
  appId = 'app',
  renderContext?: PageRenderContext
): Promise<string> {
  if (!renderer) {
    return buildClientOnlyShell(pageObj, assetTags, '', appId, renderContext);
  }

  const preambleScript = renderer.preambleScript ?? '';
  const shell = buildPageShell(pageObj, assetTags, preambleScript, appId, renderContext);
  const result = await renderer.render(pageObj, shell, assetTags, renderContext);

  // 向后兼容:renderer 返回纯字符串时,直接作为完整 HTML 返回
  if (typeof result === 'string') {
    if (!shell.includes(result) && !result.includes('<html')) {
      return insertSsrContent(shell, result);
    }
    return result;
  }

  // 新增:renderer 返回 { html, state? } 时,注入 state 到 shell
  const { html, state } = result;
  let finalHtml = html;
  if (!shell.includes(html) && !html.includes('<html')) {
    finalHtml = insertSsrContent(shell, html);
  }
  if (state && Object.keys(state).length > 0) {
    finalHtml = insertStateContent(finalHtml, safeJsonStringify(state));
  } else {
    // 无 state:清空占位符(产出空 script 体)
    finalHtml = insertStateContent(finalHtml, '');
  }
  return finalHtml;
}

/**
 * 流式渲染页面:当 renderer 提供 `renderToStream` 时,返回一个
 * `ReadableStream<Uint8Array>`,将完整 HTML 文档分块流式输出。
 *
 * 当 renderer 不支持流式(无 `renderToStream`)时,回退到缓冲式 `renderPage`,
 * 返回一个包含完整 HTML 的单块流(保持调用方接口一致)。
 *
 * 调用方应使用 `c.body(stream, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })`
 * 将流作为 HTTP 响应返回。
 */
export function renderPageToStream(
  pageObj: PageObject,
  assetTags: PageAssetTags,
  renderer: PageRenderer | null,
  appId = 'app',
  renderContext?: PageRenderContext
): ReadableStream<Uint8Array> {
  // 无 renderer 或 renderer 不支持流式:回退到缓冲渲染,包装为单块流
  if (!renderer || !renderer.renderToStream) {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const html = await renderPage(pageObj, assetTags, renderer, appId, renderContext);
        controller.enqueue(encoder.encode(html));
        controller.close();
      }
    });
  }

  const preambleScript = renderer.preambleScript ?? '';
  const shell = buildPageShell(pageObj, assetTags, preambleScript, appId, renderContext);
  return renderer.renderToStream(pageObj, shell, assetTags, renderContext);
}
