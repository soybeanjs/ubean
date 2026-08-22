/**
 * P9-05 文件约定 SEO
 *
 * 在 `src/` 根目录扫描以下约定文件(对齐 Next.js `app/` 文件约定):
 *
 * | 文件                          | 输出路径                  | 默认导出形状                                                            |
 * | ----------------------------- | ------------------------- | ----------------------------------------------------------------------- |
 * | `src/sitemap.ts`              | `GET /sitemap.xml`        | `() => SitemapUrl[] \| Promise<SitemapUrl[]>`                           |
 * | `src/robots.ts`               | `GET /robots.txt`         | `() => RobotsOptions \| RobotsOptions[]`                                |
 * | `src/manifest.ts`             | `GET /manifest.webmanifest` | `() => WebAppManifest`                                                |
 * | `src/opengraph-image.ts`      | `GET /opengraph-image`    | `() => Response \| Promise<Response>` (通常是 PNG)                      |
 * | `src/icon.ts`                 | `GET /icon`               | `() => Response \| Promise<Response>`                                   |
 * | `src/apple-icon.ts`           | `GET /apple-icon`         | `() => Response \| Promise<Response>`                                   |
 *
 * 设计要点:
 * - 纯运行时实现(无 Vite 插件依赖):用 `fs.access` 检测文件存在,`import()` 加载。
 * - 不强依赖 `@ubean/app` —— 通过最小化的 `SeoConventionApp` 结构类型避免循环依赖。
 * - 调用方也可手动 `registerSeoConventions(app, { srcDir })`。`createUbeanApp`
 *   在 `init()` 默认调用（`seoConventions: false` 关闭）；生产可传入已 glob 的
 *   `seoConventionModules`，避免 serverless 依赖读盘。
 * - 文件不存在时静默跳过(不报错),允许项目按需采用约定。
 * - 已注册的路由(用户在 `routes/` 显式定义)优先级不变 —— 约定文件在 `init()` 中
 *   于用户路由 *之后* 注册,因此 Hono 路由匹配时显式路由优先。
 */
import { existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'pathe';
import { createSitemapResponse, createRobotsResponse, createManifestResponse } from './index';
import type { SitemapUrl, RobotsOptions, WebAppManifest } from './index';

/**
 * 约定文件类型标识。每个标识映射到 srcDir 下的一个固定文件名和输出 URL。
 */
export type SeoConventionKind = 'sitemap' | 'robots' | 'manifest' | 'opengraph-image' | 'icon' | 'apple-icon';

export interface SeoConventionDescriptor {
  kind: SeoConventionKind;
  /** srcDir 下的相对文件名(不含扩展名后缀,会尝试 .ts/.js/.mjs/.mts) */
  fileName: string;
  /** 注册的 GET 路由路径 */
  routePath: string;
  /** 默认 `Content-Type`(可被 handler 返回的 Response 覆盖) */
  contentType: string;
  /** 默认 `Cache-Control` */
  cacheControl: string;
}

export const SEO_CONVENTIONS: readonly SeoConventionDescriptor[] = [
  {
    kind: 'sitemap',
    fileName: 'sitemap',
    routePath: '/sitemap.xml',
    contentType: 'application/xml; charset=utf-8',
    cacheControl: 'public, max-age=3600'
  },
  {
    kind: 'robots',
    fileName: 'robots',
    routePath: '/robots.txt',
    contentType: 'text/plain; charset=utf-8',
    cacheControl: 'public, max-age=3600'
  },
  {
    kind: 'manifest',
    fileName: 'manifest',
    routePath: '/manifest.webmanifest',
    contentType: 'application/manifest+json; charset=utf-8',
    cacheControl: 'public, max-age=86400'
  },
  {
    kind: 'opengraph-image',
    fileName: 'opengraph-image',
    routePath: '/opengraph-image',
    contentType: 'image/png',
    cacheControl: 'public, max-age=86400'
  },
  {
    kind: 'icon',
    fileName: 'icon',
    routePath: '/icon',
    contentType: 'image/png',
    cacheControl: 'public, max-age=86400'
  },
  {
    kind: 'apple-icon',
    fileName: 'apple-icon',
    routePath: '/apple-icon',
    contentType: 'image/png',
    cacheControl: 'public, max-age=86400'
  }
] as const;

/**
 * 注册约定文件所需的最小 app 接口。`UbeanApp` 满足此接口,
 * 但为避免 `@ubean/seo` → `@ubean/app` 的硬依赖(后者已经依赖前者的兄弟包),
 * 此处用结构类型解耦。
 */
export interface SeoConventionApp {
  get(path: string, ...handlers: Array<(c: SeoConventionContext) => unknown>): unknown;
}

export interface SeoConventionContext {
  req: {
    method: string;
    path: string;
    url: string;
  };
}

export interface RegisterSeoConventionsOptions {
  /**
   * 项目 srcDir 绝对路径或相对 cwd 的路径。约定文件会在该目录根下查找。
   */
  srcDir: string;
  /**
   * 显式启用/禁用子集。未指定时启用全部约定。
   */
  enabled?: SeoConventionKind[];
  /**
   * 显式禁用子集(优先级高于 `enabled`)。
   */
  disabled?: SeoConventionKind[];
  /**
   * 文件扩展名候选(默认 `.ts/.js/.mjs/.mts/.cjs`)。第一个存在的扩展名胜出。
   */
  extensions?: string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.js', '.mjs', '.mts', '.cjs'];

interface LoadedConvention {
  descriptor: SeoConventionDescriptor;
  filePath: string;
  handler: (c?: SeoConventionContext) => unknown;
}

/**
 * 在 srcDir 下查找约定文件。返回已加载的 `{ descriptor, filePath, handler }` 列表;
 * 不存在的文件被静默跳过。
 */
export async function discoverSeoConventions(options: RegisterSeoConventionsOptions): Promise<LoadedConvention[]> {
  const srcDir = isAbsolute(options.srcDir) ? options.srcDir : resolve(process.cwd(), options.srcDir);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const disabled = new Set(options.disabled ?? []);
  const enabledSet = options.enabled ? new Set(options.enabled) : null;

  const loaded: LoadedConvention[] = [];

  for (const descriptor of SEO_CONVENTIONS) {
    if (disabled.has(descriptor.kind)) continue;
    if (enabledSet && !enabledSet.has(descriptor.kind)) continue;

    let filePath: string | null = null;
    for (const ext of extensions) {
      const candidate = join(srcDir, `${descriptor.fileName}${ext}`);
      if (existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
    if (!filePath) continue;

    try {
      const mod = await import(/* @vite-ignore */ filePath);
      const handler = mod.default;
      if (typeof handler !== 'function') {
        // 静默跳过非函数 default export —— 允许占位文件存在但不报错
        continue;
      }
      loaded.push({ descriptor, filePath, handler });
    } catch {
      // 加载失败时静默跳过 —— dev 阶段语法错误由 Vite 自身报错
    }
  }

  return loaded;
}

function basenameWithoutExt(filePath: string): string {
  const base = filePath.replaceAll('\\', '/').split('/').pop() || '';
  return base.replace(/\.(ts|js|mjs|mts|cjs)$/i, '');
}

/** Map `sitemap.ts` / `/src/robots.js` to a convention kind. */
export function conventionKindFromPath(filePath: string): SeoConventionKind | undefined {
  const name = basenameWithoutExt(filePath);
  return SEO_CONVENTIONS.find(d => d.fileName === name)?.kind;
}

function mountConvention(
  app: SeoConventionApp,
  descriptor: SeoConventionDescriptor,
  handler: (c?: SeoConventionContext) => unknown
): void {
  (app as { get: (path: string, ...handlers: Array<(c: SeoConventionContext) => unknown>) => unknown }).get(
    descriptor.routePath,
    async (c: SeoConventionContext) => toResponse(descriptor, handler, c)
  );
}

/**
 * Register convention handlers already loaded (production `import.meta.glob`).
 * Keys may be absolute or vite-style paths; the basename selects the kind.
 */
export async function registerSeoConventionModules(
  app: SeoConventionApp,
  modules: Record<string, { default?: unknown }>
): Promise<SeoConventionKind[]> {
  const registered: SeoConventionKind[] = [];

  for (const [filePath, mod] of Object.entries(modules)) {
    const kind = conventionKindFromPath(filePath);
    if (!kind) continue;
    const descriptor = SEO_CONVENTIONS.find(d => d.kind === kind);
    if (!descriptor) continue;
    const handler = mod?.default;
    if (typeof handler !== 'function') continue;
    mountConvention(app, descriptor, handler as (c?: SeoConventionContext) => unknown);
    registered.push(kind);
  }

  return registered;
}

/**
 * 把单个约定文件的 default export 转换为 Hono GET handler。
 *
 * - `sitemap` / `robots` / `manifest`:调用 handler 拿到数据,用 `create*Response` 包装
 * - 其它(`opengraph-image` / `icon` / `apple-icon`):handler 直接返回 `Response`
 */
async function toResponse(
  descriptor: SeoConventionDescriptor,
  handler: (c?: SeoConventionContext) => unknown,
  c?: SeoConventionContext
): Promise<Response> {
  const result = await handler(c);

  // sitemap / robots / manifest:用工厂函数包装为 Response
  if (descriptor.kind === 'sitemap') {
    return createSitemapResponse(result as SitemapUrl[]);
  }
  if (descriptor.kind === 'robots') {
    return createRobotsResponse(result as RobotsOptions | RobotsOptions[]);
  }
  if (descriptor.kind === 'manifest') {
    return createManifestResponse(result as WebAppManifest);
  }

  // 图像类约定:handler 直接返回 Response
  if (result instanceof Response) {
    // 补默认 Cache-Control(若 handler 未设置)
    if (!result.headers.get('Cache-Control')) {
      const cloned = result.clone();
      cloned.headers.set('Cache-Control', descriptor.cacheControl);
      return cloned;
    }
    return result;
  }

  // 兜底:返回 500
  return new Response(`SEO convention "${descriptor.kind}" handler must return a Response (got ${typeof result})`, {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

/**
 * 扫描 srcDir 下的 SEO 约定文件,为每个发现的文件注册 GET 路由。
 *
 * 调用方应在 `app.init()` *之前* 调用此函数,这样约定路由会和其它路由
 * 一起在 `init()` 中被纳入。如果调用方在 `init()` 之后调用,需要确保
 * app 实例支持动态添加路由(`UbeanApp` 支持)。
 *
 * @returns 已注册的约定 kind 列表(便于日志/调试)
 */
export async function registerSeoConventions(
  app: SeoConventionApp,
  options: RegisterSeoConventionsOptions
): Promise<SeoConventionKind[]> {
  const loaded = await discoverSeoConventions(options);
  const registered: SeoConventionKind[] = [];

  for (const { descriptor, handler } of loaded) {
    mountConvention(app, descriptor, handler);
    registered.push(descriptor.kind);
  }

  return registered;
}

/**
 * 列出 srcDir 下存在的约定文件 kind(不加载)。用于在不启动 app 的情况下
 * 检测项目使用了哪些约定(例如 CLI 信息展示)。
 */
export function listSeoConventions(
  options: Pick<RegisterSeoConventionsOptions, 'srcDir' | 'extensions'>
): SeoConventionKind[] {
  const srcDir = isAbsolute(options.srcDir) ? options.srcDir : resolve(process.cwd(), options.srcDir);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const found: SeoConventionKind[] = [];

  for (const descriptor of SEO_CONVENTIONS) {
    for (const ext of extensions) {
      if (existsSync(join(srcDir, `${descriptor.fileName}${ext}`))) {
        found.push(descriptor.kind);
        break;
      }
    }
  }

  return found;
}
