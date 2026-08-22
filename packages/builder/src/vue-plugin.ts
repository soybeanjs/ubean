import { createRequire } from 'node:module';
import { transformWithOxc } from 'vite';
import type { Plugin } from 'vite';
import Components from 'unplugin-vue-components/vite';
import Markdown from 'unplugin-vue-markdown/vite';
import AutoImport from 'unplugin-auto-import/vite';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { getColorModeScript, resolveColorModeConfig, getPartyTownScript, resolvePartyTownConfig } from '@ubean/client';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { getVueLocaleParam } from '@ubean/i18n';
import { ubeanMdxPlugin } from '@ubean/markdown';
import { renderFaviconLink } from '@ubean/pages';
import { scanProject } from '@ubean/scan';
import { join } from 'pathe';
import type { InlinePreset } from 'unimport';
import { UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET } from './codegen';
import { getComponentResolvers } from './registry';
import { ssrSingletonDevPolicy } from './ssr-singleton';
import { useVirtualRegistry } from './virtual-registry';
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from './vue-virtual-modules';

export interface UbeanViteOptions {
  config: UbeanResolvedConfig;
  ssr?: boolean;
}

export const VUE_PLUGIN_INCLUDE = [/\.vue$/, /\.md$/];

const VIRTUAL_PAGES = 'virtual:ubean-pages';
const VIRTUAL_APP = 'virtual:ubean-app';
const VIRTUAL_CLIENT = 'virtual:ubean-client-entry';
const VIRTUAL_SERVER = 'virtual:ubean-server';
const CLIENT_ENTRY_URL = `/@id/${VIRTUAL_CLIENT}`;

// Virtual modules that contain TypeScript code
const TS_VIRTUAL_IDS = [VIRTUAL_PAGES, VIRTUAL_APP, VIRTUAL_SERVER];
const VIRTUAL_IDS = [VIRTUAL_PAGES, VIRTUAL_APP, VIRTUAL_CLIENT, VIRTUAL_SERVER];

// 兼容旧 ID 映射
const HASH_ID_TO_VIRTUAL: Record<string, string> = {
  '#ubean-pages': VIRTUAL_PAGES,
  '#ubean-app': VIRTUAL_APP,
  '#ubean-client-entry': VIRTUAL_CLIENT,
  '#ubean-server': VIRTUAL_SERVER
};

// Vite convention: \0 prefix prevents other plugins from processing virtual modules.
// We append `.ts` so Vite's esbuild parser uses the TypeScript loader — without it,
// syntax like `as const` and `export type` in the generated virtual modules fails
// to parse (esbuild defaults to the JS loader for IDs without a TS extension).
const NULL_PREFIX = '\0';
const VIRTUAL_EXT = '.ts';

function toResolvedVirtualId(virtualId: string): string {
  return NULL_PREFIX + virtualId + VIRTUAL_EXT;
}

function parseResolvedVirtualId(resolvedId: string): string | undefined {
  if (!resolvedId.startsWith(NULL_PREFIX)) return undefined;
  const withoutPrefix = resolvedId.slice(NULL_PREFIX.length);
  if (!withoutPrefix.endsWith(VIRTUAL_EXT)) return undefined;
  const virtualId = withoutPrefix.slice(0, -VIRTUAL_EXT.length);
  return VIRTUAL_IDS.includes(virtualId) ? virtualId : undefined;
}

function localeVueParamFromConfig(config: UbeanResolvedConfig): string | undefined {
  if (config.i18n?.enabled === false) return undefined;
  const codes = (config.i18n?.locales || []).map(l => l.code);
  if (codes.length === 0) return undefined;
  const param = getVueLocaleParam({
    defaultLocale: config.i18n.defaultLocale,
    locales: codes,
    strategy: config.i18n.strategy
  });
  return param || undefined;
}

export function ubeanVite(options: UbeanViteOptions): Plugin[] {
  const { config: ubeanConfig } = options;
  const virtualRegistry = useVirtualRegistry();
  const srcDir = join(ubeanConfig.rootDir, ubeanConfig.srcDir);
  const dtsDir = join(ubeanConfig.rootDir, '.ubean');
  const markdownEnabled = ubeanConfig.markdown?.enabled !== false;
  const mdxEnabled = ubeanConfig.markdown?.mdx === true;
  const autoImportEnabled = ubeanConfig.imports.autoImport !== false;
  const componentAutoImportEnabled = ubeanConfig.components.autoImport !== false;
  const markdownComponentsAutoImport = ubeanConfig.markdown?.components?.autoImport !== false;
  const directoryAsNamespace = ubeanConfig.components.directoryAsNamespace ?? false;

  const composablesDirName = ubeanConfig.dir.composables || 'composables';
  const componentsDirName = ubeanConfig.dir.components || 'components';
  const composablesDirs = [join(srcDir, composablesDirName), ...(ubeanConfig.imports.dirs || [])];
  const componentsDirs = [join(srcDir, componentsDirName), ...(ubeanConfig.components.dirs || [])];

  const mdExtensions = mdxEnabled ? ['md', 'mdx'] : ['md'];

  function getVirtualModule(virtualId: string) {
    return virtualRegistry.getModules().find(m => m.id === virtualId);
  }

  async function loadVirtualModule(virtualId: string): Promise<string | undefined> {
    const mod = getVirtualModule(virtualId);
    if (!mod) return undefined;
    return mod.load();
  }

  async function scanAndRegister() {
    const result = await scanProject({
      cwd: ubeanConfig.rootDir,
      srcDir: ubeanConfig.srcDir,
      dirs: ubeanConfig.dir,
      ignore: ubeanConfig.scanOptions?.ignore
    });

    virtualRegistry.register(
      createVuePagesVirtualModule(
        result.pages,
        result.layouts,
        result.notFoundPage,
        result.loadingPage,
        result.errorPage,
        localeVueParamFromConfig(ubeanConfig)
      )
    );
    virtualRegistry.register(createVueAppEntryVirtualModule(result.appEntry));
    virtualRegistry.register(createServerEntryVirtualModule(result.serverEntry));
    virtualRegistry.register(createClientEntryVirtualModule());
  }

  const HASH_IDS = Object.keys(HASH_ID_TO_VIRTUAL);

  const corePlugin: Plugin = {
    name: 'ubean:vue',
    enforce: 'pre',

    async buildStart() {
      await scanAndRegister();
    },

    resolveId(id, importer, opts) {
      // 兼容旧 #ubean-xxx ID
      if (HASH_ID_TO_VIRTUAL[id]) {
        return toResolvedVirtualId(HASH_ID_TO_VIRTUAL[id]);
      }
      // virtual:ubean-xxx ID — resolve with \0 prefix + `.ts` so Vite parses
      // the generated TypeScript content with the proper loader.
      if (VIRTUAL_IDS.includes(id)) {
        return toResolvedVirtualId(id);
      }
      // Client must never load the ALS / `@intlify/core` entry.
      if (id === '@ubean/i18n' && !opts?.ssr) {
        return this.resolve('@ubean/i18n/browser', importer, { skipSelf: true, ...opts });
      }
      return undefined;
    },

    async load(id) {
      const virtualId = parseResolvedVirtualId(id);
      if (virtualId) {
        let code = await loadVirtualModule(virtualId);
        if (code && TS_VIRTUAL_IDS.includes(virtualId)) {
          // Use Vite's transformWithOxc to strip TypeScript types for SSR compatibility
          const result = await transformWithOxc(code, `${virtualId}.ts`);
          code = result.code;
        }
        return code;
      }
      return undefined;
    },

    config() {
      const require = createRequire(import.meta.url);
      let vueI18nEntry = 'vue-i18n';
      let intlifyCoreEntry = '@intlify/core';
      let intlifyBaseEntry = '@intlify/core-base';
      try {
        vueI18nEntry = require.resolve('vue-i18n/dist/vue-i18n.esm-bundler.js');
      } catch {
        try {
          vueI18nEntry = require.resolve('vue-i18n');
        } catch {
          /* keep specifier */
        }
      }
      try {
        intlifyCoreEntry = require.resolve('@intlify/core/dist/core.node.mjs');
      } catch {
        /* keep specifier */
      }
      try {
        intlifyBaseEntry = require.resolve('@intlify/core-base/dist/core-base.mjs');
      } catch {
        /* keep specifier */
      }
      const singleton = ssrSingletonDevPolicy();
      return {
        appType: 'custom',
        resolve: {
          ...singleton.resolve,
          alias: {
            'vue-i18n': vueI18nEntry,
            '@intlify/core': intlifyCoreEntry,
            '@intlify/core-base': intlifyBaseEntry
          }
        },
        optimizeDeps: {
          exclude: [...singleton.optimizeDeps.exclude, ...VIRTUAL_IDS, ...HASH_IDS],
          include: singleton.optimizeDeps.include
        },
        ssr: singleton.ssr
      };
    },

    transformIndexHtml(html, ctx) {
      // DevTools SPA is served pre-built via DTK's `hostStatic` and has its
      // own entry — skip injecting the main app's client entry there.
      if (ctx?.path?.includes('_devtools')) {
        return html;
      }
      let result = html;
      // P9-21: Inject color mode no-FOUC script as the first element in <head>
      // so the correct class/attribute is set before the browser paints.
      const colorModeConfig = ubeanConfig.colorMode;
      if (colorModeConfig !== false) {
        const script = getColorModeScript(resolveColorModeConfig(colorModeConfig));
        result = result.replace('<head>', `<head>\n    ${script}`);
      }
      // P9-22: Inject Partytown config script when enabled.
      // Partytown must be configured before third-party scripts that use
      // `type="text/partytown"` so it can intercept them and run in a Web Worker.
      const partyTownConfig = ubeanConfig.partyTown;
      if (partyTownConfig !== false && partyTownConfig !== undefined) {
        const resolved = resolvePartyTownConfig(partyTownConfig === true ? { enabled: true } : partyTownConfig);
        if (resolved.enabled) {
          const script = getPartyTownScript(resolved);
          if (script) {
            result = result.replace('</head>', `    ${script}\n</head>`);
          }
        }
      }
      // Inject the resolved favicon if the user hasn't declared any
      // <link rel="icon"> of their own. Reads config.favicon — the same
      // value the SSR shell uses — so the dev HTML stays in sync with the
      // prerendered output. Null (favicon: false or none found) injects
      // nothing. Users override by adding their own link or via definePage().
      if (!/<link\b[^>]*rel=["']icon["']/i.test(result)) {
        const faviconLink = renderFaviconLink(ubeanConfig.favicon ?? undefined);
        if (faviconLink) {
          result = result.replace('<head>', `<head>\n    ${faviconLink}`);
        }
      }
      if (result.includes(CLIENT_ENTRY_URL) || result.includes(VIRTUAL_CLIENT)) return result;
      return result.replace('</body>', `  <script type="module" src="${CLIENT_ENTRY_URL}"></script>\n</body>`);
    },

    configureServer(server) {
      const watchDirs = ['pages', 'layouts', 'app'];

      for (const dir of watchDirs) {
        server.watcher.add(join(srcDir, dir));
      }

      async function handleFileChange(file: string) {
        const rel = file.replace(`${srcDir}/`, '');
        const isAppFile = /^app(\.(server|client))?\.(ts|js|mjs|mts)$/.test(rel);
        const isServerFile = /^server(\.(dev|prod))?\.(ts|js|mjs|mts)$/.test(rel);
        const isMarkdownFile = new RegExp(`\\.(${mdExtensions.join('|')})$`).test(rel);
        if (isAppFile || isServerFile || watchDirs.some(d => rel.startsWith(`${d}/`)) || isMarkdownFile) {
          await scanAndRegister();
          for (const vid of VIRTUAL_IDS) {
            const mod = server.moduleGraph.getModuleById(toResolvedVirtualId(vid));
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
            }
          }
          server.ws.send({ type: 'full-reload' });
        }
      }

      server.watcher.on('add', handleFileChange);
      server.watcher.on('unlink', handleFileChange);
      server.watcher.on('change', handleFileChange);
    }
  };

  const plugins: Plugin[] = [corePlugin];

  if (ubeanConfig.i18n?.enabled !== false) {
    plugins.push(
      VueI18nPlugin({
        include: [join(srcDir, 'locales/**')],
        ssr: true,
        compositionOnly: true,
        runtimeOnly: false
      }) as Plugin
    );
  }

  if (markdownEnabled) {
    const markdownOptions = {
      ...ubeanConfig.markdown?.markdownExit,
      html: true
    };

    plugins.push(
      Markdown({
        markdownOptions,
        wrapperClasses: ubeanConfig.markdown?.wrapperClass ?? 'markdown-body',
        headEnabled: true,
        headField: 'head'
      }) as Plugin
    );
  }

  // P9-20: MDX real compilation plugin
  if (mdxEnabled) {
    plugins.push(
      ubeanMdxPlugin({
        remarkPlugins: ubeanConfig.markdown?.remarkPlugins || [],
        rehypePlugins: ubeanConfig.markdown?.rehypePlugins || []
      }) as Plugin
    );
  }

  if (autoImportEnabled) {
    plugins.push(
      AutoImport({
        imports: [UBEAN_CLIENT_PRESET as InlinePreset, UBEAN_SERVER_PRESET as InlinePreset],
        dirs: composablesDirs,
        dts: join(dtsDir, 'auto-imports.d.ts'),
        vueTemplate: true,
        eslintrc: { enabled: false }
      }) as Plugin
    );
  }

  const UBEAN_BUILTIN_COMPONENTS = ['Link', 'Head', 'PageView'];

  function ubeanComponentsResolver(componentName: string) {
    if (UBEAN_BUILTIN_COMPONENTS.includes(componentName)) {
      return { name: componentName, from: 'ubean/client' };
    }
  }

  // Merge built-in resolver with any registered by extension modules (e.g. UiResolver from @ubean/integrations/ui)
  // Use a dynamic resolver that reads from the registry at resolution time, so that
  // resolvers registered by built-in modules (loaded later via resolveModules) are picked up.
  const dynamicResolvers = [
    ubeanComponentsResolver,
    (name: string) => {
      for (const resolver of getComponentResolvers()) {
        const result = typeof resolver === 'function' ? resolver(name) : resolver.resolve(name);
        if (result) return result;
      }
      return undefined;
    }
  ];

  if (componentAutoImportEnabled) {
    const extensions = ['vue'];
    const includePatterns = [/\.vue$/, /\.vue\?vue/];

    if (markdownEnabled && markdownComponentsAutoImport) {
      extensions.push(...mdExtensions);
      includePatterns.push(/\.md$/);
      if (mdxEnabled) includePatterns.push(/\.mdx$/);
    }

    plugins.push(
      Components({
        dirs: componentsDirs,
        extensions,
        include: includePatterns,
        directoryAsNamespace,
        dts: join(dtsDir, 'components.d.ts'),
        deep: true,
        resolvers: dynamicResolvers
      }) as Plugin
    );
  } else {
    plugins.push(
      Components({
        dts: true,
        resolvers: dynamicResolvers
      }) as Plugin
    );
  }

  // P9-26: Pagefind post-build indexing plugin.
  // Runs the Pagefind CLI after the build completes to index generated HTML
  // files. The browser-side `useSearch()` composable loads the generated
  // `/pagefind/pagefind-modern.js` at runtime.
  const searchConfig = ubeanConfig.search;
  if (searchConfig !== false && searchConfig !== undefined) {
    plugins.push({
      name: 'ubean:pagefind',
      apply: 'build',
      closeBundle() {
        // Lazy-load node:child_process and node:path to avoid pulling them
        // into the dev server bundle unnecessarily.
        return runPagefindIndexing(ubeanConfig, searchConfig);
      }
    });
  }

  return plugins;
}

/**
 * P9-26: Run the Pagefind CLI to index built HTML files.
 *
 * Spawns `npx pagefind --site <dir>` after the build. If the `pagefind`
 * package is not installed, prints a helpful warning instead of failing.
 */
async function runPagefindIndexing(
  ubeanConfig: UbeanResolvedConfig,
  searchConfig: NonNullable<UbeanResolvedConfig['search']>
): Promise<void> {
  const { spawn } = await import('node:child_process');
  const { resolve } = await import('node:path');

  const isObjectConfig = typeof searchConfig === 'object';
  const enabled = isObjectConfig ? searchConfig.enabled !== false : true;

  if (!enabled) return;

  // Determine the site directory (where HTML files are output).
  const outDir = isObjectConfig && searchConfig.site ? searchConfig.site : 'dist';

  const indexPath = isObjectConfig && searchConfig.indexPath ? searchConfig.indexPath : 'pagefind';

  const verbose = isObjectConfig && searchConfig.verbose === true;

  const sitePath = resolve(ubeanConfig.rootDir, outDir);

  const args = ['pagefind', '--site', sitePath, '--output-subdir', indexPath];

  if (isObjectConfig && searchConfig.glob) {
    args.push('--glob', searchConfig.glob);
  }

  if (isObjectConfig && searchConfig.excludeSelectors) {
    for (const selector of searchConfig.excludeSelectors) {
      args.push('--exclude-selectors', selector);
    }
  }

  if (verbose) {
    args.push('--verbose');
  }

  return new Promise<void>(resolvePromise => {
    const child = spawn('npx', args, {
      stdio: 'inherit',
      cwd: ubeanConfig.rootDir,
      shell: true
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT' || /not found/i.test(err.message)) {
        console.warn(
          '[ubean:pagefind] Pagefind CLI not found. Install it with `pnpm add -D pagefind` to enable full-text search.'
        );
      } else {
        console.error('[ubean:pagefind] Failed to run Pagefind:', err.message);
      }
      resolvePromise();
    });

    child.on('exit', code => {
      if (code === 0) {
        console.log('[ubean:pagefind] Search index generated successfully.');
      } else {
        console.warn(`[ubean:pagefind] Pagefind exited with code ${code}. Search index may be incomplete.`);
      }
      resolvePromise();
    });
  });
}

export default ubeanVite;
