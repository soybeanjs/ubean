import type { Context, Next } from 'hono';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute } from '../core/routing/types';
import type { ComposedHandler, RouteMeta, UbeanEnv, UbeanMiddleware } from '../types/handler';
import { getLocale, getLocaleDir } from './i18n';
import type { UbeanApp } from './app';
import { isPagesRequest, pageJsonResponse, renderPage } from './pages';
import type { PageObject, PageRenderer, PageAssetTags, PageRenderContext } from './pages';

export interface RegisterOptions {
  routes: ScannedApiRoute[];
  middleware: ScannedMiddleware[];
  pages: ScannedPageRoute[];
  routeLoaders: Record<
    string,
    () => Promise<{
      default?: ComposedHandler;
      GET?: ComposedHandler;
      POST?: ComposedHandler;
      PUT?: ComposedHandler;
      PATCH?: ComposedHandler;
      DELETE?: ComposedHandler;
      HEAD?: ComposedHandler;
      OPTIONS?: ComposedHandler;
    }>
  >;
  middlewareLoaders: Record<string, () => Promise<{ default?: UbeanMiddleware }>>;
  pageRenderer?: PageRenderer | null;
  pageAssetTags?: PageAssetTags;
  pageLoaders?: Record<string, () => Promise<any>>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

const HTTP_METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function normalizeMethod(m: string | undefined): Method | undefined {
  if (!m) return undefined;
  const upper = m.toUpperCase() as Method;
  return HTTP_METHODS.includes(upper) ? upper : undefined;
}

function honoMethod(method: Method): 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' {
  return method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
}

function convertUbeanRoutePath(path: string): string {
  let honoPath = path;
  honoPath = honoPath.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, rest, name) => {
    if (rest) return `*${name}`;
    return `:${name}`;
  });
  return honoPath;
}

function middlewarePathToHonoPath(relativePath: string): string {
  const noExt = relativePath.replace(/\.(mjs|js|jsx|cjs|ts|tsx|mts|cts)$/i, '');
  const segments = noExt.split('/');

  if (segments.length === 1) {
    return '/*';
  }

  const dirSegments = segments.slice(0, -1);
  const dirPath = `/${dirSegments.join('/')}`;
  return `${dirPath}/*`;
}

export async function registerRoutes(app: UbeanApp, options: RegisterOptions) {
  const { routes, middleware, pages, routeLoaders, middlewareLoaders, pageRenderer, pageAssetTags, pageLoaders } =
    options;

  const sortedMiddleware = [...middleware].sort((a, b) => a.order - b.order);

  for (const mw of sortedMiddleware) {
    await app.hooks.callHook('middleware:register', mw);
    const loader = middlewareLoaders[mw.relativePath];
    if (loader) {
      try {
        const mod = await loader();
        if (mod.default) {
          const mountPath = mw.global ? '*' : middlewarePathToHonoPath(mw.relativePath);
          app.use(mountPath, mod.default as any);
        }
      } catch {
        // ignore loading errors in dev
      }
    }
  }

  const routesByPath = new Map<string, { methods: Map<Method, ComposedHandler>; meta?: RouteMeta }>();

  const routeFileGroups = new Map<string, ScannedApiRoute[]>();
  for (const route of routes) {
    const key = route.relativePath;
    const group = routeFileGroups.get(key);
    if (group) {
      group.push(route);
    } else {
      routeFileGroups.set(key, [route]);
    }
  }

  for (const [relativePath, routeGroup] of routeFileGroups) {
    const loader = routeLoaders[relativePath];
    if (!loader) continue;

    const first = routeGroup[0];
    const honoPath = convertUbeanRoutePath(first.route);
    let entry = routesByPath.get(honoPath);
    if (!entry) {
      entry = { methods: new Map() };
      routesByPath.set(honoPath, entry);
    }

    if (first.fileMeta) {
      entry.meta = { public: true, ...entry.meta, ...first.fileMeta };
    }

    let mod: any;
    try {
      mod = await loader();
    } catch {
      continue;
    }

    for (const route of routeGroup) {
      const method = normalizeMethod(route.method);
      if (!method) continue;

      const namedHandler = mod[method];
      if (namedHandler && typeof namedHandler === 'function') {
        entry.methods.set(method, namedHandler as ComposedHandler);
        continue;
      }
      const lowerHandler = mod[method.toLowerCase()];
      if (lowerHandler && typeof lowerHandler === 'function') {
        entry.methods.set(method, lowerHandler as ComposedHandler);
        continue;
      }
      if (mod.default && typeof mod.default === 'function') {
        entry.methods.set(method, mod.default as ComposedHandler);
      }
    }
  }

  for (const [honoPath, entry] of routesByPath) {
    for (const [method, handler] of entry.methods) {
      await app.hooks.callHook('route:register', {
        method,
        path: honoPath,
        handler,
        meta: entry.meta
      });
      const wrapper = async (c: Context<UbeanEnv>, _next: Next) => {
        if (entry.meta) {
          c.set('route', { meta: entry.meta, path: c.req.path, method: c.req.method });
        }
        return (handler as any)(c);
      };
      (app as any)[honoMethod(method)](honoPath, wrapper);
    }
  }

  async function handlePageRequest(c: Context<UbeanEnv>, page: ScannedPageRoute, method: 'GET' | 'POST') {
    c.set('route', {
      meta: { public: page.pageMeta?.public ?? true } as RouteMeta,
      path: c.req.path,
      method: c.req.method
    });

    let loader: (() => Promise<any>) | undefined;
    let mod: any;
    let loaderResult: any;
    let actionResult: any;
    let actionErrors: Record<string, string> | null = null;

    if (pageLoaders) {
      loader = pageLoaders[page.relativePath];
      if (loader) {
        try {
          mod = await loader();
        } catch {
          // ignore loading errors in dev
        }
      }
    }

    if (method === 'POST' && mod?.action && typeof mod.action === 'function') {
      try {
        actionResult = await mod.action(c);
        if (actionResult instanceof Response) {
          if (actionResult.status >= 300 && actionResult.status < 400) {
            const redirectUrl = actionResult.headers.get('Location');
            if (redirectUrl) {
              if (isPagesRequest(c)) {
                return c.json({ redirect: redirectUrl }, { status: 200, headers: { 'X-Ubean-Redirect': redirectUrl } });
              }
              return actionResult;
            }
          }
          if (isPagesRequest(c)) {
            return actionResult;
          }
        }
        if (actionResult && typeof actionResult === 'object' && 'errors' in actionResult) {
          actionErrors = actionResult.errors as Record<string, string>;
          actionResult = undefined;
        }
      } catch (err) {
        if (err instanceof Response) {
          if (err.status >= 300 && err.status < 400) {
            const redirectUrl = err.headers.get('Location');
            if (redirectUrl) {
              if (isPagesRequest(c)) {
                return c.json({ redirect: redirectUrl }, { status: 200, headers: { 'X-Ubean-Redirect': redirectUrl } });
              }
              return err;
            }
          }
          return err;
        }
        if (isPagesRequest(c)) {
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
        actionErrors = { _error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (mod?.loader && typeof mod.loader === 'function') {
      try {
        loaderResult = await mod.loader(c);
        if (loaderResult instanceof Response) return loaderResult;
      } catch {
        // ignore loader errors in dev
      }
    }

    const props: Record<string, unknown> = loaderResult ?? {};
    if (actionResult !== undefined) {
      Object.assign(props as any, actionResult);
    }

    const pageComponent = page.reuseTarget || page.name;

    const pageObj: PageObject = {
      component: pageComponent,
      props,
      params: c.req.param(),
      url: c.req.path + (c.req.url.includes('?') ? new URL(c.req.url).search : ''),
      layout: page.layout === false ? false : page.layout || page.pageMeta?.layout || 'default',
      errors: actionErrors,
      head: page.pageMeta?.head
    };

    if (isPagesRequest(c)) {
      return pageJsonResponse(pageObj);
    }

    if (method === 'POST' && actionResult instanceof Response) {
      return actionResult;
    }

    const currentLocale = (c.get('locale') as string) || getLocale();
    const renderContext: PageRenderContext = {
      locale: currentLocale,
      localeDir: getLocaleDir(currentLocale)
    };

    const html = await renderPage(pageObj, pageAssetTags ?? {}, pageRenderer ?? null, 'app', renderContext);
    return c.html(html, method === 'POST' && actionErrors ? { status: 422 } : undefined);
  }

  for (const page of pages) {
    if (page.isReuse) continue;
    const honoPath = convertUbeanRoutePath(page.route);
    app.on(['GET'], honoPath, (c: Context<UbeanEnv>) => handlePageRequest(c, page, 'GET'));
    app.on(['POST'], honoPath, (c: Context<UbeanEnv>) => handlePageRequest(c, page, 'POST'));
  }
}

export function createRouteLoader(importMetaGlob: Record<string, () => Promise<any>>) {
  return Object.fromEntries(
    Object.entries(importMetaGlob).map(([key, loader]) => {
      const normalized = key.replace(/^\.\//, '');
      return [normalized, loader];
    })
  );
}
