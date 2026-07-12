import type { CompiledRoute, CompiledPage, CompiledLayout, CompiledMiddleware } from '../../routing/router';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLocale } from '../../routing/types';
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
  return p.replace(/^\\/src\\/(routes|middleware|pages)\\//, '').replace(/^\\/@fs.*\\/src\\/(routes|middleware|pages)\\//, '');
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

export function createLocalesVirtualModule(_locales: ScannedLocale[], defaultLocale?: string) {
  return defineVirtualModule('ubean:locales', () => {
    const defaultCode = JSON.stringify(defaultLocale);
    return `
import { defineLocale, setLocale, mergeLocale } from 'ubean/runtime/i18n';

const localeModules = import.meta.glob(['/src/locales/**/*.{json,json5,yaml,yml,js,mjs,cjs,ts,mts,cts}'], { eager: false });

function parseLocalePath(path) {
  const withoutPrefix = path.replace(/^\\/src\\/locales\\//, '');
  const lastDot = withoutPrefix.lastIndexOf('.');
  const withoutExt = lastDot > 0 ? withoutPrefix.slice(0, lastDot) : withoutPrefix;
  const parts = withoutExt.split('/');
  const fileName = parts[parts.length - 1];
  const orderMatch = fileName.match(/^(\\d+)\\.(.+)$/);
  let code = orderMatch ? orderMatch[2] : fileName;
  let isDefault = code === 'default' || fileName.startsWith('default.');
  const dirParts = parts.slice(0, -1);

  let namespace;
  if (dirParts.length > 0) {
    const fileNameCode = code === 'index' ? undefined : code;
    code = fileNameCode || dirParts[dirParts.length - 1];
    namespace = dirParts.join('.');
    if (fileNameCode && fileNameCode !== code) {
      namespace = dirParts.join('.') + '.' + fileNameCode;
    }
  }

  if (isDefault && code === 'default') {
    code = 'en';
  }

  return { code, namespace, isDefault };
}

function setNestedValue(obj, path, value) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!current[key]) current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

let loaded = false;

export async function loadLocales() {
  if (loaded) return;
  loaded = true;

  const localeData = new Map();

  for (const [path, loader] of Object.entries(localeModules)) {
    try {
      const { code, namespace, isDefault } = parseLocalePath(path);
      const mod = await loader();
      const data = mod.default || mod;
      const messages = data.messages || data;
      const options = {
        name: data.name,
        dir: data.dir || 'ltr',
        isDefault: isDefault || data.isDefault
      };

      if (!localeData.has(code)) {
        localeData.set(code, { messages: {}, options: { isDefault: options.isDefault || isDefault, name: options.name, dir: options.dir } });
      }
      const entry = localeData.get(code);
      if (options.name) entry.options.name = options.name;
      if (options.dir) entry.options.dir = options.dir;
      if (options.isDefault) entry.options.isDefault = true;

      if (namespace) {
        setNestedValue(entry.messages, namespace.split('.'), messages);
      } else {
        Object.assign(entry.messages, messages);
      }
    } catch (e) {
      console.warn('[ubean] Failed to load locale:', path, e);
    }
  }

  for (const [code, { messages, options }] of localeData.entries()) {
    defineLocale({
      code,
      messages,
      name: options.name,
      dir: options.dir,
      isDefault: options.isDefault
    });
  }

  const defaultCode = ${defaultCode};
  if (defaultCode && localeData.has(defaultCode)) {
    setLocale(defaultCode);
  } else if (localeData.size > 0) {
    const firstDefault = [...localeData.entries()].find(([, v]) => v.options.isDefault);
    if (firstDefault) {
      setLocale(firstDefault[0]);
    } else {
      setLocale([...localeData.keys()][0]);
    }
  }
}

export async function reloadLocale(path) {
  if (!path.includes('/locales/')) return;
  try {
    const loader = localeModules[path];
    if (loader) {
      const { code, namespace } = parseLocalePath(path);
      const mod = await loader();
      const data = mod.default || mod;
      const messages = data.messages || data;
      const merged = {};
      if (namespace) {
        setNestedValue(merged, namespace.split('.'), messages);
      } else {
        Object.assign(merged, messages);
      }
      mergeLocale(code, merged);
    }
  } catch (e) {
    console.warn('[ubean] Failed to reload locale:', path, e);
  }
}

export default { loadLocales, reloadLocale };

if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) {
      for (const path of Object.keys(localeModules)) {
        mod.reloadLocale(path);
      }
    }
  });
}
`;
  });
}
