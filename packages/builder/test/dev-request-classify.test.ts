/**
 * dev 请求判据（RM-V10）。
 *
 * `isViteResourceRequest()` 决定一个请求归 Vite 还是归 ubean，是 RM-V10 最容易出错的一环：
 * 判错了就会有「页面 HTML 被当 JS 送给模块图」或「源码模块被当成页面 SSR」这类灾难性表现。
 * 因此这里把判据逐条钉住，覆盖两个方向 —— 既要有该归 Vite 的正例，也要有**不得**误判的负例。
 *
 * 端到端的表现（真 Vite server + 真中间件顺序）在 `dev-request-router.integration.test.ts`。
 */
import { describe, expect, it } from 'vitest';
import { injectStylesheetLinks, isFrameworkHtmlPage, isViteResourceRequest } from '@ubean/build/vite';

/** Node 的请求头形状（大小写不敏感由 Node 保证，这里直接用规范的小写键）。 */
type Headers = Record<string, string | string[] | undefined>;

const NAVIGATION: Headers = { 'sec-fetch-dest': 'document', accept: 'text/html,application/xhtml+xml' };
/** curl 这类客户端不发 `Sec-Fetch-*`，只给Accept 通配。 */
const RAW_HTTP: Headers = { accept: '*/*' };
const SCRIPT: Headers = { 'sec-fetch-dest': 'script', accept: '*/*' };
const IMAGE: Headers = { 'sec-fetch-dest': 'image', accept: 'image/avif,image/webp,*/*' };
const FETCH_JSON: Headers = { 'sec-fetch-dest': 'empty', accept: '*/*' };

describe('isViteResourceRequest：归 Vite 的请求', () => {
  it.each([
    ['/@vite/client', SCRIPT],
    ['/@vite/env', SCRIPT],
    ['/@id/__x00__virtual:ubean-pages', SCRIPT],
    ['/@id/__x00__/__uno.css', { 'sec-fetch-dest': 'style' }],
    ['/@fs/Users/x/project/src/main.ts', SCRIPT],
    ['/node_modules/.vite/deps/vue.js', SCRIPT],
    ['/__vite_ping', { accept: 'text/x-vite-ping' }]
  ])('%s（内部前缀）', (url, headers) => {
    expect(isViteResourceRequest(url as string, headers as Headers)).toBe(true);
  });

  it.each([
    '/src/main.ts?import',
    '/src/pages/index.vue?vue&type=script',
    '/src/style.css?direct',
    '/logo.svg?import&raw'
  ])('%s（模块查询标记）', url => {
    expect(isViteResourceRequest(url, RAW_HTTP)).toBe(true);
  });

  it.each([
    ['/src/pages/index.vue', SCRIPT],
    ['/src/style.css', { 'sec-fetch-dest': 'style' }],
    ['/favicon.svg', IMAGE],
    ['/fonts/inter.woff2', { 'sec-fetch-dest': 'font' }],
    ['/logo.png', RAW_HTTP]
  ])('%s（资源类型 / 扩展名）', (url, headers) => {
    expect(isViteResourceRequest(url as string, headers as Headers)).toBe(true);
  });

  it('SFC 组件的子请求（?vue&type=style）走 Vite', () => {
    expect(isViteResourceRequest('/src/pages/about.vue?vue&type=style&index=0', RAW_HTTP)).toBe(true);
  });
});

describe('isViteResourceRequest：归 ubean 的请求', () => {
  it.each(['/', '/about', '/blog/hello-world', '/dashboard/settings', '/zh/about', '/(marketing)/marketing-page'])(
    '%s（页面导航）',
    url => {
      expect(isViteResourceRequest(url, NAVIGATION)).toBe(false);
    }
  );

  it.each(['/', '/about', '/definitely-missing-page'])('%s（curl 这类无 Sec-Fetch 的导航）', url => {
    expect(isViteResourceRequest(url, RAW_HTTP)).toBe(false);
  });

  it.each(['/api/hello', '/api/users/1', '/api/definitely-missing'])('%s（显式 API 路由）', url => {
    expect(isViteResourceRequest(url, FETCH_JSON)).toBe(false);
  });

  it.each(['/_health', '/_openapi.json', '/_scalar', '/_iconify/foo', '/__actions', '/__server-component'])(
    '%s（保留命名空间先于扩展名规则）',
    url => {
      expect(isViteResourceRequest(url, RAW_HTTP)).toBe(false);
    }
  );

  it('/_openapi.json 不会被当成 .json 静态资源', () => {
    // 这就是保留前缀规则必须排在扩展名规则之前的原因
    expect(isViteResourceRequest('/_openapi.json', { accept: 'application/json' })).toBe(false);
    // 对照组：非保留路径的 .json 归 Vite
    expect(isViteResourceRequest('/data/items.json', FETCH_JSON)).toBe(true);
  });

  it('带查询串的页面 URL 仍是页面', () => {
    expect(isViteResourceRequest('/search?q=ubean', NAVIGATION)).toBe(false);
    expect(isViteResourceRequest('/search?q=a&page=2', RAW_HTTP)).toBe(false);
  });

  it('带 hash 的页面 URL 仍是页面', () => {
    expect(isViteResourceRequest('/docs#install', NAVIGATION)).toBe(false);
  });

  it('带点的页面路径不因扩展名误判（非资源后缀）', () => {
    // `/release-1.2` 不是已知资源后缀 → 页面
    expect(isViteResourceRequest('/release-1.2', NAVIGATION)).toBe(false);
  });
});

describe('injectStylesheetLinks', () => {
  it('在 </head> 前插入链接', () => {
    const html = '<html><head><title>t</title></head><body></body></html>';
    expect(injectStylesheetLinks(html, ['/src/style.css?direct'])).toContain(
      '<link rel="stylesheet" href="/src/style.css?direct"></head>'
    );
  });

  it('没有链接或没有 head 时原样返回', () => {
    const html = '<html><head></head></html>';
    expect(injectStylesheetLinks(html, [])).toBe(html);
    expect(injectStylesheetLinks('<div></div>', ['/a.css'])).toBe('<div></div>');
  });
});

/**
 * 框架内置的 HTML 页面（不是应用页面）：注入应用的客户端入口会让 Vue 在缺 `#app` 的文档里报错，
 * 且 Vite 的 HTML transform 会把页面内联脚本改写成 html-proxy 模块（`/_scalar` 实测整页崩）。
 */
describe('isFrameworkHtmlPage', () => {
  it.each(['/_scalar', '/_scalar?x=1', '/_devtools/index.html', '/_devtools'])('%s 是框架内置页面', url => {
    expect(isFrameworkHtmlPage(url)).toBe(true);
  });

  it.each(['/', '/about', '/zh/about', '/api/hello', '/_openapi.json', '/_scalarx'])('%s 不是框架内置页面', url => {
    expect(isFrameworkHtmlPage(url)).toBe(false);
  });
});
