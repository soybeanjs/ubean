import { defineVirtualModule } from '@ubean/build-core';
import type { CompiledRoute, CompiledPage, CompiledLayout, CompiledMiddleware } from '@ubean/routes';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLocale } from '@ubean/scan';
import { relative, isAbsolute } from 'pathe';

function toVitePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Convert an absolute file path to a project-root-relative POSIX path.
 *
 * Generated virtual modules should NOT embed absolute paths — they leak the
 * developer's filesystem layout into build artifacts and cause spurious git
 * diffs across machines. This helper normalizes `filePath` fields to
 * portable project-relative paths (e.g. `src/pages/about.vue`).
 */
function toPortableFilePath(fullPath: string, cwd: string): string {
  if (!fullPath) return fullPath;
  const rel = isAbsolute(fullPath) ? relative(cwd, fullPath) : fullPath;
  return rel.replace(/\\/g, '/');
}

export function createRoutingVirtualModule(routes: CompiledRoute[], middlewares: CompiledMiddleware[], cwd: string) {
  return defineVirtualModule('ubean:routes', () => {
    const routesCode = routes
      .map(
        r =>
          `  { method: ${JSON.stringify(r.method)}, path: ${JSON.stringify(r.path)}, id: ${JSON.stringify(r.id)}, filePath: ${JSON.stringify(toPortableFilePath(r.filePath, cwd))} }`
      )
      .join(',\n');

    const mwCode = middlewares
      .map(
        m =>
          `  { path: ${JSON.stringify(m.path)}, filePath: ${JSON.stringify(toPortableFilePath(m.filePath, cwd))}, order: ${m.order}, global: ${m.global} }`
      )
      .join(',\n');

    return `export const routes = [\n${routesCode}\n];\nexport const middlewares = [\n${mwCode}\n];\nexport default { routes, middlewares };`;
  });
}

export function createPagesVirtualModule(pages: CompiledPage[], layouts: CompiledLayout[], cwd: string) {
  return defineVirtualModule('ubean:pages', () => {
    const pagesEntries = pages
      .map(
        p =>
          `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, path: ${JSON.stringify(p.path)}, filePath: ${JSON.stringify(toPortableFilePath(p.filePath, cwd))}, layout: ${JSON.stringify(p.layout)}, reuseTarget: ${JSON.stringify(p.reuseTarget)} }`
      )
      .join(',\n');

    const layoutEntries = layouts
      .map(
        l =>
          `  ${JSON.stringify(l.name)}: { name: ${JSON.stringify(l.name)}, filePath: ${JSON.stringify(toPortableFilePath(l.filePath, cwd))}, isDefault: ${l.isDefault} }`
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
  srcDir: string
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

    const viteSrcDir = toVitePath(srcDir);
    const prefix = viteSrcDir === '/' || viteSrcDir === '' ? '' : viteSrcDir;
    const routesGlob = JSON.stringify(`${prefix}/routes/**/*.{ts,js,mjs}`);
    const middlewareGlob = JSON.stringify(`${prefix}/middleware/**/*.{ts,js,mjs}`);
    const pagesGlob = JSON.stringify(`${prefix}/pages/**/*.{vue,ts,tsx,js,jsx}`);

    return `
const routeModules = import.meta.glob([${routesGlob}], { eager: false });
const middlewareModules = import.meta.glob([${middlewareGlob}], { eager: false });
const pageModules = import.meta.glob([${pagesGlob}], { eager: false });

const _srcPrefix = ${JSON.stringify(prefix)};
function normalizeKey(p) {
  const prefixes = ['/routes/', '/middleware/', '/pages/'];
  for (const pf of prefixes) {
    const fullPf = _srcPrefix + pf;
    if (p.includes(fullPf)) {
      const idx = p.indexOf(fullPf);
      return p.slice(idx + fullPf.length);
    }
  }
  return p;
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

export function createLocalesVirtualModule(
  _locales: ScannedLocale[],
  defaultLocale: string | undefined,
  srcDir: string = 'src',
  i18nConfigJson?: string
) {
  return defineVirtualModule('ubean:locales', () => {
    const defaultCode = defaultLocale == null ? 'null' : JSON.stringify(defaultLocale);
    const viteSrcDir = toVitePath(srcDir);
    const prefix = viteSrcDir === '/' || viteSrcDir === '' ? '' : viteSrcDir;
    const localesGlob = JSON.stringify(`${prefix}/locales/**/*.{json,json5,yaml,yml,js,mjs,cjs,ts,mts,cts}`);
    const srcPrefix = JSON.stringify(`${prefix || ''}/locales/`);
    const configLiteral = i18nConfigJson ?? 'null';

    return `
export const i18nConfig = ${configLiteral};

const localeModules = import.meta.glob([${localesGlob}], { eager: false });

function parseLocalePath(path) {
  const withoutPrefix = path.replace(${srcPrefix}, '');
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

const cache = new Map();

function codesFromConfig() {
  if (!i18nConfig || !i18nConfig.locales) return [];
  return i18nConfig.locales.map(l => typeof l === 'string' ? l : l.code);
}

export const localeCodes = codesFromConfig();
const defaultCode = ${defaultCode};

let i18nRuntime = null;
if (import.meta.env.SSR) {
  i18nRuntime = await import('ubean/runtime/i18n');
  if (i18nConfig && i18nConfig.fallbackLocale) {
    i18nRuntime.setFallbackLocale(i18nConfig.fallbackLocale);
  } else if (defaultCode) {
    i18nRuntime.setFallbackLocale(defaultCode);
  }
}

async function collectMessages(code) {
  const localeData = { messages: {}, options: { isDefault: false, name: undefined, dir: 'ltr', language: undefined } };
  const configLoc = i18nConfig && i18nConfig.locales
    ? i18nConfig.locales.find(l => (typeof l === 'string' ? l : l.code) === code)
    : undefined;
  if (configLoc && typeof configLoc === 'object') {
    localeData.options.name = configLoc.name;
    localeData.options.dir = configLoc.dir || 'ltr';
    localeData.options.language = configLoc.language;
    localeData.options.isDefault = configLoc.code === (i18nConfig && i18nConfig.defaultLocale);
  }

  for (const [path, loader] of Object.entries(localeModules)) {
    const parsed = parseLocalePath(path);
    if (parsed.code !== code) continue;
    try {
      const mod = await loader();
      const data = mod.default || mod;
      const hasMeta = typeof data.name === 'string' || data.dir === 'ltr' || data.dir === 'rtl' || typeof data.isDefault === 'boolean';
      const isWrapper = hasMeta && typeof data.messages === 'object' && data.messages !== null;
      const messages = isWrapper ? data.messages : data;
      if (isWrapper) {
        if (data.name) localeData.options.name = data.name;
        if (data.dir) localeData.options.dir = data.dir;
        if (data.isDefault) localeData.options.isDefault = true;
      }
      if (parsed.isDefault) localeData.options.isDefault = true;
      if (parsed.namespace) {
        setNestedValue(localeData.messages, parsed.namespace.split('.'), messages);
      } else {
        Object.assign(localeData.messages, messages);
      }
    } catch (e) {
      console.warn('[ubean] Failed to load locale:', path, e);
    }
  }
  return localeData;
}

export async function loadLocale(code) {
  if (cache.has(code)) return cache.get(code);
  const { messages, options } = await collectMessages(code);
  if (i18nRuntime) {
    i18nRuntime.setLocaleMessages(code, messages);
    i18nRuntime.setLocaleMeta(code, options);
  }
  cache.set(code, messages);
  return messages;
}

export async function loadLocales() {
  const codes = localeCodes.length ? localeCodes : [...new Set(Object.keys(localeModules).map(p => parseLocalePath(p).code))];
  await Promise.all(codes.map(loadLocale));
}

export async function reloadLocale(path) {
  if (!path.includes('/locales/')) return;
  cache.clear();
  const { code } = parseLocalePath(path);
  await loadLocale(code);
}

if (i18nRuntime) {
  i18nRuntime.registerLocaleLoader(loadLocale);
}

export default { loadLocale, loadLocales, reloadLocale, localeCodes, i18nConfig };

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
