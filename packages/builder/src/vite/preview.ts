/**
 * `vite preview` 接管（RM-V24，对齐 `nitro:src/build/vite/preview.ts`）。
 *
 * 与 dev 侧同构：请求处理属于**构建工具层**，因此落在插件里，CLI 只负责参数与 banner
 * （RM-V25）。两条形态：
 *
 * - `fullstack` / `backend`：**走生产 handler** —— 直接从 `dist/server/entry.mjs` 取
 *   `createFetchHandler()` 得到的 fetch handler，在进程内 dispatch。刻意不 spawn
 *   `dist/server/server.mjs`（旧 CLI 的做法）：那是「预览一个 Node 服务器」，而预览要验证的
 *   是**产物**。同样刻意不经 `server.mjs`/`handler.mjs` 包装层 —— 它们要么自监听端口
 *   （node/bun/deno），要么是平台适配壳（worker / standard），`entry.mjs` 才是所有 preset
 *   共同的真实产物。静态文件与预渲染 HTML 由产物内的 `serveStatic` 自己服务（与生产一致），
 *   因此这里不再叠一层静态中间件，避免「预览环境比生产环境多一层兜底」。
 * - `spa` / `ssg`：没有服务端 bundle（`hasServer = mode !== 'spa'`，ssg 构建后还会删掉
 *   `dist/server`），只能静态服务 `dist/public`。解析规则（目录 `index.html`、ssg 的
 *   `<path>/index.html` 与 `<path>.html`、spa 回退 `index.html`、路径穿越防护）与 CLI 的
 *   `startStaticServer` 是**同一份实现** —— 两套方言必然分叉，且此处正是历史上踩过
 *   `...` 文件名误判为穿越的地方。
 */
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { tryGetConfig } from '@ubean/config';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { getLogger } from '@ubean/shared/logger';
import { sendWebResponse, toWebRequest } from '../dev/node-web';

const logger = getLogger('preview');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/** 静态文件的 MIME 推断（CLI 的静态服务器与本插件共用）。 */
export function previewMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * 解析结果三态：命中文件 / 越界（400）/ 未命中（404）。
 *
 * 「越界」必须与「未命中」分开 —— 它们对应不同的状态码与语义，混成一个 404 会把路径穿越
 * 攻击伪装成普通未命中。
 */
export type PreviewFileResolution = { kind: 'file'; path: string } | { kind: 'forbidden' } | { kind: 'missing' };

/**
 * 把请求路径解析为静态文件（spa / ssg 的规则，单一实现）。
 *
 * 不能用 `pathname.includes('..')` 判穿越：文件名里合法的 `...` 会被误伤（SSG 动态路由产物
 * `_...slug_-Bqlu_Muj.js` 实测踩过）。判据只能是**规范化后的路径是否仍在 root 内**。
 */
export function resolvePreviewFile(root: string, pathname: string, mode: 'spa' | 'ssg'): PreviewFileResolution {
  const rootPath = resolve(root);
  const candidate = normalize(join(rootPath, pathname));
  if (candidate !== rootPath && !candidate.startsWith(rootPath + sep)) {
    return { kind: 'forbidden' };
  }

  const isFile = (p: string): boolean => isPath(p, 'file');
  const isDir = (p: string): boolean => isPath(p, 'dir');

  // 1. 原样命中目录 → 目录下的 index.html
  if (!isFile(candidate) && isDir(candidate)) {
    const indexPath = join(candidate, 'index.html');
    if (isFile(indexPath)) return { kind: 'file', path: indexPath };
  }
  if (isFile(candidate)) return { kind: 'file', path: candidate };

  // 2. ssg：`<path>/index.html`（预渲染产物按路由建目录）
  if (mode === 'ssg') {
    const indexPath = join(candidate, 'index.html');
    if (isFile(indexPath)) return { kind: 'file', path: indexPath };

    // 3. ssg：`<path>.html`（预渲染的叶子路由）
    const htmlPath = `${candidate}.html`;
    if (isFile(htmlPath)) return { kind: 'file', path: htmlPath };
  }

  // 4. spa：客户端路由接管，回退 index.html
  if (mode === 'spa') {
    const fallback = join(rootPath, 'index.html');
    if (isFile(fallback)) return { kind: 'file', path: fallback };
  }

  return { kind: 'missing' };
}

/** 存在且类型匹配（`statSync` 抛错即视为不存在）。 */
function isPath(p: string, kind: 'file' | 'dir'): boolean {
  try {
    const s = statSync(p);
    return kind === 'file' ? s.isFile() : s.isDirectory();
  } catch {
    return false;
  }
}

/** 把解析结果写成响应；命中文件时流式返回内容。 */
export async function sendPreviewFile(res: ServerResponse, path: string): Promise<void> {
  const body = await readFile(path);
  res.statusCode = 200;
  res.setHeader('Content-Type', previewMimeType(path));
  res.setHeader('Content-Length', body.length);
  res.end(body);
}

export function sendPreviewStatus(res: ServerResponse, status: 400 | 404 | 500, text: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

export type PreviewNext = (err?: unknown) => void;

export interface UbeanPreviewMiddlewareOptions {
  /** 项目根目录。 */
  rootDir: string;
  /** 产物根目录（`config.build.outputDir`）。 */
  outputDir: string;
  mode: UbeanResolvedConfig['mode'];
  /** 监听地址，用于把请求 URL 补全为绝对地址。 */
  host?: string;
}

/** 构建期模块的默认导出：`createFetchHandler()` 工厂（见 preset 包装生成器）。 */
type FetchHandlerFactory = () => Promise<(req: Request, ctx?: unknown) => Promise<Response>>;

export type PreviewMiddleware = (req: IncomingMessage, res: ServerResponse, next: PreviewNext) => void;

/**
 * 预览中间件：按 mode 选择「生产 handler」或「静态文件」。
 *
 * 生产 handler 只加载一次（`entry.mjs` 的模块级单例因此保留，与生产行为一致），失败时把
 * 错误写进响应而不是让 `vite preview` 挂住 —— 预览最常见的失败就是「忘了先构建」。
 */
export function createPreviewMiddleware(options: UbeanPreviewMiddlewareOptions): PreviewMiddleware {
  const { rootDir, outputDir, mode, host = 'localhost' } = options;
  const staticRoot = resolve(rootDir, outputDir, 'public');
  const serverEntry = resolve(rootDir, outputDir, 'server', 'entry.mjs');
  const staticOnly = mode === 'spa' || mode === 'ssg';

  let handlerPromise: Promise<(req: Request, ctx?: unknown) => Promise<Response>> | null = null;

  const loadHandler = (): Promise<(req: Request, ctx?: unknown) => Promise<Response>> => {
    handlerPromise ??= (async () => {
      if (!existsSync(serverEntry)) {
        throw new Error(
          `Build output not found: ${serverEntry}. Run \`ubean build\` first to create a production build.`
        );
      }
      const mod = (await import(pathToFileURL(serverEntry).href)) as {
        default?: FetchHandlerFactory;
        createFetchHandler?: FetchHandlerFactory;
      };
      const factory = mod.default ?? mod.createFetchHandler;
      if (typeof factory !== 'function') {
        throw new Error(`${serverEntry} 未导出 createFetchHandler —— 产物与当前框架版本不匹配。`);
      }
      return factory();
    })();
    return handlerPromise;
  };

  if (!staticOnly) {
    // 生产 handler 路径：静态资源与预渲染 HTML 由产物内的 `serveStatic` 服务（与生产一致）。
    return (req, res, _next) => {
      void (async () => {
        try {
          const handler = await loadHandler();
          const protocol = (req.socket as { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http';
          const webReq = await toWebRequest(req, host, protocol);
          const webRes = await handler(webReq);
          await sendWebResponse(res, webRes);
        } catch (err) {
          logger.error(`Preview request failed: ${err instanceof Error ? err.message : String(err)}`);
          sendPreviewStatus(res, 500, err instanceof Error ? err.message : String(err));
        }
      })();
    };
  }

  // spa / ssg：静态服务（解析规则与 CLI 的 startStaticServer 同源）
  const staticMode = mode as 'spa' | 'ssg';
  return (req, res, _next) => {
    void (async () => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || host}`);
        const pathname = decodeURIComponent(url.pathname);
        const resolvedFile = resolvePreviewFile(staticRoot, pathname, staticMode);
        if (resolvedFile.kind === 'forbidden') return sendPreviewStatus(res, 400, 'Bad Request');
        if (resolvedFile.kind === 'missing') return sendPreviewStatus(res, 404, 'Not Found');
        await sendPreviewFile(res, resolvedFile.path);
      } catch (err) {
        sendPreviewStatus(res, 500, err instanceof Error ? err.message : String(err));
      }
    })();
  };
}

export interface UbeanPreviewPluginOptions {
  config?: UbeanResolvedConfig;
  /** 覆盖监听地址（用于补全请求 URL）。 */
  host?: string;
}

/** Connect 中间件栈的最小接口（Vite dev / preview server 都满足）。 */
export interface PreviewMiddlewareHost {
  middlewares: { use: (fn: PreviewMiddleware) => void };
}

/**
 * 把预览中间件挂到 server 上。
 *
 * 由**核心插件**调用（同 dev 的请求路由）：「哪条路径都必然注册的那一个插件」才拿得到两端
 * 共用的配置；独立插件从别的插件的 `config` 钩子里注入，在环境化构建下到不了每个环境
 * （RM-V21 踩过同一个坑）。
 */
export function attachPreviewMiddleware(
  server: PreviewMiddlewareHost,
  config: UbeanResolvedConfig,
  host?: string
): void {
  const middleware = createPreviewMiddleware({
    rootDir: config.rootDir,
    outputDir: config.build.outputDir,
    mode: config.mode,
    host
  });
  server.middlewares.use((req, res, next) => middleware(req, res, next));
}

/**
 * 独立的预览插件（`vite preview` 的显式形态）。
 *
 * 核心插件已内置同一份接线（`attachPreviewMiddleware`），这里保留独立导出便于测试与
 * 「不走 `ubeanPlugin()`」的场景。
 */
export function ubeanPreviewPlugin(options?: UbeanPreviewPluginOptions): Plugin {
  let config = options?.config ?? tryGetConfig() ?? undefined;

  return {
    name: 'ubean:preview',
    apply: 'serve',

    async configurePreviewServer(server) {
      if (!config) config = tryGetConfig() ?? undefined;
      if (!config) return;

      attachPreviewMiddleware(server, config, options?.host);
      logger.info(`Preview serving ${config.mode} build from ${join(config.rootDir, config.build.outputDir)}`);
    }
  };
}
