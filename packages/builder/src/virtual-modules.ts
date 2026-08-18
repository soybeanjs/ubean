import type { CompiledRoute, CompiledPage, CompiledLayout, CompiledMiddleware } from '@ubean/routes';
import type { ScannedApiRoute, ScannedMiddleware, ScannedPageRoute, ScannedLocale } from '@ubean/scan';
import { relative, isAbsolute } from 'pathe';
import { defineVirtualModule } from '@ubean/build-core';

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
  srcDir: string = 'src'
) {
  return defineVirtualModule('ubean:locales', () => {
    // JSON.stringify(undefined) 返回 undefined（值，非字符串），插入模板会变成
    // "const defaultCode = undefined;" —— 这会让 `defaultCode && ...` 短路逻辑
    // 仍能工作，但语义上 defaultCode 应为 null（明确的"无默认值"）。
    const defaultCode = defaultLocale == null ? 'null' : JSON.stringify(defaultLocale);
    const viteSrcDir = toVitePath(srcDir);
    const prefix = viteSrcDir === '/' || viteSrcDir === '' ? '' : viteSrcDir;
    const localesGlob = JSON.stringify(`${prefix}/locales/**/*.{json,json5,yaml,yml,js,mjs,cjs,ts,mts,cts}`);
    const srcPrefix = JSON.stringify(`${prefix || ''}/locales/`);

    return `
import { defineLocale, setLocale, mergeLocale } from 'ubean/runtime/i18n';

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
      const hasMeta = typeof data.name === 'string' || data.dir === 'ltr' || data.dir === 'rtl' || typeof data.isDefault === 'boolean';
      const isWrapper = hasMeta && typeof data.messages === 'object' && data.messages !== null;
      const messages = isWrapper ? data.messages : data;
      const options = {
        name: isWrapper ? data.name : undefined,
        dir: isWrapper ? (data.dir || 'ltr') : 'ltr',
        isDefault: isDefault || (isWrapper ? data.isDefault : false)
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
      const hasMeta = typeof data.name === 'string' || data.dir === 'ltr' || data.dir === 'rtl' || typeof data.isDefault === 'boolean';
      const isWrapper = hasMeta && typeof data.messages === 'object' && data.messages !== null;
      const messages = isWrapper ? data.messages : data;
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
