import { createRouter, addRoute, findRoute } from 'rou3';
import type { RouterContext } from 'rou3';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLayout } from './types';

export interface CompiledRoute {
  method: string;
  path: string;
  id: string;
  filePath: string;
  meta?: Record<string, unknown>;
}

export interface CompiledMiddleware {
  path: string;
  filePath: string;
  order: number;
  global: boolean;
}

export interface CompiledPage {
  name: string;
  path: string;
  filePath: string;
  layout?: string;
  reuseTarget?: string;
}

export interface CompiledLayout {
  name: string;
  filePath: string;
  isDefault: boolean;
}

export class UbeanRouter {
  private apiContext: RouterContext<CompiledRoute>;
  private middlewares: CompiledMiddleware[];
  private pages: Map<string, CompiledPage>;
  private layouts: Map<string, CompiledLayout>;

  constructor() {
    this.apiContext = createRouter<CompiledRoute>();
    this.middlewares = [];
    this.pages = new Map();
    this.layouts = new Map();
  }

  addApiRoute(route: ScannedApiRoute): void {
    const data: CompiledRoute = {
      method: route.method?.toUpperCase() || 'ALL',
      path: route.route,
      id: `${route.method}:${route.route}`,
      filePath: route.fullPath
    };
    addRoute(this.apiContext, data.method, route.route, data);
  }

  addMiddleware(mw: ScannedMiddleware): void {
    this.middlewares.push({
      path: '/**',
      filePath: mw.fullPath,
      order: mw.order,
      global: mw.global
    });
    this.middlewares.sort((a, b) => a.order - b.order);
  }

  addPage(page: ScannedPageRoute): void {
    this.pages.set(page.name, {
      name: page.name,
      path: page.route,
      filePath: page.fullPath,
      layout: page.layout,
      reuseTarget: page.reuseTarget
    });
  }

  addLayout(layout: ScannedLayout): void {
    this.layouts.set(layout.name, {
      name: layout.name,
      filePath: layout.fullPath,
      isDefault: layout.isDefault
    });
  }

  matchApi(method: string, path: string): CompiledRoute | undefined {
    return findRoute(this.apiContext, method.toUpperCase(), path)?.data;
  }

  getMiddlewares(): CompiledMiddleware[] {
    return [...this.middlewares];
  }

  getPages(): CompiledPage[] {
    return [...this.pages.values()];
  }

  getPage(name: string): CompiledPage | undefined {
    return this.pages.get(name);
  }

  getLayout(name: string): CompiledLayout | undefined {
    return this.layouts.get(name);
  }

  getDefaultLayout(): CompiledLayout | undefined {
    return [...this.layouts.values()].find(l => l.isDefault);
  }

  getLayouts(): CompiledLayout[] {
    return [...this.layouts.values()];
  }

  getPageRouteNames(): string[] {
    return [...this.pages.keys()];
  }
}

let _router: UbeanRouter | null = null;

export function useRouter(): UbeanRouter {
  if (!_router) {
    _router = new UbeanRouter();
  }
  return _router;
}

export function createUbeanRouter(): UbeanRouter {
  _router = new UbeanRouter();
  return _router;
}
