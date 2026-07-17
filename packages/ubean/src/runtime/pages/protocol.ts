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

  return `<!doctype html>
<html>
<head>
    ${css}${preloads}
</head>
<body>
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

  const htmlAttrs: Record<string, string> = {};
  if (locale) {
    htmlAttrs.lang = locale;
    htmlAttrs.dir = localeDir;
  }
  const finalHtmlAttrs = Object.entries(htmlAttrs)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ');

  return `<!doctype html>
<html${finalHtmlAttrs ? ` ${finalHtmlAttrs}` : ''}>
<head>
    ${preambleScript}${css}${preloads}
</head>
<body>
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
