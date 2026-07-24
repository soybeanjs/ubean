import type { Plugin } from 'vite';
import Components from 'unplugin-vue-components/vite';
import Markdown from 'unplugin-vue-markdown/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { join } from 'pathe';
import type { InlinePreset } from 'unimport';
import type { ResolvedConfig as UbeanResolvedConfig } from '../config/types';
import { UBEAN_CLIENT_PRESET, UBEAN_SERVER_PRESET } from '../auto-imports';
import { useVirtualRegistry } from '../build/virtual/registry';
import { scanProject } from '../routing/scan';
import {
  createVuePagesVirtualModule,
  createVueAppEntryVirtualModule,
  createClientEntryVirtualModule,
  createServerEntryVirtualModule
} from './virtual-modules';

export interface UbeanVuePluginOptions {
  config: UbeanResolvedConfig;
  ssr?: boolean;
}

export const VUE_PLUGIN_INCLUDE = [/\.vue$/, /\.md$/];

const VIRTUAL_PAGES = 'virtual:ubean-pages';
const VIRTUAL_APP = 'virtual:ubean-app';
const VIRTUAL_CLIENT = 'virtual:ubean-client-entry';
const VIRTUAL_SERVER = 'virtual:ubean-server';
const CLIENT_ENTRY_URL = `/@id/${VIRTUAL_CLIENT}`;

const VIRTUAL_IDS = [VIRTUAL_PAGES, VIRTUAL_APP, VIRTUAL_CLIENT, VIRTUAL_SERVER];

// 兼容旧 ID 映射
const HASH_ID_TO_VIRTUAL: Record<string, string> = {
  '#ubean-pages': VIRTUAL_PAGES,
  '#ubean-app': VIRTUAL_APP,
  '#ubean-client-entry': VIRTUAL_CLIENT
};

// Vite convention: \0 prefix prevents other plugins from processing virtual modules
// and signals Vite to auto-detect TypeScript syntax regardless of file extension.
const NULL_PREFIX = '\0';

export function ubeanVuePlugin(_options: UbeanVuePluginOptions): Plugin[] {
  const { config: ubeanConfig } = _options;
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

    virtualRegistry.register(createVuePagesVirtualModule(result.pages, result.layouts));
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

    resolveId(id) {
      // 兼容旧 #ubean-xxx ID
      if (HASH_ID_TO_VIRTUAL[id]) {
        return NULL_PREFIX + HASH_ID_TO_VIRTUAL[id];
      }
      // virtual:ubean-xxx ID — resolve with \0 prefix so Vite auto-detects TS
      if (VIRTUAL_IDS.includes(id)) {
        return NULL_PREFIX + id;
      }
      return undefined;
    },

    async load(id) {
      if (id.startsWith(NULL_PREFIX)) {
        const virtualId = id.slice(NULL_PREFIX.length);
        if (VIRTUAL_IDS.includes(virtualId)) {
          return loadVirtualModule(virtualId);
        }
      }
      return undefined;
    },

    config() {
      return {
        appType: 'custom',
        optimizeDeps: {
          exclude: ['ubean', ...VIRTUAL_IDS, ...HASH_IDS]
        },
        ssr: {
          noExternal: ['ubean']
        }
      };
    },

    transformIndexHtml(html, ctx) {
      // DevTools SPA is served pre-built via DTK's `hostStatic` and has its
      // own entry — skip injecting the main app's client entry there.
      if (ctx?.path?.includes('_devtools')) {
        return html;
      }
      if (html.includes(CLIENT_ENTRY_URL) || html.includes(VIRTUAL_CLIENT)) return html;
      return html.replace('</body>', `  <script type="module" src="${CLIENT_ENTRY_URL}"></script>\n</body>`);
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
            const mod = server.moduleGraph.getModuleById(NULL_PREFIX + vid);
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

  if (markdownEnabled) {
    const markdownOptions = {
      ...ubeanConfig.markdown?.markdownExit,
      html: true
    };

    plugins.push(
      Markdown({
        markdownOptions,
        wrapperClasses: 'markdown-body',
        headEnabled: true,
        headField: 'head'
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

  const UBEAN_BUILTIN_COMPONENTS = ['Link', 'Head'];

  function ubeanComponentsResolver(componentName: string) {
    if (UBEAN_BUILTIN_COMPONENTS.includes(componentName)) {
      return { name: componentName, from: 'ubean/runtime/vue' };
    }
  }

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
        resolvers: [ubeanComponentsResolver]
      }) as Plugin
    );
  } else {
    plugins.push(
      Components({
        dts: false,
        resolvers: [ubeanComponentsResolver]
      }) as Plugin
    );
  }

  return plugins;
}
