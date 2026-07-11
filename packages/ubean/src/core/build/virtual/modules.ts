import type { CompiledRoute, CompiledPage, CompiledLayout, CompiledMiddleware } from '../../routing/router';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute } from '../../routing/types';
import { defineVirtualModule } from './registry';

export function createRoutingVirtualModule(routes: CompiledRoute[], middlewares: CompiledMiddleware[]) {
  return defineVirtualModule('ubean:routes', () => {
    const routesCode = routes
      .map(
        r =>
          `  { method: ${JSON.stringify(r.method)}, path: ${JSON.stringify(r.path)}, id: ${JSON.stringify(r.id)}, filePath: ${JSON.stringify(r.filePath)} }`
      )
      .join(',\n');

    const mwCode = middlewares
      .map(
        m =>
          `  { path: ${JSON.stringify(m.path)}, filePath: ${JSON.stringify(m.filePath)}, order: ${m.order}, global: ${m.global} }`
      )
      .join(',\n');

    return `export const routes = [\n${routesCode}\n];\nexport const middlewares = [\n${mwCode}\n];\nexport default { routes, middlewares };`;
  });
}

export function createPagesVirtualModule(pages: CompiledPage[], layouts: CompiledLayout[]) {
  return defineVirtualModule('ubean:pages', () => {
    const pagesEntries = pages
      .map(
        p =>
          `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, path: ${JSON.stringify(p.path)}, filePath: ${JSON.stringify(p.filePath)}, layout: ${JSON.stringify(p.layout)}, reuseTarget: ${JSON.stringify(p.reuseTarget)} }`
      )
      .join(',\n');

    const layoutEntries = layouts
      .map(
        l =>
          `  ${JSON.stringify(l.name)}: { name: ${JSON.stringify(l.name)}, filePath: ${JSON.stringify(l.filePath)}, isDefault: ${l.isDefault} }`
      )
      .join(',\n');

    const pageNames = pages.map(p => JSON.stringify(p.name)).join(' | ') || 'string';
    const layoutNames = layouts.map(l => JSON.stringify(l.name)).join(' | ') || 'string';

    return `export const pages = {\n${pagesEntries}\n};\nexport const layouts = {\n${layoutEntries}\n};\nexport type RouteName = ${pageNames};\nexport type LayoutName = ${layoutNames};\nexport default { pages, layouts };`;
  });
}

export function createMetaVirtualModule() {
  return defineVirtualModule('ubean:meta', () => {
    return `export const UBEAN_VERSION = "0.0.1";\nexport default { version: UBEAN_VERSION };`;
  });
}

export function createAppVirtualModule(
  apiRoutes: ScannedApiRoute[],
  middlewares: ScannedMiddleware[],
  pages: ScannedPageRoute[],
  _srcDir: string
) {
  return defineVirtualModule('ubean:app-config', () => {
    const routesJson = apiRoutes.map(r =>
      JSON.stringify({
        relativePath: r.relativePath,
        route: r.route,
        method: r.method,
        env: r.env
      })
    );
    const middlewareJson = middlewares.map(m =>
      JSON.stringify({
        relativePath: m.relativePath,
        order: m.order,
        global: m.global
      })
    );
    const pagesJson = pages.map(p =>
      JSON.stringify({
        relativePath: p.relativePath,
        name: p.name,
        route: p.route,
        isReuse: p.isReuse,
        layout: p.layout
      })
    );

    return `
const routeModules = import.meta.glob(['/src/routes/**/*.{ts,js,mjs}'], { eager: false });
const middlewareModules = import.meta.glob(['/src/middleware/**/*.{ts,js,mjs}'], { eager: false });
const pageModules = import.meta.glob(['/src/pages/**/*.{vue,ts,tsx,js,jsx}'], { eager: false });

function normalizeKey(p) {
  return p.replace(/^/src/(routes|middleware|pages)//, '').replace(/^/@fs/.*/src/(routes|middleware|pages)//, '');
}

export const routeLoaders = {};
for (const [key, loader] of Object.entries(routeModules)) {
  routeLoaders[normalizeKey(key)] = loader;
}

export const middlewareLoaders = {};
for (const [key, loader] of Object.entries(middlewareModules)) {
  middlewareLoaders[normalizeKey(key)] = loader;
}

export const pageLoaders = {};
for (const [key, loader] of Object.entries(pageModules)) {
  pageLoaders[normalizeKey(key)] = loader;
}

export const apiRoutes = [${routesJson.join(',')}];
export const middlewares = [${middlewareJson.join(',')}];
export const pages = [${pagesJson.join(',')}];

export default { routeLoaders, middlewareLoaders, pageLoaders, apiRoutes, middlewares, pages };
`;
  });
}
