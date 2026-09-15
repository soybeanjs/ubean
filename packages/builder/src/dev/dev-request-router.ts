/**
 * dev 请求路由（RM-V10，docs/vite-plugin-migration.md Phase 1）。
 *
 * 目标形态：Vite 持有 HTTP server，框架只以 `configureServer` 的两个中间件参与请求分发，
 * `vite dev` 与 `ubean dev` 走同一条路径（对齐 `nitro` 的 `dev.ts`）。
 *
 * 位置由 Vite 自己决定（见 vite-plus 的 dev middleware 装配顺序）：
 * 1. `configureServer` 钩子体内 `use()` 的中间件 —— 排在 `transformMiddleware` **之前**；
 * 2. 钩子返回的函数 —— 排在 `serveStaticMiddleware` 之后、`indexHtmlMiddleware` 之前。
 *
 * 于是：
 * - **pre** 负责「哪些请求属于 ubean」。属于 ubean 的直接接管，不属于的原样 `next()` 交给
 *   Vite 的转换/静态中间件；
 * - **post** 兜底：Vite 处理不了的（不存在的静态文件、没有匹配模块的 URL）仍交给 ubean，
 *   保证任何请求都有确定的归属，而不会掉进 404 黑洞。
 *
 * 难点在于「区分」而不是「路由」：页面 catch-all `/**` 与显式 API 路由都归 ubean，因此
 * 判据不是路径前缀，而是**这个请求是不是 Vite 的资源请求**（脚本/样式/字体/图片、`/@id/`
 * 之类的内部前缀、带 `?import` 等模块查询）。判错了两个方向的后果不对称：
 * - 资源请求误判给 ubean → 模块图直接崩（页面 HTML 被当成 JS，dev 全废）；
 * - 页面/API 误判给 Vite → Vite 找不到文件会 `next()`，由 **post** 兜底回 ubean，只是多一次判空。
 *
 * 因此启发式宁愿错在「先给 Vite」，配合 post 兜底保证最终一致。唯一会真正丢失请求的情形是
 * `publicDir` 里存在与页面/API 同名的文件（此时静态文件胜出）——这与生产环境的静态优先一致。
 *
 * 另注：请求进入 ubean 后返回的 HTML 需要 `transformIndexHtml` 注入客户端入口；CSS 链接注入
 * （FOUC 修复）与 Node↔Web 适配原先散落在 CLI dev server 内，RM-V10 一并迁到这里。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { loadUbeanConfig } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import type { PageRenderer } from '@ubean/pages';
import { bootstrapDevApp } from './dev-app';
import type { DevAppBootstrap } from './dev-app';
import type { DevRendererOptions } from './dev-host-app';
import { onDevScan } from './dev-scan';
import { sendWebResponse, toWebRequest } from './node-web';

/**
 * Vite 内部的 URL 前缀。这些路径与文件系统无关，交回 Vite 才能正确解析。
 *
 * `/@vite/` 客户端与 HMR 运行时；`/@id/` 虚拟模块；`/@fs/` 工作区外的绝对路径；
 * `/node_modules/` 依赖；`/__vite_ping` 心跳（`Accept: text/x-vite-ping`）。
 */
const VITE_URL_PREFIXES = ['/@vite/', '/@id/', '/@fs/', '/node_modules/', '/__vite_ping'];

/**
 * ubean 保留命名空间：`_` 前缀是内置路由（`/_health`、`/_openapi.json`、`/_scalar`、
 * `/_devtools`、`/_iconify`），`__` 前缀是运行时端点（`/__actions`、`/__server-component`），
 * `/api/` 是约定俗成的 API 前缀。这些必须归 ubean —— 注意 `_` 规则要先于静态扩展名规则，
 * 否则 `/_openapi.json` 会被当成 `.json` 静态资源。
 */
const RESERVED_APP_PREFIXES = ['/_', '/__', '/api/'];

/** 「取模块而不是取页面」的查询标记：Vite 的 import-analysis 会在这些请求上加它们。 */
const MODULE_QUERY_FLAGS = new Set(['import', 'raw', 'url', 'inline', 'direct', 'worker', 'vue', 'html-proxy']);

/**
 * `Sec-Fetch-Dest` 中表示「资源」的取值（非文档）。导航请求是 `document`，
 * `fetch()`/XHR 是 `empty` —— 后者既可能是 API 调用也可能是资源请求，因此不能作为判据，
 * 交给扩展名规则。
 */
const RESOURCE_DESTS = new Set([
  'audio',
  'embed',
  'font',
  'image',
  'manifest',
  'object',
  'paintworklet',
  'script',
  'serviceworker',
  'sharedworker',
  'style',
  'track',
  'video',
  'worker',
  'xslt'
]);

/**
 * 会被 Vite 当资源处理的扩展名。刻意保守：只列真实静态资源与可编译模块后缀，
 * `.txt` / `.xml` 这类「既可能是静态文件也可能是应用约定路由」（`robots.txt`、`sitemap.xml`）
 * 也列进来 —— 没有对应静态文件时 Vite 会 `next()`，由 post 兜底回到应用，行为仍然正确。
 */
const ASSET_EXTENSIONS = new Set([
  'avif',
  'br',
  'bmp',
  'cjs',
  'css',
  'csv',
  'eot',
  'gif',
  'gz',
  'ico',
  'jpeg',
  'jpg',
  'js',
  'json',
  'map',
  'mjs',
  'md',
  'mdx',
  'mp3',
  'mp4',
  'ogg',
  'otf',
  'pdf',
  'png',
  'scss',
  'sass',
  'less',
  'styl',
  'svg',
  'ts',
  'tsx',
  'ttf',
  'txt',
  'vue',
  'wasm',
  'wav',
  'webm',
  'webmanifest',
  'webp',
  'woff',
  'woff2',
  'xml',
  'zip'
]);

/** `header` 可能是数组（Node 对重复头部的表示）。 */
function headerValue(headers: IncomingMessage['headers'], name: string): string {
  const value = headers[name];
  if (!value) return '';
  return (Array.isArray(value) ? value[0] : value).toLowerCase();
}

function hasModuleQuery(search: string): boolean {
  if (!search) return false;
  // 去掉前导 `?`，按 `&` 切分，取每个键的 `=` 之前部分
  for (const part of search.slice(1).split('&')) {
    const key = part.split('=')[0];
    if (MODULE_QUERY_FLAGS.has(key)) return true;
  }
  return false;
}

function hasAssetExtension(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0 || dot === lastSegment.length - 1) return false;
  return ASSET_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}

/**
 * 这个请求是不是「Vite 的资源请求」？`true` → 交给 Vite；`false` → 归 ubean。
 *
 * 纯函数（只读 URL 与请求头），便于单测钉住判据 —— 这是 RM-V10 最容易出错的部分。
 */
export function isViteResourceRequest(url: string, headers: IncomingMessage['headers'] = {}): boolean {
  const [rawPath, search = ''] = url.split('#')[0].split(/(?=\?)/);
  const pathname = decodeURIComponent(rawPath || '/');

  // 1. Vite 内部前缀：与文件系统无关，必须交回 Vite
  if (VITE_URL_PREFIXES.some(prefix => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) {
    return true;
  }

  // 2. 模块查询（`?import` / `?vue` / `?raw`…）：只可能来自 Vite 的 import 重写
  if (hasModuleQuery(search)) return true;

  // 3. ubean 保留命名空间（先于扩展名规则，`/_openapi.json` 不能被当成静态资源）
  if (RESERVED_APP_PREFIXES.some(prefix => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) {
    return false;
  }

  // 4. 浏览器明确声明这是资源（`<script>`/`<link>`/`<img>`…）
  const dest = headerValue(headers, 'sec-fetch-dest');
  if (dest === 'document') return false;
  if (RESOURCE_DESTS.has(dest)) return true;

  // 5. 扩展名启发式
  if (hasAssetExtension(pathname)) return true;

  // 6. 无扩展名且不是资源 → 页面/API/内置路由，归 ubean
  return false;
}

const VALID_ID_PREFIX = '/@id/';
const NULL_BYTE_PLACEHOLDER = '__x00__';

/**
 * 虚拟模块 id 在模块图里带原始 `\0` 标记（如 UnoCSS 的 `\0/__uno.css`），而 NUL 是非法 HTML
 * 字符（parse5 报 `unexpected-null-character`）。这里镜像 Vite 自己的 `wrapId` 编码。
 */
function toDevCssHref(url: string): string {
  return url.includes('\0') ? `${VALID_ID_PREFIX}${url.replace(/\0/g, NULL_BYTE_PLACEHOLDER)}` : url;
}

/**
 * 从客户端模块图收集 render-blocking CSS 链接。
 *
 * dev 下由 JS 引入的 CSS（虚拟 uno.css 入口、全局样式、字体 css）要等客户端模块图执行完才生效，
 * SSR HTML 在这段间隙是**无样式**的（FOUC）。把同一批 CSS 以阻塞 `<link>` 注入，浏览器可与 JS
 * 并行抓取，首屏即有样式。
 *
 * `?direct` 让 Vite 的 transform 中间件返回原始 CSS（`Content-Type: text/css`）而不是注入式 JS
 * 包装；URL 自带查询串的模块（SFC `<style>` 块形如 `*.vue?vue&type=style`）无法这样服务，跳过。
 */
export function collectDevCssLinks(moduleGraph: ViteDevServer['environments']['client']['moduleGraph']): string[] {
  const links = new Set<string>();
  for (const mod of moduleGraph.idToModuleMap.values()) {
    const { url, id } = mod;
    if (!url || url.includes('?')) continue;
    if (id?.endsWith('.css') || url.endsWith('.css')) {
      links.add(`${toDevCssHref(url)}?direct`);
    }
  }
  return [...links];
}

/** 在 `</head>` 前插入阻塞样式链接。 */
export function injectStylesheetLinks(html: string, hrefs: string[]): string {
  if (!hrefs.length || !html.includes('</head>')) return html;
  const tags = hrefs.map(href => `<link rel="stylesheet" href="${href}">`).join('');
  return html.replace('</head>', `${tags}</head>`);
}

export interface DevRequestRouterOptions {
  /**
   * 处理归属 ubean 的请求。省略时插件**自举**宿主 dev app（`vite dev` / `vp dev` 场景）：
   * 首个应用请求时才扫盘、加载配置与 SSR 图 —— 启动期不做这些工作，`vite dev` 的冷启动
   * 不受框架影响。
   *
   * `ubean dev` 传入 CLI 造好的 app 的 handler（它需要在 Vite server 起来之前就把 app
   * 交给 DevTools / runner），因此两条路径共用同一层路由判据与 outbound 处理。
   */
  handler?: (request: Request, context: { url: string }) => Promise<Response>;
  /** `handler` 省略时的自举参数。 */
  bootstrap?: DevBootstrapOptions;
  /**
   * 跳过 HTML transform 的路径判定。预构建 SPA（如 `/_devtools`）的产物自带模块引用，
   * 经 `transformIndexHtml` 重写会被破坏。
   */
  skipHtmlTransform?: (url: string) => boolean;
  /** 错误回调（默认走 Vite logger 的 error）。 */
  onError?: (error: unknown, context: { url: string }) => void;
}

export interface DevBootstrapOptions {
  /** 项目根目录，默认取 `server.config.root`。 */
  rootDir?: string;
  /** 覆盖配置加载（默认 `loadUbeanConfig(rootDir)`，会命中 CLI 已设置的缓存）。 */
  loadConfig?: (rootDir: string) => Promise<UbeanResolvedConfig>;
  /** crons 加载完后的启动钩子；缺省动态加载 `@ubean/server/cron`。 */
  startCronScheduler?: () => unknown;
}

/** 缺省 cron 启动器：动态加载，避免把服务端运行时拉进插件模块的顶层依赖。 */
async function defaultCronScheduler(): Promise<void> {
  const cron = (await import('@ubean/server/cron')) as { startCronScheduler: () => void };
  cron.startCronScheduler();
}

/**
 * 自举式 handler：首次调用时创建宿主 dev app（`bootstrapDevApp`），之后复用同一实例。
 *
 * 复用同一个 promise 而不是每次请求重建：`bootstrapDevApp` 会扫盘并加载 SSR 图，重建等于
 * 每个请求都重扫；同时保证并发首请求只自举一次。
 */
/**
 * 自举出来的 app（供 DevTools 的 playground 等按需取用）。挂在 server 对象上，理由同
 * dev-scan 的协调器：用户 `vite.config.ts` 由 Vite 打包加载，插件与 CLI 可能持有不同的模块实例。
 */
const DEV_APP_KEY = '__ubeanDevApp';

/** 取该 dev server 上自举出的 app（还没自举时返回 undefined）。 */
export function getDevApp(
  server: ViteDevServer
): { fetch: (request: Request) => Response | Promise<Response> } | undefined {
  const holder = server as unknown as Record<string, unknown>;
  return holder[DEV_APP_KEY] as { fetch: (request: Request) => Response | Promise<Response> } | undefined;
}

function createLazyBootstrapHandler(
  server: ViteDevServer,
  options: DevBootstrapOptions = {}
): (request: Request) => Promise<Response> {
  let bootstrapPromise: Promise<DevAppBootstrap> | null = null;

  const start = async (): Promise<DevAppBootstrap> => {
    const rootDir = options.rootDir ?? server.config.root;
    const config = options.loadConfig ? await options.loadConfig(rootDir) : await loadUbeanConfig(rootDir);
    // `createVueRenderer` 必须来自 Vite SSR 图（理由见 dev-host-app.ts 的 DevRendererOptions）
    const ssr = (await server.ssrLoadModule('@ubean/client/ssr')) as {
      createVueRenderer: (options: DevRendererOptions) => PageRenderer;
    };
    return bootstrapDevApp({
      rootDir,
      config,
      loadModule: id => server.ssrLoadModule(id),
      createRenderer: ssr.createVueRenderer,
      startCronScheduler: options.startCronScheduler ?? defaultCronScheduler,
      logger: server.config.logger
    });
  };

  // 自举路径自己订阅扫描：新增路由/页面文件必须让 app 重建（CLI 路径由 CLI 的 onScan
  // 订阅者负责，两条路径各建一次，不会重复）。
  onDevScan(server, async result => {
    const bootstrap = await bootstrapPromise?.catch(() => null);
    await bootstrap?.rebuild(result);
  });

  return async request => {
    bootstrapPromise ??= start().then(bootstrap => {
      // 暴露给 DevTools 等外部消费者（rebuild 会替换实例，因此登记的是「当前实例」）
      (server as unknown as Record<string, unknown>)[DEV_APP_KEY] = bootstrap.app;
      return bootstrap;
    });
    const bootstrap = await bootstrapPromise;
    await bootstrap.ready();
    // rebuild 会替换 app 实例，因此每个请求都从当前实例取（不能缓存 app 引用）
    (server as unknown as Record<string, unknown>)[DEV_APP_KEY] = bootstrap.app;
    return bootstrap.app.fetch(request);
  };
}

export interface DevRequestHandlers {
  /** `configureServer` 钩子体内使用：排在 Vite transform/静态中间件之前。 */
  pre: Connect.NextHandleFunction;
  /** 钩子返回的函数内使用：排在 Vite 静态中间件之后，兜底。 */
  post: Connect.NextHandleFunction;
}

/** 500 错误页。dev 才看得到，直接给可读的原文与栈。 */
function renderErrorPage(error: unknown): string {
  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  const escaped = detail.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch] as string);
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Server Error</title>
    <style>
      body { font-family: monospace; padding: 2rem; background: #1a1a1a; color: #ff6b6b; }
      pre { background: #2d2d2d; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>500 · ubean dev server error</h1>
    <pre>${escaped}</pre>
  </body>
</html>`;
}

/**
 * 构造 pre / post 两个 connect 中间件。
 *
 * 需要 Vite dev server 实例：一是拿不到它就调不了 `transformIndexHtml`（客户端入口注入），
 * 二是 CSS 链接要从**客户端**环境的模块图里收集。
 */
export function createUbeanRequestHandlers(
  server: ViteDevServer,
  options: DevRequestRouterOptions
): DevRequestHandlers {
  const { skipHtmlTransform, onError } = options;
  // handler 缺省 → 自举；显式传入 → 用调用方的（CLI 路径）
  const handler = options.handler ?? createLazyBootstrapHandler(server, options.bootstrap);

  async function respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    // @ts-expect-error Node 的 Socket 类型没有 `encrypted`
    const protocol = req.socket?.encrypted ? 'https' : 'http';
    const webReq = await toWebRequest(req, 'localhost', protocol);
    const webRes = await handler(webReq, { url });

    const contentType = webRes.headers.get('content-type') || '';
    const skipTransform = skipHtmlTransform?.(url) ?? false;

    if (contentType.includes('text/html') && webRes.body && !skipTransform) {
      const html = await webRes.text();
      // 阻塞样式先注入，再交给 Vite 追加客户端脚本
      const cssLinks = collectDevCssLinks(server.environments.client.moduleGraph);
      const transformed = await server.transformIndexHtml(url, injectStylesheetLinks(html, cssLinks));
      res.statusCode = webRes.status;
      res.statusMessage = webRes.statusText;
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      res.end(transformed);
      return;
    }

    await sendWebResponse(res, webRes);
  }

  /** 统一错误处理：SSR 栈映射回源码，响应头已发出时只能断开。 */
  async function guard(req: IncomingMessage, res: ServerResponse, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      server.ssrFixStacktrace(error as Error);
      if (onError) onError(error, { url: req.url || '/' });
      else server.config.logger.error(String(error instanceof Error ? error.stack : error));
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderErrorPage(error));
      } else {
        res.end();
      }
    }
  }

  const pre: Connect.NextHandleFunction = (req, res, next) => {
    if (isViteResourceRequest(req.url || '/', req.headers)) {
      next();
      return;
    }
    void guard(req, res, () => respond(req, res));
  };

  const post: Connect.NextHandleFunction = (req, res, next) => {
    if (res.writableEnded) {
      next();
      return;
    }
    void guard(req, res, () => respond(req, res));
  };

  return { pre, post };
}

/**
 * 把请求路由注册进 Vite 插件生命周期（RM-V10 的插件形态）。
 *
 * `appType: 'custom'` 是**必须**的：默认的 `spa`/`mpa` 会在静态中间件之后挂
 * `htmlFallbackMiddleware` + `indexHtmlMiddleware`，把未知路径一律改写成 `index.html`
 * 并用 Vite 自己的 HTML 服务 —— 那样页面请求就轮不到 ubean 了。设为 `custom` 后这两层被摘掉，
 * 未匹配请求正好落到我们的 post 中间件。
 */
export function ubeanDevRequestPlugin(options: DevRequestRouterOptions): Plugin {
  return {
    name: 'ubean:dev-request',

    config() {
      return { appType: 'custom' as const };
    },

    configureServer(server) {
      const { pre, post } = createUbeanRequestHandlers(server, options);
      server.middlewares.use(pre);
      return () => {
        server.middlewares.use(post);
      };
    }
  };
}
