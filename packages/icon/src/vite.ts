import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defu } from 'defu';
import { join, resolve, basename, dirname } from 'pathe';
import {
  parseIconName,
  registerCollection,
  registerCollectionLoader,
  scanVueSfcForIcons,
  clearCollections,
  createCollectionFromSvgMap,
  parseSvgToIconData
} from './core';
import type { IconifyCollection, UbeanIconOptions, ResolvedUbeanIconOptions, ResolvedCustomCollection } from './types';

const VIRTUAL_MODULE_ID = 'virtual:ubean-icon';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

const defaultOptions: Omit<ResolvedUbeanIconOptions, 'collections' | 'customCollections'> = {
  fallbackToApi: true,
  iconApiEndpoint: 'https://api.iconify.design',
  ssr: true,
  cssSelectorPrefix: 'i-',
  cssWherePseudo: true,
  iconifyApiEnabled: true
};

function resolveCustomCollections(
  rootDir: string,
  customCollections: UbeanIconOptions['customCollections']
): Record<string, ResolvedCustomCollection> {
  const result: Record<string, ResolvedCustomCollection> = {};
  if (!customCollections) return result;

  for (const [key, config] of Object.entries(customCollections)) {
    if (typeof config === 'string') {
      result[key] = {
        prefix: key,
        dir: resolve(rootDir, config),
        normalizeIconName: (name: string) =>
          name
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
      };
    } else {
      result[key] = {
        prefix: config.prefix || key,
        dir: resolve(rootDir, config.dir),
        normalizeIconName:
          config.normalizeIconName ||
          ((name: string) =>
            name
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, ''))
      };
    }
  }

  return result;
}

function scanSvgDirectory(
  dir: string,
  normalizeFn: (name: string) => string,
  prefixPath: string = ''
): Record<string, string> {
  const icons: Record<string, string> = {};
  if (!existsSync(dir)) return icons;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const subPrefix = prefixPath ? `${prefixPath}-${entry}` : entry;
      const subIcons = scanSvgDirectory(fullPath, normalizeFn, subPrefix);
      Object.assign(icons, subIcons);
    } else if (stat.isFile() && /\.svg$/i.test(entry)) {
      const name = basename(entry, '.svg');
      const iconName = normalizeFn(prefixPath ? `${prefixPath}-${name}` : name);
      if (iconName) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          icons[iconName] = content;
        } catch {
          // skip
        }
      }
    }
  }

  return icons;
}

function loadCustomCollections(
  resolvedCustoms: Record<string, ResolvedCustomCollection>
): Array<{ prefix: string; collection: IconifyCollection }> {
  const result: Array<{ prefix: string; collection: IconifyCollection }> = [];

  for (const [, config] of Object.entries(resolvedCustoms)) {
    if (!existsSync(config.dir)) continue;
    const svgMap = scanSvgDirectory(config.dir, config.normalizeIconName);
    if (Object.keys(svgMap).length > 0) {
      const collection = createCollectionFromSvgMap(config.prefix, svgMap);
      result.push({ prefix: config.prefix, collection });
    }
  }

  return result;
}

function serveSvgFromCustomCollection(
  urlPath: string,
  resolvedCustoms: Record<string, ResolvedCustomCollection>
): { contentType: string; content: string } | null {
  const match = urlPath.match(/^\/([^/]+)\/(.+)\.svg$/);
  if (!match) return null;
  const [, prefix, iconName] = match;

  for (const [, config] of Object.entries(resolvedCustoms)) {
    if (config.prefix !== prefix) continue;
    if (!existsSync(config.dir)) continue;

    const iconFile = findSvgFile(config.dir, iconName, config.normalizeIconName);
    if (iconFile) {
      const svg = readFileSync(iconFile, 'utf-8');
      const data = parseSvgToIconData(svg);
      if (data) {
        const width = data.width || 24;
        const height = data.height || 24;
        const viewBox = data.viewBox || `0 0 ${width} ${height}`;
        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" fill="currentColor">${data.body}</svg>`;
        return { contentType: 'image/svg+xml', content: fullSvg };
      }
    }
  }

  return null;
}

function findSvgFile(dir: string, iconName: string, normalizeFn: (name: string) => string): string | null {
  if (!existsSync(dir)) return null;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const normalizedDir = normalizeFn(entry);
      if (iconName.startsWith(`${normalizedDir}-`)) {
        const remaining = iconName.slice(normalizedDir.length + 1);
        const found = findSvgFile(fullPath, remaining, normalizeFn);
        if (found) return found;
      }
    } else if (stat.isFile() && /\.svg$/i.test(entry)) {
      const name = basename(entry, '.svg');
      if (normalizeFn(name) === iconName) {
        return fullPath;
      }
    }
  }

  return null;
}

export function ubeanIconPlugin(userOptions: UbeanIconOptions = {}): Plugin {
  const options = defu(userOptions, defaultOptions) as ResolvedUbeanIconOptions;
  const scannedIcons = new Set<string>();
  const resolvedCollectionPaths = new Map<string, string | null>();
  const customCollectionsCache = new Map<string, IconifyCollection>();
  let isBuild = false;
  let rootDir = '';
  let resolvedCustoms: Record<string, ResolvedCustomCollection> = {};

  function resolveCollectionPath(prefix: string): string | null {
    if (resolvedCollectionPaths.has(prefix)) {
      return resolvedCollectionPaths.get(prefix)!;
    }
    const pkgName = `@iconify-json/${prefix}`;
    try {
      const path = dirname(require.resolve(`${pkgName}/icons.json`, { paths: [rootDir] }));
      resolvedCollectionPaths.set(prefix, path);
      return path;
    } catch {
      resolvedCollectionPaths.set(prefix, null);
      return null;
    }
  }

  function loadCollectionDataSync(prefix: string): IconifyCollection | null {
    if (customCollectionsCache.has(prefix)) {
      return customCollectionsCache.get(prefix)!;
    }
    const path = resolveCollectionPath(prefix);
    if (!path) return null;
    try {
      const content = readFileSync(join(path, 'icons.json'), 'utf-8');
      return JSON.parse(content) as IconifyCollection;
    } catch {
      return null;
    }
  }

  function scanSourceForIcons(source: string, id: string): void {
    if (id.includes('node_modules')) return;
    if (!/\.(vue|tsx?|jsx?)$/.test(id)) return;

    const icons = scanVueSfcForIcons(source);
    for (const icon of icons) {
      scannedIcons.add(icon);
    }
  }

  function refreshCustomCollections() {
    for (const [prefix] of customCollectionsCache) {
      customCollectionsCache.delete(prefix);
    }
    const customs = loadCustomCollections(resolvedCustoms);
    for (const { prefix, collection } of customs) {
      customCollectionsCache.set(prefix, collection);
      registerCollection(collection);
    }
  }

  function generateVirtualModule(): string {
    const collectionsToRegister: Array<{ prefix: string; data: IconifyCollection }> = [];

    for (const [prefix, collection] of Object.entries(options.collections)) {
      if (typeof collection === 'function') continue;
      collectionsToRegister.push({ prefix, data: collection });
    }

    for (const [prefix, collection] of customCollectionsCache) {
      if (!collectionsToRegister.some(c => c.prefix === prefix)) {
        collectionsToRegister.push({ prefix, data: collection });
      }
    }

    if (isBuild) {
      for (const iconName of scannedIcons) {
        const parsed = parseIconName(iconName);
        if (!parsed) continue;
        if (collectionsToRegister.some(c => c.prefix === parsed.collection)) continue;

        const data = loadCollectionDataSync(parsed.collection);
        if (data) {
          collectionsToRegister.push({ prefix: parsed.collection, data });
        }
      }
    }

    const collectionsJson = JSON.stringify(Object.fromEntries(collectionsToRegister.map(c => [c.prefix, c.data])));

    const loaderPrefixes = new Set<string>();
    for (const [prefix, collection] of Object.entries(options.collections)) {
      if (typeof collection === 'function') {
        loaderPrefixes.add(prefix);
      }
    }
    for (const iconName of scannedIcons) {
      const parsed = parseIconName(iconName);
      if (!parsed) continue;
      if (collectionsToRegister.some(c => c.prefix === parsed.collection)) continue;
      if (customCollectionsCache.has(parsed.collection)) continue;
      loaderPrefixes.add(parsed.collection);
    }

    let loaderCode = '';
    for (const prefix of loaderPrefixes) {
      const hasPkg = resolveCollectionPath(prefix) !== null;
      const importPath = hasPkg ? `@iconify-json/${prefix}/icons.json` : '';
      if (importPath) {
        loaderCode += `
  registerCollectionLoader({
    prefix: '${prefix}',
    load: async () => {
      const data = await import(/* @vite-ignore */ '${importPath}');
      return data.default || data;
    }
  });`;
      }
    }

    return `
import { registerCollection, registerCollectionLoader } from '@ubean/icon/runtime';

const collections = ${collectionsJson};
for (const [prefix, data] of Object.entries(collections)) {
  registerCollection(data);
}
${loaderCode}

export const iconOptions = ${JSON.stringify({
      fallbackToApi: options.fallbackToApi,
      iconApiEndpoint: options.iconApiEndpoint,
      ssr: options.ssr,
      iconifyApiEnabled: options.iconifyApiEnabled,
      customCollectionPrefixes: Object.values(resolvedCustoms).map(c => c.prefix)
    })};

export function getScannedIcons() {
  return ${JSON.stringify([...scannedIcons])};
}
`;
  }

  return {
    name: 'ubean:icon',
    enforce: 'pre',

    configResolved(config) {
      rootDir = config.root;
      isBuild = config.command === 'build';
      resolvedCustoms = resolveCustomCollections(rootDir, options.customCollections);

      clearCollections();
      for (const [prefix, collection] of Object.entries(options.collections)) {
        if (typeof collection !== 'function') {
          registerCollection(collection);
        } else {
          registerCollectionLoader({ prefix, load: collection });
        }
      }
      refreshCustomCollections();
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generateVirtualModule();
      }
      return null;
    },

    transform(code, id) {
      scanSourceForIcons(code, id);
      return null;
    },

    configureServer(server) {
      const customDirs = Object.values(resolvedCustoms).map(c => c.dir);
      for (const dir of customDirs) {
        if (existsSync(dir)) {
          server.watcher.add(dir);
        }
      }

      server.watcher.on('change', (file: string) => {
        const isInCustomDir = customDirs.some(dir => file.startsWith(dir)) || /\.(vue|tsx?|jsx?)$/.test(file);
        if (isInCustomDir) {
          if (file.endsWith('.svg')) {
            refreshCustomCollections();
          }
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.watcher.on('add', (file: string) => {
        if (file.endsWith('.svg') && customDirs.some(dir => file.startsWith(dir))) {
          refreshCustomCollections();
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
          server.ws.send({ type: 'full-reload' });
        }
      });

      server.watcher.on('unlink', (file: string) => {
        if (file.endsWith('.svg') && customDirs.some(dir => file.startsWith(dir))) {
          refreshCustomCollections();
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
          server.ws.send({ type: 'full-reload' });
        }
      });

      if (options.iconifyApiEnabled && options.fallbackToApi) {
        const iconifyHandler = async (req: any, res: any, next: any) => {
          if (!req.url) return next();
          try {
            const url = new URL(req.url, 'http://localhost');
            const targetPath = url.pathname.replace(/^\//, '');

            const customResult = serveSvgFromCustomCollection(`/${targetPath}`, resolvedCustoms);
            if (customResult) {
              res.setHeader('Content-Type', customResult.contentType);
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              res.statusCode = 200;
              res.end(customResult.content);
              return;
            }

            const match = targetPath.match(/^([^/]+)\/(.+)\.svg$/);
            if (!match) return next();

            const [, prefix, icon] = match;
            const apiUrl = `${options.iconApiEndpoint}/${prefix}/${icon}.svg`;
            const apiRes = await fetch(apiUrl);
            if (!apiRes.ok) return next();

            const svg = await apiRes.text();
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.statusCode = 200;
            res.end(svg);
          } catch {
            next();
          }
        };
        server.middlewares.use('/_iconify', (req, res, next) => {
          Promise.resolve(iconifyHandler(req, res, next)).catch(next);
        });
      }
    }
  };
}

export function addIconCollection(
  pluginOptions: UbeanIconOptions,
  prefix: string,
  collection: IconifyCollection
): void {
  pluginOptions.collections = pluginOptions.collections || {};
  pluginOptions.collections[prefix] = collection;
}

export type { UbeanIconOptions, IconifyCollection };
