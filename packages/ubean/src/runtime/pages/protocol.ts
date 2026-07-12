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

export type PageRenderFn = (
  pageObj: PageObject,
  shellHtml: string,
  assetTags: PageAssetTags
) => string | Promise<string>;

export interface PageRenderer {
  render: PageRenderFn;
  preambleScript?: string;
}

export const PAGE_DATA_ID = '__UBEAN_PAGE_DATA__';
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

function renderHeadTags(head?: PageHead): { htmlAttrs: string; bodyAttrs: string; headHtml: string } {
  if (!head) return { htmlAttrs: '', bodyAttrs: '', headHtml: '' };

  const htmlAttrs = head.htmlAttrs
    ? Object.entries(head.htmlAttrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ')
    : '';

  const bodyAttrs = head.bodyAttrs
    ? Object.entries(head.bodyAttrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ')
    : '';

  const parts: string[] = [];

  if (head.title) {
    parts.push(`<title>${escapeHtml(head.title)}</title>`);
  }

  if (head.meta) {
    for (const m of head.meta) {
      const attrs = Object.entries(m)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      parts.push(`<meta ${attrs}>`);
    }
  }

  if (head.link) {
    for (const l of head.link) {
      const attrs = Object.entries(l)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      parts.push(`<link ${attrs}>`);
    }
  }

  if (head.script) {
    for (const s of head.script) {
      const attrs = Object.entries(s)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      parts.push(`<script ${attrs}></script>`);
    }
  }

  return { htmlAttrs, bodyAttrs, headHtml: parts.join('\n    ') };
}

function escapeHtml(str: string): string {
  return str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function escapeAttr(str: string): string {
  return str.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function buildPageShell(
  pageObj: PageObject,
  assetTags: PageAssetTags,
  preambleScript = '',
  appId = 'app'
): string {
  const pageData = serializePageData(pageObj);
  const { htmlAttrs, bodyAttrs, headHtml } = renderHeadTags(pageObj.head);
  const css = assetTags.css ?? '';
  const preloads = assetTags.preloads ?? '';
  const bodyTags = assetTags.body ?? '';

  return `<!doctype html>
<html${htmlAttrs ? ` ${htmlAttrs}` : ''}>
<head>
    ${headHtml}${css}${preloads}
</head>
<body${bodyAttrs ? ` ${bodyAttrs}` : ''}>
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
  appId = 'app'
): string {
  const pageData = serializePageData(pageObj);
  const { htmlAttrs, bodyAttrs, headHtml } = renderHeadTags(pageObj.head);
  const css = assetTags.css ?? '';
  const preloads = assetTags.preloads ?? '';
  const bodyTags = assetTags.body ?? '';

  return `<!doctype html>
<html${htmlAttrs ? ` ${htmlAttrs}` : ''}>
<head>
    ${headHtml}${preambleScript}${css}${preloads}
</head>
<body${bodyAttrs ? ` ${bodyAttrs}` : ''}>
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
  appId = 'app'
): Promise<string> {
  if (!renderer) {
    return buildClientOnlyShell(pageObj, assetTags, '', appId);
  }

  const preambleScript = renderer.preambleScript ?? '';
  const shell = buildPageShell(pageObj, assetTags, preambleScript, appId);
  const appHtml = await renderer.render(pageObj, shell, assetTags);
  if (typeof appHtml === 'string' && !shell.includes(appHtml) && !appHtml.includes('<html')) {
    return insertSsrContent(shell, appHtml);
  }
  return appHtml;
}
