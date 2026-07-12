import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defu } from 'defu';
import { dirname, join } from 'pathe';
import {
  parseIconName,
  registerCollection,
  registerCollectionLoader,
  scanVueSfcForIcons,
  clearCollections
} from './core';
import type { IconifyCollection, UbeanIconOptions, ResolvedUbeanIconOptions } from './types';

const VIRTUAL_MODULE_ID = 'virtual:ubean-icon';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

const defaultOptions: ResolvedUbeanIconOptions = {
  collections: {},
  fallbackToApi: true,
  iconApiEndpoint: 'https://api.iconify.design',
  ssr: true,
  cssSelectorPrefix: 'i-',
  cssWherePseudo: true,
  iconifyApiEnabled: true
};

export function ubeanIconPlugin(userOptions: UbeanIconOptions = {}): Plugin {
  const options = defu(userOptions, defaultOptions) as ResolvedUbeanIconOptions;
  const scannedIcons = new Set<string>();
  const resolvedCollectionPaths = new Map<string, string | null>();
  let isBuild = false;
  let rootDir = '';

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

  function generateVirtualModule(): string {
    const collectionsToRegister: Array<{ prefix: string; data: IconifyCollection }> = [];

    for (const [prefix, collection] of Object.entries(options.collections)) {
      if (typeof collection === 'function') continue;
      collectionsToRegister.push({ prefix, data: collection });
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
import { registerCollection, registerCollectionLoader } from 'ubean-icon/runtime';

const collections = ${collectionsJson};
for (const [prefix, data] of Object.entries(collections)) {
  registerCollection(data);
}
${loaderCode}

export const iconOptions = ${JSON.stringify({
      fallbackToApi: options.fallbackToApi,
      iconApiEndpoint: options.iconApiEndpoint,
      ssr: options.ssr,
      iconifyApiEnabled: options.iconifyApiEnabled
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

      clearCollections();
      for (const [prefix, collection] of Object.entries(options.collections)) {
        if (typeof collection !== 'function') {
          registerCollection(collection);
        } else {
          registerCollectionLoader({ prefix, load: collection });
        }
      }
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
      server.watcher.on('change', (file: string) => {
        if (/\.(vue|tsx?|jsx?)$/.test(file)) {
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (module) {
            server.moduleGraph.invalidateModule(module);
          }
        }
      });

      if (options.iconifyApiEnabled && options.fallbackToApi) {
        const iconifyHandler = async (req: any, res: any, next: any) => {
          if (!req.url) return next();
          try {
            const url = new URL(req.url, 'http://localhost');
            const targetPath = url.pathname.replace(/^\//, '');
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
