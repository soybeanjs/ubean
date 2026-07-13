import type { Context, Next, MiddlewareHandler } from 'hono';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from '../core/routing/types';
import type { RouteMeta, UbeanEnv, UbeanMiddleware } from '../types/handler';
import { getLocale, getLocaleDir } from './i18n';
import type { UbeanApp } from './app';
import { extractRouteMeta, isHandlerChain } from './handler';
import { isPagesRequest, pageJsonResponse, renderPage } from './pages';
import type { PageObject, PageRenderer, PageAssetTags, PageRenderContext } from './pages';

export interface RegisterOptions {
  routes: ScannedApiRoute[];
  middleware: ScannedMiddleware[];
  pages: ScannedPageRoute[];
  layouts?: ScannedLayout[];
  routeLoaders: Record<string, () => Promise<Record<string, unknown>>>;
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

function matchMiddlewarePath(mountPath: string, routePath: string): boolean {
  if (mountPath === '*' || mountPath === '/*') return true;
  if (mountPath.endsWith('/*')) {
    const prefix = mountPath.slice(0, -1);
    return routePath === prefix.slice(0, -1) || routePath.startsWith(prefix);
  }
  return routePath === mountPath;
}

function resolveRouteExport(mod: Record<string, unknown>, method: Method): MiddlewareHandler[] | Function | null {
  const namedHandler = mod[method];
  if (isHandlerChain(namedHandler)) return namedHandler;
  if (typeof namedHandler === 'function') return namedHandler as Function;

  const lowerHandler = mod[method.toLowerCase()];
  if (isHandlerChain(lowerHandler)) return lowerHandler;
  if (typeof lowerHandler === 'function') return lowerHandler as Function;

  if (isHandlerChain(mod.default)) return mod.default as MiddlewareHandler[];
  if (typeof mod.default === 'function') return mod.default as Function;

  return null;
}

export async function registerRoutes(app: UbeanApp, options: RegisterOptions) {
  const {
    routes,
    middleware,
    pages,
    layouts = [],
    routeLoaders,
    middlewareLoaders,
    pageRenderer,
    pageAssetTags,
    pageLoaders
  } = options;

  const hasDefaultLayout = layouts.some(l => l.isDefault);

  const sortedMiddleware = [...middleware].sort((a, b) => a.order - b.order);

  interface LoadedMiddleware {
    mountPath: string;
    handler: MiddlewareHandler<UbeanEnv>;
  }

  const loadedUserMiddleware: LoadedMiddleware[] = [];

  for (const mw of sortedMiddleware) {
    await app.hooks.callHook('middleware:register', mw);
    const loader = middlewareLoaders[mw.relativePath];
    if (loader) {
      try {
        const mod = await loader();
        if (mod.default) {
          const mountPath = mw.global ? '*' : middlewarePathToHonoPath(mw.relativePath);
          loadedUserMiddleware.push({ mountPath, handler: mod.default as MiddlewareHandler<UbeanEnv> });
        }
      } catch {
        // ignore loading errors in dev
      }
    }
  }

  function getMatchingMiddleware(routePath: string): MiddlewareHandler<UbeanEnv>[] {
    return loadedUserMiddleware.filter(mw => matchMiddlewarePath(mw.mountPath, routePath)).map(mw => mw.handler);
  }

  interface RouteEntry {
    definition: MiddlewareHandler[] | Function;
    fileMeta?: Record<string, unknown>;
  }

  const routesByPath = new Map<string, Map<Method, RouteEntry>>();

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

    let pathMethods = routesByPath.get(honoPath);
    if (!pathMethods) {
      pathMethods = new Map();
      routesByPath.set(honoPath, pathMethods);
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

      const resolved = resolveRouteExport(mod, method);
      if (resolved) {
        pathMethods.set(method, { definition: resolved, fileMeta: first.fileMeta });
      }
    }
  }

  for (const [honoPath, pathMethods] of routesByPath) {
    for (const [method, entry] of pathMethods) {
      const { definition, fileMeta } = entry;
      const matchingMiddleware = getMatchingMiddleware(honoPath);

      if (isHandlerChain(definition)) {
        const routeMeta = { ...extractRouteMeta(definition) } as RouteMeta;
        if (fileMeta) {
          Object.assign(routeMeta, fileMeta);
        }

        await app.hooks.callHook('route:register', {
          method,
          path: honoPath,
          handler: definition,
          meta: routeMeta
        });

        const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
          c.set('route', { meta: routeMeta, path: c.req.path, method: c.req.method });
          await next();
        };

        const honoHandlers = [metaMiddleware, ...matchingMiddleware, ...definition];
        (app as any)[honoMethod(method)](honoPath, ...honoHandlers);
      } else {
        const routeMeta = { requiresAuth: true, ...fileMeta } as RouteMeta;

        const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
          c.set('route', { meta: routeMeta, path: c.req.path, method: c.req.method });
          await next();
        };

        const handlerWrapper = async (c: Context<UbeanEnv>) => {
          const result = await (definition as Function)(c);
          if (result instanceof Response) return result;
          if (typeof result === 'string') {
            return new Response(result, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
          }
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        };

        await app.hooks.callHook('route:register', {
          method,
          path: honoPath,
          handler: definition,
          meta: routeMeta
        });

        const honoHandlers = [metaMiddleware, ...matchingMiddleware, handlerWrapper];
        (app as any)[honoMethod(method)](honoPath, ...honoHandlers);
      }
    }
  }

  async function handlePageRequest(c: Context<UbeanEnv>, page: ScannedPageRoute, method: 'GET' | 'POST') {
    c.set('route', {
      meta: { requiresAuth: page.pageMeta?.requiresAuth ?? true } as RouteMeta,
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
      layout:
        page.layout === false ? false : page.layout || page.pageMeta?.layout || (hasDefaultLayout ? 'default' : false),
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
    const matchingMiddleware = getMatchingMiddleware(honoPath);
    const pageMeta = { requiresAuth: page.pageMeta?.requiresAuth ?? true } as RouteMeta;

    const metaMiddleware = async (c: Context<UbeanEnv>, next: Next) => {
      c.set('route', { meta: pageMeta, path: c.req.path, method: c.req.method });
      await next();
    };

    const pageHandler = (method: 'GET' | 'POST') => async (c: Context<UbeanEnv>) => handlePageRequest(c, page, method);

    app.on(['GET'], honoPath, metaMiddleware, ...matchingMiddleware, pageHandler('GET'));
    app.on(['POST'], honoPath, metaMiddleware, ...matchingMiddleware, pageHandler('POST'));
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
