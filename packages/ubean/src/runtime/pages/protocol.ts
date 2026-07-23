export interface PageHead {
  title?: string;
  meta?: Array<Record<string, string>>;
  link?: Array<Record<string, string>>;
  script?: Array<Record<string, string>>;
  htmlAttrs?: Record<string, string>;
  bodyAttrs?: Record<string, string>;
}

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
  /** All registered locales (metadata only, no messages) — sent to the
   *  client so it can register every available locale during hydration,
   *  preventing `availableLocales` hydration mismatches. */
  availableLocales?: LocaleMetaInfo[];
}

export type PageRenderFn = (
  pageObj: PageObject,
  shellHtml: string,
  assetTags: PageAssetTags,
  renderContext?: PageRenderContext
) => string | Promise<string>;

export interface PageRenderer {
  render: PageRenderFn;
  preambleScript?: string;
}

export const PAGE_DATA_ID = '__UBEAN_PAGE_DATA__';
export const LOCALE_DATA_ID = '__UBEAN_LOCALE__';
export const PAGE_REQUEST_HEADER = 'x-ubeanpages';
export const SSR_CONTENT_MARKER = '<!--UBEAN_SSR_CONTENT-->';

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

  const locale = renderContext?.locale;
  const localeDir = renderContext?.localeDir || 'ltr';
  const messages = renderContext?.messages;
  const availableLocales = renderContext?.availableLocales;
  const localeScript = locale
    ? `<script id="${LOCALE_DATA_ID}" type="application/json">${safeJsonStringify({ locale, dir: localeDir, ...(messages ? { messages } : {}), ...(availableLocales?.length ? { availableLocales } : {}) })}</script>`
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
    ${headTags ? `${headTags}\n    ` : ''}${css}${preloads}
</head>
<body${finalBodyAttrs ? ` ${finalBodyAttrs}` : ''}>
  ${localeScript}
  <script id="${PAGE_DATA_ID}" type="application/json">${pageData}</script>
  <div id="${appId}">${SSR_CONTENT_MARKER}</div>
  ${preambleScript}
  ${bodyTags}
</body>
</html>`;
}

export function insertSsrContent(shell: string, appHtml: string): string {
  return shell.replace(SSR_CONTENT_MARKER, appHtml);
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

  const locale = renderContext?.locale;
  const localeDir = renderContext?.localeDir || 'ltr';
  const messages = renderContext?.messages;
  const availableLocales = renderContext?.availableLocales;
  const localeScript = locale
    ? `<script id="${LOCALE_DATA_ID}" type="application/json">${safeJsonStringify({ locale, dir: localeDir, ...(messages ? { messages } : {}), ...(availableLocales?.length ? { availableLocales } : {}) })}</script>`
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
    ${headTags ? `${headTags}\n    ` : ''}${preambleScript}${css}${preloads}
</head>
<body${finalBodyAttrs ? ` ${finalBodyAttrs}` : ''}>
  ${localeScript}
  <script id="${PAGE_DATA_ID}" type="application/json">${pageData}</script>
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
  const appHtml = await renderer.render(pageObj, shell, assetTags, renderContext);
  if (typeof appHtml === 'string' && !shell.includes(appHtml) && !appHtml.includes('<html')) {
    return insertSsrContent(shell, appHtml);
  }
  return appHtml;
}
